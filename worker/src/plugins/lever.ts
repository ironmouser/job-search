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
import { replaceValue } from '../utils/form-commit';

/**
 * LeverPlugin — automation plugin for Lever ATS.
 *
 * Detection signals:
 *  - Hostname: jobs.lever.co, *.lever.co
 *  - HTML: .postings-group, .posting-page
 *  - JS: lever-co.js
 *
 * URL patterns:
 *  - Job listing:  https://jobs.lever.co/{company}/{jobId}
 *  - Apply form:   https://jobs.lever.co/{company}/{jobId}/apply
 *
 * Navigation note:
 *  Lever's apply page uses a React SPA with persistent connections (WebSocket/
 *  long-poll). We navigate with `domcontentloaded` and then wait for a specific
 *  form selector — never `networkidle`, which will always timeout.
 *
 * Application flow:
 *  1. prepare()  — Navigate to apply URL (or click Apply from listing); wait for form
 *  2. apply()    — Fill name/email/phone/company/LinkedIn, upload resume + cover letter,
 *                  answer custom questions
 *  3. validate() — Check for .error-text visibility
 *  4. finalize() — Submit (live) or stop at review (simulation)
 */
export class LeverPlugin extends ATSPlugin {
  readonly platform = ATSPlatform.LEVER;
  readonly displayName = 'Lever';

  // ─── Detection ────────────────────────────────────────────────────────────

  detect(url: string, html: string, redirectChain: string[]): ATSDetectionResult {
    let confidence = 0;
    const detectedFeatures: string[] = [];
    const allUrls = [url, ...redirectChain];

    for (const u of allUrls) {
      try {
        const hostname = new URL(u).hostname;
        if (hostname === 'jobs.lever.co' || hostname.endsWith('.lever.co')) {
          confidence += 85;
          detectedFeatures.push('hostname:lever.co');
          break;
        }
      } catch {}
    }

    if (html.includes('postings-group') || html.includes('posting-page')) {
      confidence += 10;
      detectedFeatures.push('html:.postings-group');
    }
    if (html.includes('lever-co.js') || html.toLowerCase().includes('lever')) {
      confidence += 5;
      detectedFeatures.push('js:lever-co.js');
    }

    return {
      platform: ATSPlatform.LEVER,
      confidence: Math.min(confidence, 100),
      detectedFeatures,
      automationSupported: true,
    };
  }

  // ─── Prepare ──────────────────────────────────────────────────────────────

  async prepare(browser: BrowserSession, context: WorkflowContext, logger: ExecutionLogger): Promise<void> {
    const page = browser.page;
    await logger.info('plugin_loaded', `Lever plugin active — navigating to ${context.jobUrl}`);

    // Determine whether we already have the /apply URL or need to navigate there.
    // Lever apply URLs end in /apply (optionally with query params).
    const applyUrl = this.toApplyUrl(context.jobUrl);

    // Use domcontentloaded — Lever's SPA keeps persistent connections that prevent networkidle
    await browser.navigate(applyUrl, 'domcontentloaded');
    await logger.info('page_navigated', `Navigated to Lever apply page: ${applyUrl}`);
    await this.dismissCookieBannerIfPresent(page, logger);

    // If we landed on the job listing instead of the apply form, click the Apply button
    const currentUrl = page.url();
    if (!currentUrl.includes('/apply')) {
      const applyBtnSelectors = [
        'a.postings-btn',
        'a[href*="/apply"]',
        'button:has-text("Apply")',
        'a:has-text("Apply for this job")',
      ];

      let clicked = false;
      for (const sel of applyBtnSelectors) {
        const btn = page.locator(sel).first();
        if (await btn.count() > 0) {
          await btn.click();
          clicked = true;
          await logger.info('apply_button_clicked', `Clicked apply button via: ${sel}`);
          // Wait for the apply form to load after click
          await page.waitForTimeout(2000);
          break;
        }
      }

      if (!clicked) {
        await this.checkClosedJob(browser, logger, currentUrl);
        throw new InterventionError(
          InterventionReason.UNEXPECTED_PAGE,
          'Could not find the Apply button on this Lever job listing.',
          currentUrl
        );
      }
    }

    // Wait for the Lever application form to be present in the DOM.
    // Lever wraps the form in .application-form or form[action*="lever"]
    const formSelectors = [
      'form.application-form',
      'form[action*="lever"]',
      '.application--wrapper form',
      '#application-form',
      'form',
    ];

    let formFound = false;
    for (const sel of formSelectors) {
      try {
        await page.waitForSelector(sel, { timeout: 20_000 });
        formFound = true;
        await logger.info('form_located', `Lever application form found via: ${sel}`);
        break;
      } catch {
        // try next
      }
    }

    if (!formFound) {
      await this.checkClosedJob(browser, logger, page.url());
      throw new InterventionError(
        InterventionReason.UNEXPECTED_PAGE,
        'Could not locate the Lever application form. The page structure may have changed.',
        page.url()
      );
    }
  }

  // ─── Apply ────────────────────────────────────────────────────────────────

  async apply(browser: BrowserSession, context: WorkflowContext, logger: ExecutionLogger): Promise<void> {
    const page = browser.page;
    const profile = context.userProfile;

    // ── Standard personal & URL fields ───────────────────────────────────────
    await this.autofillStandardFields(page, profile, logger, context);

    // "Current company / organization" field specific to Lever (input[name="org"])
    const orgField = page.locator('input[name="org"]').first();
    if (await orgField.count() > 0) {
      const companyVal = (profile as any).currentCompany || (profile.customAnswers && (profile.customAnswers['Current Company'] || profile.customAnswers['current_company'] || profile.customAnswers['company'] || profile.customAnswers['Company']));
      if (companyVal) {
        await replaceValue(orgField, String(companyVal).trim());
        await logger.info('field_filled', `Filled Lever org field: ${companyVal}`);
      }
    }

    // ── Resume upload ────────────────────────────────────────────────────────
    await this.uploadResumeFile(browser, page, context, logger, {
      specificSelectors: [
        'input[name="resume"]',
        'input[type="file"][name*="resume"]',
      ],
    });

    // ── Cover letter upload (optional) ───────────────────────────────────────
    if (context.coverLetterMarkdown) {
      await this.uploadCoverLetterFile(browser, page, context, logger, {
        specificSelectors: [
          'input[name="coverLetter"]',
          'input[name="cover_letter"]',
        ],
        specificTextAreaSelectors: [
          'textarea[name="comments"]',
          'textarea[name*="cover" i]',
        ],
      });
    }

    // ── Custom questions & Demographics ─────────────────────────────────────
    await this.answerCustomQuestions(browser, context, logger);
    await this.handleConsentCheckboxes(page, logger);
    await this.handleEEOCDemographics(page, profile, logger);

    // ── Universal AI question resolver for custom & screening questions ───
    await UniversalQuestionResolver.resolveAndFillQuestions(
      page,
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
    const page = browser.page;
    const issues: string[] = [];

    // Lever renders validation errors as .error-text or [data-qa="error"]
    const errorSelectors = [
      '.error-text:visible',
      '[data-qa="error"]',
      '.field-error',
      '.form-error',
    ];

    for (const sel of errorSelectors) {
      const els = await page.locator(sel).all();
      for (const el of els) {
        const text = await el.textContent();
        if (text?.trim()) issues.push(text.trim());
      }
    }

    if (issues.length > 0) {
      await logger.warn('validation_issues', `${issues.length} validation issue(s)`, { issues });
    } else {
      await logger.info('validation_passed', 'Lever application form validated — ready to submit');
    }

    return { valid: issues.length === 0, issues };
  }

  // ─── Finalize ─────────────────────────────────────────────────────────────

  async finalize(
    browser: BrowserSession,
    context: WorkflowContext,
    logger: ExecutionLogger
  ): Promise<WorkflowResult> {
    const page = browser.page;

    if (context.simulationMode) {
      await logger.info(
        'simulation_complete',
        'Simulation mode — stopping before submit. Lever application is ready.'
      );
      return {
        status: AutoApplyStatus.SIMULATED,
        canComplete: true,
        platform: ATSPlatform.LEVER,
        automationConfidence: 88,
        stepsCompleted: 5,
        stepsRemaining: 1,
        blockingIssue: null,
        estimatedSubmissionTime: '5 seconds',
      };
    }

    // Live mode — click submit.
    // No Lever-specific semantic class is known, so Tier 1 is skipped and the
    // base-class helper falls through to type="submit", then fuzzy/text tiers.
    const submitBtn = await this.findSubmitButton(page, logger);

    if (!submitBtn) {
      throw new InterventionError(
        InterventionReason.UNEXPECTED_PAGE,
        'Could not find the submit button on the Lever application form.'
      );
    }

    await submitBtn.click();

    // Verify post-submission status (checks for confirmation, anti-bot challenges, limits, and form error banners)
    await this.verifyPostSubmission(browser, page, logger, {
      platformDisplayName: 'Lever',
      expectedUrlKeywords: ['/thanks', '/confirmation'],
      confirmationKeywords: [
        'application submitted',
        'thank you for applying',
        'successfully submitted',
        'your application has been submitted',
      ],
      errorSelectors: ['[role="alert"]', '.application-error', '.error-message'],
      maxWaitMs: 8000,
    });

    return {
      status: AutoApplyStatus.APPLIED,
      canComplete: true,
      platform: ATSPlatform.LEVER,
      automationConfidence: 88,
      stepsCompleted: 6,
      stepsRemaining: 0,
      blockingIssue: null,
      estimatedSubmissionTime: null,
    };
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  /**
   * Ensure the URL points to the /apply path.
   * Input can be a job listing URL or already an apply URL.
   */
  private toApplyUrl(url: string): string {
    try {
      const parsed = new URL(url);
      // Strip query params for the path check, then re-append
      const pathWithoutTrailingSlash = parsed.pathname.replace(/\/$/, '');
      if (!pathWithoutTrailingSlash.endsWith('/apply')) {
        parsed.pathname = pathWithoutTrailingSlash + '/apply';
      }
      return parsed.toString();
    } catch {
      // Malformed URL — return as-is and let navigation fail naturally
      return url;
    }
  }

  /**
   * Fill a text input if it exists; log and skip silently if not found.
   */
  private async fillInput(
    page: import('playwright').Page,
    selector: string,
    value: string,
    logger: ExecutionLogger,
    fieldName: string
  ): Promise<void> {
    const el = page.locator(selector).first();
    if (await el.count() > 0 && value) {
      await this.typeHumanized(page, el, value);
      await logger.info('field_filled', `Field "${fieldName}" populated`);
    }
  }

  /**
   * Answer Lever custom questions.
   * Lever wraps each custom question in an .application-question container
   * with a label and various input types.
   */
  private async answerCustomQuestions(
    browser: BrowserSession,
    context: WorkflowContext,
    logger: ExecutionLogger
  ): Promise<void> {
    const page = browser.page;
    const profile = context.userProfile;

    const questionContainers = await page
      .locator('.application-question, .custom-question')
      .all();

    for (const container of questionContainers) {
      const labelEl = container.locator('label, .question-label, legend, .text').first();
      let label = '';
      if (await labelEl.count() > 0) {
        label = (await labelEl.textContent({ timeout: 1500 }).catch(() => ''))?.toLowerCase().trim() ?? '';
      }
      if (!label) {
        label = (await container.textContent({ timeout: 1000 }).catch(() => ''))?.toLowerCase().trim() ?? '';
      }

      // Radio buttons — work auth and sponsorship
      const radios = container.locator('input[type="radio"]');
      if (await radios.count() > 0) {
        if (
          label.includes('authorized') ||
          label.includes('eligible to work') ||
          label.includes('legally permitted')
        ) {
          if (profile.usWorkAuthorization) {
            const isYes = profile.usWorkAuthorization.toLowerCase() === 'yes';
            const targetRegex = isYes ? /^yes$/i : /^no$/i;
            const targetLabel = container.locator('label').filter({ hasText: targetRegex }).first();
            if (await targetLabel.count() > 0) {
              await targetLabel.click();
              await logger.info('question_answered', `Work authorization: ${profile.usWorkAuthorization}`);
            }
          }
        } else if (label.includes('sponsorship') || label.includes('visa')) {
          if (profile.visaSponsorship) {
            const isYes = profile.visaSponsorship.toLowerCase() === 'yes';
            const targetRegex = isYes ? /^yes$/i : /^no$/i;
            const targetLabel = container.locator('label').filter({ hasText: targetRegex }).first();
            if (await targetLabel.count() > 0) {
              await targetLabel.click();
              await logger.info('question_answered', `Visa sponsorship required: ${profile.visaSponsorship}`);
            }
          }
        }
        continue;
      }

      // Textareas — skip; these are usually open-ended and left blank
      const textarea = container.locator('textarea').first();
      if (await textarea.count() > 0) {
        await logger.info('question_skipped', `Open-text question skipped: "${label.substring(0, 60)}"`);
        continue;
      }

      // Select dropdowns
      const select = container.locator('select').first();
      if (await select.count() > 0) {
        await logger.info('question_skipped', `Dropdown question skipped — requires manual selection: "${label.substring(0, 60)}"`);
      }
    }
  }
}

pluginRegistry.register(new LeverPlugin());
