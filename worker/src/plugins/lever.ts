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

    // ── Standard personal fields ─────────────────────────────────────────────
    await this.fillInput(page, 'input[name="name"]', profile.name, logger, 'name');
    await this.fillInput(page, 'input[name="email"]', profile.email, logger, 'email');

    if (profile.phone) {
      await this.fillInput(page, 'input[name="phone"]', profile.phone, logger, 'phone');
    }

    // "Current company / organization" — use location as fallback if no company in profile
    const orgField = page.locator('input[name="org"]').first();
    if (await orgField.count() > 0) {
      // We don't have a dedicated company field in UserProfile; leave blank rather than guess.
      await logger.info('field_skipped', 'Org field present but no current company in profile — leaving blank');
    }

    // ── URL fields ───────────────────────────────────────────────────────────
    if (profile.linkedinUrl) {
      const linkedinSelectors = [
        'input[name="urls[LinkedIn]"]',
        'input[name="urls[linkedin]"]',
        'input[placeholder*="LinkedIn"]',
      ];
      for (const sel of linkedinSelectors) {
        const el = page.locator(sel).first();
        if (await el.count() > 0) {
          await el.fill(profile.linkedinUrl);
          await logger.info('field_filled', 'LinkedIn URL populated');
          break;
        }
      }
    }

    if (profile.websiteUrl) {
      const websiteSelectors = [
        'input[name="urls[Portfolio]"]',
        'input[name="urls[Website]"]',
        'input[name="urls[Github]"]',
        'input[placeholder*="Portfolio"]',
        'input[placeholder*="Website"]',
        'input[placeholder*="Github"]',
      ];
      for (const sel of websiteSelectors) {
        const el = page.locator(sel).first();
        if (await el.count() > 0) {
          await el.fill(profile.websiteUrl);
          await logger.info('field_filled', `Portfolio/website URL populated via: ${sel}`);
          break;
        }
      }
    }

    // ── Resume upload ────────────────────────────────────────────────────────
    const resumePath = await browser.writeMarkdownToPdf(
      context.resumeMarkdown,
      `resume_${context.sessionId}.pdf`
    );

    const resumeSelectors = [
      'input[name="resume"]',
      'input[type="file"][name*="resume"]',
      'input[type="file"]',
    ];

    let resumeUploaded = false;
    for (const sel of resumeSelectors) {
      const el = page.locator(sel).first();
      if (await el.count() > 0) {
        await el.setInputFiles(resumePath);
        resumeUploaded = true;
        await logger.info('resume_uploaded', `Resume uploaded via: ${sel}`);
        await page.waitForTimeout(1000);
        break;
      }
    }

    if (!resumeUploaded) {
      await logger.warn('resume_upload_skipped', 'Could not locate resume upload input on Lever form');
    }

    // ── Cover letter upload (optional) ───────────────────────────────────────
    const clField = page.locator('input[name="coverLetter"]').first();
    if (await clField.count() > 0) {
      const clPath = await browser.writeMarkdownToPdf(
        context.coverLetterMarkdown,
        `cover_letter_${context.sessionId}.pdf`
      );
      await clField.setInputFiles(clPath);
      await logger.info('cover_letter_uploaded', 'Cover letter uploaded');
      await page.waitForTimeout(1000);
    }

    // ── Custom questions ─────────────────────────────────────────────────────
    await this.answerCustomQuestions(browser, context, logger);
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

    // Live mode — click submit
    const submitSelectors = [
      'button[type="submit"]',
      'button:has-text("Submit application")',
      'input[type="submit"]',
    ];

    let submitted = false;
    for (const sel of submitSelectors) {
      const btn = page.locator(sel).first();
      if (await btn.count() > 0) {
        await btn.click();
        submitted = true;
        await logger.info('submit_clicked', `Submit button clicked via: ${sel}`);
        break;
      }
    }

    if (!submitted) {
      throw new InterventionError(
        InterventionReason.UNEXPECTED_PAGE,
        'Could not find the submit button on the Lever application form.'
      );
    }

    // Wait for confirmation — Lever redirects to a /thanks page or shows a success message
    await page.waitForTimeout(4000);
    const currentUrl = page.url();
    const bodyText = (await page.textContent('body')) ?? '';
    const confirmed =
      currentUrl.includes('/thanks') ||
      currentUrl.includes('/confirmation') ||
      bodyText.toLowerCase().includes('application submitted') ||
      bodyText.toLowerCase().includes('thank you for applying') ||
      bodyText.toLowerCase().includes('successfully submitted');

    if (!confirmed) {
      throw new InterventionError(
        InterventionReason.UNEXPECTED_PAGE,
        'No confirmation received after submitting the Lever application. Please verify it was submitted.',
        currentUrl
      );
    }

    await logger.info('confirmation_received', 'Lever application submitted successfully');

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
      await el.fill(value);
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
      const labelEl = container.locator('label, .question-label').first();
      const label = (await labelEl.textContent())?.toLowerCase().trim() ?? '';

      // Radio buttons — work auth and sponsorship
      const radios = container.locator('input[type="radio"]');
      if (await radios.count() > 0) {
        if (
          label.includes('authorized') ||
          label.includes('eligible to work') ||
          label.includes('legally permitted')
        ) {
          if (!profile.usWorkAuthorization) {
            throw new InterventionError(
              InterventionReason.UNKNOWN_QUESTION,
              `Work Authorization answer is required for: "${label.trim()}". Please provide your details.`,
              page.url()
            );
          }
          const isYes = profile.usWorkAuthorization.toLowerCase() === 'yes';
          const targetRegex = isYes ? /^yes$/i : /^no$/i;
          const targetLabel = container.locator('label').filter({ hasText: targetRegex }).first();
          if (await targetLabel.count() > 0) {
            await targetLabel.click();
            await logger.info('question_answered', `Work authorization: ${profile.usWorkAuthorization}`);
          }
        } else if (label.includes('sponsorship') || label.includes('visa')) {
          if (!profile.visaSponsorship) {
            throw new InterventionError(
              InterventionReason.UNKNOWN_QUESTION,
              `Visa Sponsorship answer is required for: "${label.trim()}". Please provide your details.`,
              page.url()
            );
          }
          const isYes = profile.visaSponsorship.toLowerCase() === 'yes';
          const targetRegex = isYes ? /^yes$/i : /^no$/i;
          const targetLabel = container.locator('label').filter({ hasText: targetRegex }).first();
          if (await targetLabel.count() > 0) {
            await targetLabel.click();
            await logger.info('question_answered', `Visa sponsorship required: ${profile.visaSponsorship}`);
          }
        } else if (label) {
          await logger.warn('unknown_question', `Unknown Lever radio question: "${label.substring(0, 100)}"`);
          throw new InterventionError(
            InterventionReason.UNKNOWN_QUESTION,
            `Lever has a question that requires your input: "${label.trim()}"`,
            page.url()
          );
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
