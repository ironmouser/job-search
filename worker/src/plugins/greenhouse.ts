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
} from '../utils/demographic-matching';

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
    for (const sel of formSelectors) {
      const el = page.locator(sel).first();
      if ((await el.count().catch(() => 0)) > 0) {
        formFound = true;
        await logger.info('form_located', `Located Greenhouse form container via: ${sel}`);
        break;
      }
    }

    if (!formFound) {
      // Some companies embed Greenhouse in an iframe — check for that
      const frames = page.frames();
      for (const frame of frames) {
        if (frame.url().includes('greenhouse.io')) {
          await logger.info('form_located', 'Greenhouse form detected inside iframe');
          formFound = true;
          break;
        }
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
    return await browser.findFormFrame([
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
      'input[type="email"]',
      'input[type="file"]',
      'form',
    ]);
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

    await submitBtn.click();

    // Verify post-submission status (checks for confirmation, anti-bot challenges, limits, and form error banners)
    await this.verifyPostSubmission(browser, page, logger, {
      platformDisplayName: 'Greenhouse',
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
      maxWaitMs: 8000,
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

      // 1. Text inputs (LinkedIn, Website, Phone, Location, etc.)
      const textInput = container.locator('input[type="text"], input[type="url"], input[type="tel"], input:not([type])').first();
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
      }

      // 2. Dropdowns: React Select or native <select>
      const hasSelect = (await container.locator('.select-shell, .select__control, select, input.select__input').count()) > 0;
      if (hasSelect) {
        let targetValue = '';

        if (
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
        } else if (label.includes('gender') || label.includes('sex')) {
          if (isTransgenderOrGenderIdentityQuestion(label)) {
            // Transgender / gender identity question — DO NOT answer with eeocGender!
            const customVal = profile.customAnswers?.[label] || profile.customAnswers?.[label.replace(/\*/g, '').trim()];
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
        } else if (label.includes('race') || label.includes('ethnicity')) {
          if (profile.skipSelfId && !profile.eeocRace) {
            await logger.info('self_id_skipped', `Skipping optional Self-ID question: "${label.substring(0, 60)}" (skipSelfId=true)`);
            continue;
          }
          targetValue = profile.eeocRace || '';
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
                  await logger.info('question_answered', `React Select answered (${targetValue}): "${label.substring(0, 50)}"`);
                }
              }
            }
          } catch (err: any) {
            await logger.warn('question_error', `Failed to answer dropdown: ${label.substring(0, 50)}`, { error: err.message });
          }
        }
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
