import { Frame, Page } from 'playwright';
import {
  ATSPlatform,
  ATSDetectionResult,
  WorkflowContext,
  WorkflowResult,
  AutoApplyStatus,
  InterventionReason,
} from '../types';
import { ATSPlugin, InterventionError } from './base-plugin';
import { BrowserSession } from '../browser-session';
import { ExecutionLogger } from '../execution-logger';
import { pluginRegistry } from '../registry';
import { UniversalQuestionResolver } from './question-resolver';
import {
  isTransgenderOrGenderIdentityQuestion,
  matchesOptionSafely,
  resolveHispanicEthnicityAnswer,
} from '../utils/demographic-matching';
import { replaceValue } from '../utils/form-commit';


/**
 * GreenhousePlugin — automation plugin for Greenhouse ATS.
 *
 * Detection signals:
 *  - Hostname: boards.greenhouse.io, *.greenhouse.io
 *  - HTML: #grnhse_app, div.opening
 *  - JS: greenhouse.js
 *  - Meta: <meta name="generator" content="Greenhouse">
 *
 * Application flow:
 *  1. prepare()  — Navigate to the job posting; wait for the form to render
 *  2. apply()    — Fill personal info, upload resume + cover letter, answer custom questions
 *  3. validate() — Confirm no inline validation errors
 *  4. finalize() — Submit (live) or stop at review (simulation)
 *
 * Greenhouse form URL pattern:
 *   https://boards.greenhouse.io/{company}/jobs/{jobId}
 *   The page embeds the application form directly (no separate /apply route).
 */
export class GreenhousePlugin extends ATSPlugin {
  readonly platform = ATSPlatform.GREENHOUSE;
  readonly displayName = 'Greenhouse';
  private formFrame: Frame | null = null;

  // ─── Detection ────────────────────────────────────────────────────────────

  detect(url: string, html: string, redirectChain: string[]): ATSDetectionResult {
    let confidence = 0;
    const detectedFeatures: string[] = [];
    const allUrls = [url, ...redirectChain];

    for (const u of allUrls) {
      try {
        const hostname = new URL(u).hostname.toLowerCase();
        if (hostname === 'boards.greenhouse.io' || hostname === 'job-boards.greenhouse.io' || hostname.endsWith('.greenhouse.io') || hostname.includes('greenhouse.io')) {
          confidence += 80;
          detectedFeatures.push('hostname:greenhouse.io');
          break;
        }
      } catch {}
    }

    if (html.includes('id="grnhse_app"') || html.includes("id='grnhse_app'")) {
      confidence += 15;
      detectedFeatures.push('html:#grnhse_app');
    }
    if (html.includes('<iframe') && html.includes('greenhouse.io')) {
      confidence += 40;
      detectedFeatures.push('iframe:greenhouse.io');
    }
    if (html.includes('div.opening') || html.includes('class="opening"')) {
      confidence += 5;
      detectedFeatures.push('html:.opening');
    }
    if (html.toLowerCase().includes('greenhouse')) {
      confidence += 5;
      detectedFeatures.push('html:greenhouse-reference');
    }
    if (html.includes('greenhouse.js')) {
      confidence += 10;
      detectedFeatures.push('js:greenhouse.js');
    }
    if (html.includes('generator" content="Greenhouse"')) {
      confidence += 10;
      detectedFeatures.push('meta:generator-greenhouse');
    }

    return {
      platform: ATSPlatform.GREENHOUSE,
      confidence: Math.min(confidence, 100),
      detectedFeatures,
      automationSupported: true,
    };
  }

  // ─── Prepare ──────────────────────────────────────────────────────────────

  async prepare(browser: BrowserSession, context: WorkflowContext, logger: ExecutionLogger): Promise<void> {
    const page = browser.page;
    await logger.info('plugin_loaded', `Greenhouse plugin active — navigating to ${context.jobUrl}`);

    this.formFrame = null;

    // Greenhouse embeds the apply form directly on the job posting page.
    // The page may lazy-load the form inside an iframe or via JS, so we wait
    // for either the direct form container or the Greenhouse iframe.
    const currentUrl = page.url();
    if (context.jobUrl && currentUrl !== context.jobUrl && !currentUrl.startsWith(context.jobUrl)) {
      await browser.navigate(context.jobUrl);
    }

    await this.dismissCookieBannerIfPresent(page, logger);
    await this.checkAccountGate(page, context.jobUrl, this.displayName, context);

    // Wait for the Greenhouse app container or the application form fields
    const formSelectors = [
      '#application_form',
      '#main_fields',
      'form#application',
      '#grnhse_app form',
      '.application--form',
      'form[action*="greenhouse" i]',
      'form[data-testid*="application" i]',
      'div[class*="application-form" i]',
      'div[id*="application-form" i]',
      '#app_body',
    ];

    let formFound = false;

    // Poll for up to 10 seconds to allow dynamically injected frames/elements to render
    const startTime = Date.now();
    while (Date.now() - startTime < 10000) {
      // 1. Check if form is embedded in any child iframe
      const frames = page.frames();
      for (const frame of frames) {
        if (frame === page.mainFrame()) continue;
        const frameUrl = frame.url().toLowerCase();
        if (frameUrl.includes('greenhouse.io') || frameUrl.includes('grnhse')) {
          this.formFrame = frame;
          formFound = true;
          await logger.info('form_located', `Greenhouse form detected inside iframe: ${frame.url()}`);
          break;
        }

        // Check if iframe contains application form elements
        for (const sel of formSelectors) {
          const el = await frame.$(sel).catch(() => null);
          if (el) {
            this.formFrame = frame;
            formFound = true;
            await logger.info('form_located', `Greenhouse form detected inside iframe via selector: ${sel}`);
            break;
          }
        }
        if (formFound) break;
      }
      if (formFound) break;

      // 2. Check if form exists directly on the main page
      for (const sel of formSelectors) {
        const el = page.locator(sel).first();
        if ((await el.count().catch(() => 0)) > 0) {
          formFound = true;
          this.formFrame = null;
          await logger.info('form_located', `Located Greenhouse form container via: ${sel}`);
          break;
        }
      }
      if (formFound) break;

      await page.waitForTimeout(1000);
    }

    if (!formFound) {
      // Check if application elements (resume, login, name fields) are reached via multi-apply search
      const multiApplyReached = await this.ensureApplicationFormReached(browser, context, logger, {
        customApplySelectors: [
          'a#apply_button',
          'a[href*="#app"]',
          'button:has-text("Apply Now")',
          'a:has-text("Apply Now")',
          'button:has-text("Apply for this job")',
          'a:has-text("Apply for this job")',
          'button:has-text("Apply")',
          'a:has-text("Apply")',
        ],
      });

      if (multiApplyReached) {
        formFound = true;
      }
    }

    if (!formFound) {
      // Check if page has general form inputs with resume upload (excluding cookie banners/nav)
      const hasInputs = await page.evaluate(() => {
        const isObstructionOrNav = (el: Element) => {
          return !!el.closest(
            '#onetrust-consent-sdk, #onetrust-banner-sdk, [id*="cookie" i], [class*="cookie" i], [aria-label*="cookie" i], [data-ui*="cookie" i], [class*="consent" i], [id*="consent" i], .didomi-popup-container, [id*="didomi" i], [class*="cookiebot" i], [id*="CybotCookiebot" i], [id*="usercentrics" i], [class*="privacy-banner" i], [id*="privacy-banner" i], header, nav, footer, [role="banner"], [role="navigation"], [role="contentinfo"], .footer, #footer, .header, #header, [class*="newsletter" i], [id*="newsletter" i], [class*="subscribe" i]'
          );
        };
        const fileInputs = Array.from(document.querySelectorAll('input[type="file"]')).filter(el => !isObstructionOrNav(el));
        const emailInputs = Array.from(document.querySelectorAll('input[type="email"], input[name*="email" i]')).filter(el => !isObstructionOrNav(el));
        return fileInputs.length > 0 && emailInputs.length > 0;
      }).catch(() => false);
      if (hasInputs) {
        formFound = true;
        await logger.info('form_located', 'Custom embedded application form detected on page');
      }
    }

    if (!formFound) {
      await this.checkClosedJob(browser, logger, page.url());
      throw new InterventionError(
        InterventionReason.UNEXPECTED_PAGE,
        'Could not locate the Greenhouse application form on this page. The form may require manual navigation.',
        page.url()
      );
    }
  }

  private async getFormContext(browser: BrowserSession): Promise<Frame | Page> {
    if (this.formFrame && !this.formFrame.isDetached()) {
      return this.formFrame;
    }

    // Check frames for Greenhouse domain
    for (const frame of browser.page.frames()) {
      if (frame === browser.page.mainFrame()) continue;
      const fUrl = frame.url().toLowerCase();
      if (fUrl.includes('greenhouse.io') || fUrl.includes('grnhse')) {
        this.formFrame = frame;
        return frame;
      }
    }

    const frameCtx = await browser.findFormFrame([
      '#application_form',
      '#main_fields',
      'form#application',
      '#grnhse_app form',
      '.application--form',
      'form[action*="greenhouse" i]',
      'form[data-testid*="application" i]',
      'div[class*="application-form" i]',
      'div[class*="ApplicationForm" i]',
      'input[name="resume"]',
      'input[name="job_application[resume]"]',
      'input[name*="first_name" i]',
      'input[name*="firstName" i]',
      'input[name*="email" i]',
      'input[type="file"]',
    ]);

    if ('page' in frameCtx) {
      this.formFrame = frameCtx;
    }

    return frameCtx;
  }

  // ─── Apply ────────────────────────────────────────────────────────────────

  async apply(browser: BrowserSession, context: WorkflowContext, logger: ExecutionLogger): Promise<void> {
    const targetContext = await this.getFormContext(browser);
    const profile = context.userProfile;

    // ── Personal information fields ──────────────────────────────────────────
    await this.fillInput(
      targetContext,
      ['#first_name', 'input[name="first_name" i]', 'input[name="firstName" i]', 'input[name*="first" i]', 'input[id*="first_name" i]'],
      profile.name.split(' ')[0] ?? '',
      logger,
      'first_name'
    );
    await this.fillInput(
      targetContext,
      ['#last_name', 'input[name="last_name" i]', 'input[name="lastName" i]', 'input[name*="last" i]', 'input[id*="last_name" i]'],
      profile.name.split(' ').slice(1).join(' ') ?? '',
      logger,
      'last_name'
    );
    await this.fillInput(
      targetContext,
      ['#email', 'input[name="email" i]', 'input[type="email"]', 'input[id*="email" i]'],
      profile.email,
      logger,
      'email'
    );

    if (profile.phone) {
      await this.fillInput(
        targetContext,
        ['#phone', 'input[name="phone" i]', 'input[type="tel"]', 'input[id*="phone" i]'],
        profile.phone,
        logger,
        'phone'
      );

      // Handle phone country dropdown if present
      try {
        const countryVal = profile.country || 'United States';
        const countryDropdown = targetContext.locator('div.select, [id*="country"], div[class*="country"]').first();
        if (await countryDropdown.count() > 0 && await countryDropdown.isVisible().catch(() => false)) {
          const reactInput = countryDropdown.locator('input.select__input, input[role="combobox"]').first();
          const control = countryDropdown.locator('.select__control, .select-shell').first();
          if (await control.count() > 0) await control.click().catch(() => null);
          if (await reactInput.count() > 0) {
            await reactInput.focus().catch(() => null);
            await this.typeHumanized(targetContext, reactInput, countryVal);
            await browser.page.keyboard.press('Enter');
            await browser.page.waitForTimeout(200);
          }
          const optionItem = targetContext.locator('.select__option, [id*="-option-"]').filter({ hasText: new RegExp(countryVal, 'i') }).first();
          if (await optionItem.count() > 0 && await optionItem.isVisible().catch(() => false)) {
            await optionItem.click().catch(() => null);
          }
        }
      } catch {}
    }

    if (profile.location) {
      await this.fillInput(
        targetContext,
        ['#job_application_location', '#location', 'input[name*="location" i]', 'input[id*="location" i]'],
        profile.location,
        logger,
        'location'
      );
    }

    if (profile.linkedinUrl) {
      const linkedinSelectors = [
        '#linkedin_profile',
        'input[name="job_application[urls][LinkedIn]"]',
        'input[placeholder*="LinkedIn"]',
        'input[aria-label*="LinkedIn"]',
      ];
      for (const sel of linkedinSelectors) {
        const el = targetContext.locator(sel);
        if (await el.count() > 0) {
          await this.typeHumanized(targetContext, el, profile.linkedinUrl);
          await logger.info('field_filled', 'LinkedIn URL populated');
          break;
        }
      }
    }

    if (profile.websiteUrl) {
      const websiteSelectors = [
        '#website',
        'input[name="job_application[urls][Website]"]',
        'input[placeholder*="Website"]',
        'input[placeholder*="Portfolio"]',
      ];
      for (const sel of websiteSelectors) {
        const el = targetContext.locator(sel);
        if (await el.count() > 0) {
          await this.typeHumanized(targetContext, el, profile.websiteUrl);
          await logger.info('field_filled', 'Website/portfolio URL populated');
          break;
        }
      }
    }

    // ── Resume upload ────────────────────────────────────────────────────────
    await this.uploadResumeFile(browser, targetContext, context, logger, {
      specificSelectors: [
        'input[name="resume"]',
        'input[name="job_application[resume]"]',
        '#resume',
        'input[type="file"][accept*="pdf"]',
      ],
    });

    // ── Cover letter upload (optional field) ─────────────────────────────────
    if (context.coverLetterMarkdown) {
      await this.uploadCoverLetterFile(browser, targetContext, context, logger, {
        specificSelectors: [
          'input[name="cover_letter"]',
          'input[name="job_application[cover_letter]"]',
          '#cover_letter',
        ],
        specificTextAreaSelectors: [
          '#cover_letter_text',
          'textarea[name*="cover" i]',
        ],
      });
    }

    // ── Custom questions & Demographics ─────────────────────────────────────
    await this.answerCustomQuestions(targetContext, browser, context, logger);
    await this.handleConsentCheckboxes(targetContext, logger);
    await this.handleEEOCDemographics(targetContext, profile, logger);

    // ── Universal AI question resolver for custom & screening questions ───
    await UniversalQuestionResolver.resolveAndFillQuestions(
      targetContext,
      browser,
      context,
      logger,
      logger.getApiClient()
    );
  }

  // ─── Validate ─────────────────────────────────────────────────────────────

  async validate(
    browser: BrowserSession,
    _context: WorkflowContext,
    logger: ExecutionLogger
  ): Promise<{ valid: boolean; issues: string[] }> {
    const targetContext = await this.getFormContext(browser);
    const issues: string[] = [];

    // Greenhouse marks invalid fields with .invalid-field or aria-invalid
    const errorSelectors = [
      '.invalid-field',
      '[aria-invalid="true"]',
      '.field_with_errors',
      'p.error',
      '.error-message',
    ];

    for (const sel of errorSelectors) {
      const els = await targetContext.locator(sel).all();
      for (const el of els) {
        const text = await el.textContent();
        if (text?.trim()) issues.push(text.trim());
      }
    }

    if (issues.length > 0) {
      await logger.warn('validation_issues', `${issues.length} validation issue(s)`, { issues });
    } else {
      await logger.info('validation_passed', 'Application validated — ready to submit');
    }

    return { valid: issues.length === 0, issues };
  }

  // ─── Finalize ─────────────────────────────────────────────────────────────

  async finalize(
    browser: BrowserSession,
    context: WorkflowContext,
    logger: ExecutionLogger
  ): Promise<WorkflowResult> {
    const targetContext = await this.getFormContext(browser);
    const page = browser.page;

    if (context.simulationMode) {
      await logger.info(
        'simulation_complete',
        'Simulation mode — stopping before submit. Application is ready.'
      );
      return {
        status: AutoApplyStatus.SIMULATED,
        canComplete: true,
        platform: ATSPlatform.GREENHOUSE,
        automationConfidence: 85,
        stepsCompleted: 5,
        stepsRemaining: 1,
        blockingIssue: null,
        estimatedSubmissionTime: '10 seconds',
      };
    }

    // Check if security code gate is present before submitting
    await this.handleSecurityCodeGate(targetContext, context, logger);

    // Live mode — click the submit button.
    const submitBtn = await this.findSubmitButton(
      targetContext,
      logger,
      [
        'input[type="submit"]#submit_app',
        '#submit_app',
        'input[type="submit"][value*="Submit" i]',
        'button[type="submit"]',
        '#submit_button',
        'button:has-text("Submit Application")',
        'button:has-text("Submit")',
      ]
    );

    if (!submitBtn) {
      throw new InterventionError(
        InterventionReason.UNEXPECTED_PAGE,
        'Could not find the submit button on the Greenhouse application form.'
      );
    }

    // Check if submit button is disabled
    const isDisabled = await submitBtn.isDisabled().catch(() => false);
    if (isDisabled) {
      // Check if disabled due to security code requirement
      await this.handleSecurityCodeGate(targetContext, context, logger);

      // If still disabled without security code, inspect unanswered required fields
      const unanswered = await (UniversalQuestionResolver as any).extractUnfilledQuestions(targetContext);
      if (unanswered && unanswered.length > 0) {
        const questionPayload = unanswered.map((u: any) => ({
          fieldKey: u.fieldKey,
          label: u.label,
          fieldType: u.type,
          options: u.options?.length > 0 ? u.options : undefined,
          required: u.required,
        }));
        throw new InterventionError(
          InterventionReason.UNKNOWN_QUESTION,
          `[QUESTION_DATA:${JSON.stringify(questionPayload)}] Greenhouse submit button is disabled — required fields need your input: ${unanswered.map((u: any) => `"${u.label.slice(0, 60)}"`).join(', ')}`,
          page.url()
        );
      }

      throw new InterventionError(
        InterventionReason.APPLICATION_FOUND_BUT_NOT_ACTIONABLE,
        'Greenhouse submit button is disabled. Please verify your application details.',
        page.url()
      );
    }

    const initialUrl = page.url();
    try {
      await submitBtn.click({ timeout: 6000 });
    } catch (clickErr: any) {
      // If click timed out because element is not enabled, re-check security code gate immediately
      await this.handleSecurityCodeGate(targetContext, context, logger);
      throw clickErr;
    }

    // Verify post-submission status (checks for confirmation, anti-bot challenges, limits, and form error banners)
    await this.verifyPostSubmission(browser, page, logger, {
      platformDisplayName: 'Greenhouse',
      initialUrl,
      confirmationSelectors: [
        '#thanks_container',
        '.thanks-container',
        '#application_confirmed',
        '.application-confirmed',
        'div#flash_notice',
      ],
      confirmationKeywords: [
        'application submitted',
        'thank you',
        'thanks for applying',
        'thanks for your interest',
        'successfully applied',
        'we have received your application',
        'your application has been received',
        'application received',
        'submitted successfully',
      ],
      errorSelectors: ['#error_explanation', '.field_with_errors', '[role="alert"]'],
      maxWaitMs: 30000,
    });

    return {
      status: AutoApplyStatus.APPLIED,
      canComplete: true,
      platform: ATSPlatform.GREENHOUSE,
      automationConfidence: 85,
      stepsCompleted: 6,
      stepsRemaining: 0,
      blockingIssue: null,
      estimatedSubmissionTime: null,
    };
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  /**
   * Scans for Greenhouse candidate email verification / security code input fields.
   * If found and an OTP code is available in profile/context, fills the field.
   * If found and no code is available, throws an InterventionError(MFA_REQUIRED).
   */
  private async handleSecurityCodeGate(
    ctx: Frame | Page,
    context: WorkflowContext,
    logger: ExecutionLogger
  ): Promise<void> {
    const securityCodeSelectors = [
      'input[name*="security_code" i]',
      'input[id*="security_code" i]',
      'input[placeholder*="security code" i]',
      'input[aria-label*="security code" i]',
      'input[name*="verification_code" i]',
      'input[id*="verification_code" i]',
      'input[placeholder*="verification code" i]',
      'input[autocomplete="one-time-code"]',
      '#candidate_security_code',
      '#security_code',
    ];

    let targetInput: import('playwright').Locator | null = null;
    for (const sel of securityCodeSelectors) {
      const loc = ctx.locator(sel).first();
      if (await loc.isVisible().catch(() => false)) {
        targetInput = loc;
        break;
      }
    }

    const page = 'page' in ctx ? ctx.page() : ctx;
    const pageText = ((await ctx.textContent('body').catch(() => '')) || '').toLowerCase();
    const hasSecurityCodePrompt =
      pageText.includes('security code') &&
      (pageText.includes('copy and paste this code') ||
       pageText.includes('enter the code') ||
       pageText.includes('resubmit your application') ||
       pageText.includes('verification code'));

    if (targetInput || hasSecurityCodePrompt) {
      const profile = context.userProfile;
      const code =
        profile.otpCode ||
        profile.customAnswers?.['security_code'] ||
        profile.customAnswers?.['security code'] ||
        profile.customAnswers?.['verification_code'] ||
        profile.customAnswers?.['verification code'] ||
        profile.customAnswers?.['otp'];

      if (code && code.trim()) {
        const cleanCode = code.trim();
        if (targetInput) {
          await replaceValue(targetInput, cleanCode).catch(() => {});
          await logger.info('security_code_filled', `Filled Greenhouse security code into form (${cleanCode.length} chars)`);
          await page.waitForTimeout(500);
        }
      } else {
        await logger.warn('security_code_required', 'Greenhouse security code required to proceed with submission');
        throw new InterventionError(
          InterventionReason.MFA_REQUIRED,
          'Greenhouse sent a security verification code to your email. Please enter the code in the intervention drawer to complete your application.',
          page.url()
        );
      }
    }
  }

  /**
   * Fill a text input if it exists; log and skip silently if not found.
   */
  private async fillInput(
    ctx: Frame | Page,
    selectorOrSelectors: string | string[],
    value: string,
    logger: ExecutionLogger,
    fieldName: string
  ): Promise<void> {
    if (!value) return;
    const selectors = Array.isArray(selectorOrSelectors) ? selectorOrSelectors : [selectorOrSelectors];
    for (const sel of selectors) {
      const el = ctx.locator(sel).first();
      if ((await el.count().catch(() => 0)) > 0 && (await el.isVisible().catch(() => true))) {
        await this.typeHumanized(ctx, el, value);
        await logger.info('field_filled', `Field "${fieldName}" populated via: ${sel}`);
        return;
      }
    }
  }

  /**
   * Iterate Greenhouse custom question fields and answer where possible.
   * Handles text inputs, radio buttons, native HTML selects, and modern React Select dropdowns.
   */
  private async answerCustomQuestions(
    ctx: Frame | Page,
    browser: BrowserSession,
    context: WorkflowContext,
    logger: ExecutionLogger
  ): Promise<void> {
    const profile = context.userProfile;

    // Greenhouse wraps question fields in .field-wrapper, .field, .custom-field, or .select__container
    const questionContainers = await ctx
      .locator('.field-wrapper, .field, .custom-field, .application--questions > div, div.select')
      .all();

    for (const container of questionContainers) {
      const labelEl = container.locator('label, legend, .field-label').first();
      let label = '';
      if (await labelEl.count() > 0) {
        label = (await labelEl.textContent({ timeout: 1500 }).catch(() => ''))?.toLowerCase().trim() ?? '';
      }
      if (!label) {
        label = (await container.textContent({ timeout: 1000 }).catch(() => ''))?.toLowerCase().trim() ?? '';
      }
      if (!label) continue;

      // 1. Dropdowns: React Select, native <select>, or custom comboboxes (MUST be evaluated before text inputs)
      const hasSelect = (await container.locator('.select-shell, .select__control, select, [role="combobox"], div.select').count()) > 0;
      if (hasSelect) {
        let targetValue = '';

        const customVal = profile.customAnswers?.[label] ||
          profile.customAnswers?.[label.replace(/\*/g, '').trim()] ||
          profile.customAnswers?.[label.replace(/\s+/g, ' ').trim()];

        if (customVal) {
          targetValue = String(customVal).trim();
        } else if (
          label.includes('authorized') ||
          label.includes('eligible to work') ||
          label.includes('legally') ||
          label.includes('remotely')
        ) {
          targetValue = profile.usWorkAuthorization || '';
        } else if (label.includes('sponsorship') || label.includes('visa')) {
          targetValue = profile.visaSponsorship || '';
        } else if (label.includes('country')) {
          targetValue = profile.country || '';
        } else if (/consent.*personal\s*information|retain.*personal\s*information|data\s*retention|gdpr/i.test(label)) {
          targetValue = 'Yes';
        } else if (/where\s*did\s*you.*(?:hear|find)|how\s*did\s*you.*(?:hear|find)|referral\s*source/i.test(label)) {
          targetValue = 'Job Board';
        } else if (label.includes('gender') || label.includes('sex')) {
          if (isTransgenderOrGenderIdentityQuestion(label)) {
            // Transgender / gender identity question — DO NOT answer with eeocGender!
            if (customVal) {
              targetValue = String(customVal).trim();
            } else {
              await logger.info('transgender_question_skipped', `Skipping gender identity question without explicit user answer: "${label.substring(0, 60)}"`);
              continue;
            }
          } else {
            if (profile.skipSelfId && !profile.eeocGender) {
              await logger.info('self_id_skipped', `Skipping optional Self-ID question: "${label.substring(0, 60)}" (skipSelfId=true)`);
              continue;
            }
            targetValue = profile.eeocGender || '';
          }
        } else if (label.includes('race') || label.includes('ethnicity') || label.includes('hispanic') || label.includes('latino')) {
          if (/hispanic|latino/i.test(label)) {
            targetValue = resolveHispanicEthnicityAnswer(profile.eeocRace, profile.skipSelfId);
          } else {
            if (profile.skipSelfId && !profile.eeocRace) {
              await logger.info('self_id_skipped', `Skipping optional Self-ID question: "${label.substring(0, 60)}" (skipSelfId=true)`);
              continue;
            }
            targetValue = profile.eeocRace || '';
          }
        } else if (label.includes('veteran')) {
          if (profile.skipSelfId && !profile.eeocVeteran) {
            await logger.info('self_id_skipped', `Skipping optional Self-ID question: "${label.substring(0, 60)}" (skipSelfId=true)`);
            continue;
          }
          targetValue = profile.eeocVeteran || '';
        } else if (label.includes('disability')) {
          if (profile.skipSelfId && !profile.eeocDisability) {
            await logger.info('self_id_skipped', `Skipping optional Self-ID question: "${label.substring(0, 60)}" (skipSelfId=true)`);
            continue;
          }
          targetValue = profile.eeocDisability || '';
        }

        if (targetValue) {
          try {
            // Check native <select> first
            const nativeSelect = container.locator('select').first();
            if (await nativeSelect.count() > 0) {
              const options = await nativeSelect.locator('option').all();
              for (const opt of options) {
                const optText = (await opt.textContent())?.trim() ?? '';
                if (matchesOptionSafely(optText, targetValue)) {
                  const val = await opt.getAttribute('value');
                  if (val) await nativeSelect.selectOption(val);
                  await logger.info('question_answered', `Dropdown answered (${targetValue}): "${label.substring(0, 50)}"`);
                  break;
                }
              }
            } else {
              // React Select (.select__control / input.select__input)
              const control = container.locator('.select__control, .select-shell').first();
              const reactInput = container.locator('input.select__input, input[role="combobox"]').first();

              if (await control.count() > 0 || await reactInput.count() > 0) {
                if (await control.count() > 0) await control.click().catch(() => null);
                await browser.page.waitForTimeout(200);

                let matchedAndClicked = false;
                const optionItems = await ctx.locator('.select__option, [id*="-option-"], [role="option"]').all();
                for (const optItem of optionItems) {
                  const text = (await optItem.textContent().catch(() => ''))?.trim() ?? '';
                  if (matchesOptionSafely(text, targetValue)) {
                    await optItem.click().catch(() => null);
                    matchedAndClicked = true;
                    break;
                  }
                }

                if (!matchedAndClicked && (await reactInput.count() > 0)) {
                  await reactInput.focus().catch(() => null);
                  await this.typeHumanized(ctx, reactInput, targetValue);
                  await browser.page.waitForTimeout(300);

                  const filteredOptions = await ctx.locator('.select__option, [id*="-option-"], [role="option"]').all();
                  for (const fOpt of filteredOptions) {
                    const text = (await fOpt.textContent().catch(() => ''))?.trim() ?? '';
                    if (matchesOptionSafely(text, targetValue)) {
                      await fOpt.click().catch(() => null);
                      matchedAndClicked = true;
                      break;
                    }
                  }
                }

                if (matchedAndClicked) {
                  await container.evaluate((node, targetAns) => {
                    const inputs = node.querySelectorAll('input, select');
                    inputs.forEach((inp: any) => {
                      try {
                        if (inp.tagName.toLowerCase() === 'select') {
                          inp.value = targetAns;
                          inp.dispatchEvent(new Event('change', { bubbles: true }));
                        } else if (inp.type === 'hidden') {
                          if (!inp.value) inp.value = targetAns;
                          inp.dispatchEvent(new Event('input', { bubbles: true }));
                          inp.dispatchEvent(new Event('change', { bubbles: true }));
                        } else {
                          inp.dispatchEvent(new Event('input', { bubbles: true }));
                          inp.dispatchEvent(new Event('change', { bubbles: true }));
                          inp.dispatchEvent(new Event('blur', { bubbles: true }));
                        }
                      } catch {}
                    });
                  }, targetValue).catch(() => null);

                  if (await reactInput.count() > 0) {
                    await reactInput.dispatchEvent('blur').catch(() => null);
                  }
                  await logger.info('question_answered', `React Select answered (${targetValue}): "${label.substring(0, 50)}"`);
                }
              }
            }
          } catch (err: any) {
            await logger.warn('question_error', `Failed to answer dropdown: ${label.substring(0, 50)}`, { error: err.message });
          }
        }
        continue;
      }


      // 2. Real text inputs (LinkedIn, Website, Phone, Location, etc.) — strictly excluding dropdown combobox inputs
      const textInput = container.locator('input[type="text"]:not(.select__input):not([role="combobox"]), input[type="url"], input[type="tel"]').first();
      if (await textInput.count() > 0 && await textInput.isVisible().catch(() => false)) {
        let answer = '';
        if (label.includes('linkedin')) {
          answer = profile.linkedinUrl ?? '';
        } else if (label.includes('website') || label.includes('portfolio') || label.includes('github')) {
          answer = profile.websiteUrl ?? '';
        } else if (label.includes('phone') && profile.phone) {
          answer = profile.phone;
        } else if ((label.includes('location') || label.includes('city')) && profile.location) {
          answer = profile.location;
        }

        if (answer) {
          const currentVal = await textInput.inputValue().catch(() => '');
          if (!currentVal) {
            await this.typeHumanized(ctx, textInput, answer);
            await logger.info('question_answered', `Custom text field populated: "${label.substring(0, 50)}"`);
          }
        }
        continue;
      }

      // 3. Radio buttons
      const radioGroup = container.locator('input[type="radio"]');
      if (await radioGroup.count() > 0) {
        if (label.includes('authorized') || label.includes('eligible to work') || label.includes('legally') || label.includes('remotely')) {
          if (!profile.usWorkAuthorization) {
            throw new InterventionError(
              InterventionReason.UNKNOWN_QUESTION,
              `Work Authorization answer is required for: "${label.trim()}". Please provide your details.`
            );
          }
          const isYes = profile.usWorkAuthorization.toLowerCase() === 'yes';
          const targetRegex = isYes ? /^yes$/i : /^no$/i;
          const targetLabel = container.locator('label').filter({ hasText: targetRegex }).first();
          const targetRadio = container.locator(`input[type="radio"][value="${isYes ? 'Yes' : 'No'}"], input[type="radio"][value="${isYes}"]`).first();
          if (await targetLabel.count() > 0) {
            await targetLabel.click().catch(() => null);
            await logger.info('question_answered', `Work auth / Remote: ${profile.usWorkAuthorization}`);
          } else if (await targetRadio.count() > 0) {
            await targetRadio.click().catch(() => null);
            await logger.info('question_answered', `Work auth / Remote: ${profile.usWorkAuthorization} (radio)`);
          }
        } else if (label.includes('sponsorship') || label.includes('visa')) {
          if (!profile.visaSponsorship) {
            throw new InterventionError(
              InterventionReason.UNKNOWN_QUESTION,
              `Visa Sponsorship answer is required for: "${label.trim()}". Please provide your details.`
            );
          }
          const isYes = profile.visaSponsorship.toLowerCase() === 'yes';
          const targetRegex = isYes ? /^yes$/i : /^no$/i;
          const targetLabel = container.locator('label').filter({ hasText: targetRegex }).first();
          if (await targetLabel.count() > 0) {
            await targetLabel.click().catch(() => null);
            await logger.info('question_answered', `Visa sponsorship required: ${profile.visaSponsorship}`);
          }
        }
      }
    }
  }
}

pluginRegistry.register(new GreenhousePlugin());
