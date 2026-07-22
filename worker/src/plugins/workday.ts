import { ATSPlatform, ATSDetectionResult, WorkflowContext, WorkflowResult, AutoApplyStatus, InterventionReason } from '../types';
import { ATSPlugin, InterventionError } from './base-plugin';
import { BrowserSession } from '../browser-session';
import { ExecutionLogger } from '../execution-logger';
import { pluginRegistry } from '../registry';

/**
 * WorkdayPlugin — automation plugin for Workday ATS.
 *
 * Detection signals:
 *  - Hostname: *.myworkdayjobs.com, *.wd1.myworkdayjobs.com, etc.
 *  - HTML: data-automation-id attributes, [data-uxi-element-id]
 *  - JS assets: workday.js, wd-ui bundle references
 *
 * Workday application flow:
 *  1. Navigate to job posting → click "Apply" button
 *  2. Create account or sign in (or continue as guest if available)
 *  3. Upload resume → system parses and pre-fills fields
 *  4. Complete work experience, education sections
 *  5. Upload cover letter
 *  6. Answer self-identification and legal questions
 *  7. Review and submit
 */
export class WorkdayPlugin extends ATSPlugin {
  readonly platform = ATSPlatform.WORKDAY;
  readonly displayName = 'Workday';

  // ─── Detection ────────────────────────────────────────────────────────────

  detect(url: string, html: string, redirectChain: string[]): ATSDetectionResult {
    let confidence = 0;
    const detectedFeatures: string[] = [];

    const allUrls = [url, ...redirectChain];

    // Hostname patterns (highest signal)
    for (const u of allUrls) {
      try {
        const hostname = new URL(u).hostname;
        if (/\.myworkdayjobs\.com$/.test(hostname)) {
          confidence += 80;
          detectedFeatures.push('hostname:myworkdayjobs.com');
          break;
        }
        if (/\.workday\.com$/.test(hostname)) {
          confidence += 60;
          detectedFeatures.push('hostname:workday.com');
          break;
        }
      } catch {
        // Invalid URL — skip
      }
    }

    // HTML signatures
    if (html.includes('data-automation-id')) {
      confidence += 15;
      detectedFeatures.push('html:data-automation-id');
    }
    if (html.includes('data-uxi-element-id')) {
      confidence += 10;
      detectedFeatures.push('html:data-uxi-element-id');
    }
    if (html.includes('workday')) {
      confidence += 5;
      detectedFeatures.push('html:workday-reference');
    }

    // JS asset references
    if (html.includes('workday.js') || html.includes('wd-ui')) {
      confidence += 10;
      detectedFeatures.push('js:workday-bundle');
    }

    return {
      platform: ATSPlatform.WORKDAY,
      confidence: Math.min(confidence, 100),
      detectedFeatures,
      automationSupported: true,
    };
  }

  // ─── Prepare ──────────────────────────────────────────────────────────────

  async prepare(
    browser: BrowserSession,
    context: WorkflowContext,
    logger: ExecutionLogger
  ): Promise<void> {
    const page = browser.page;
    await logger.info('plugin_loaded', `Workday plugin active for ${context.jobUrl}`);

    // Navigate to the job posting
    await browser.navigate(context.jobUrl);
    await logger.info('page_navigated', 'Navigated to Workday job posting');

    // Wait for and click the Apply button
    // Workday uses data-automation-id for most interactive elements
    const applySelectors = [
      '[data-automation-id="applyButton"]',
      '[data-automation-id="Apply"]',
      'a[href*="apply"]',
      'button:has-text("Apply")',
    ];

    let clicked = false;
    for (const selector of applySelectors) {
      try {
        await page.waitForSelector(selector, { timeout: 5000 });
        await page.click(selector);
        clicked = true;
        await logger.info('apply_button_clicked', `Clicked apply button via: ${selector}`);
        break;
      } catch {
        // Try next selector
      }
    }

    if (!clicked) {
      throw new InterventionError(
        InterventionReason.UNEXPECTED_PAGE,
        'Could not find Apply button on Workday job page',
        context.jobUrl
      );
    }

    // Check for login/create account page
    await page.waitForTimeout(2000);
    const pageTitle = await page.title();
    const pageUrl = page.url();

    if (
      pageUrl.includes('login') ||
      pageUrl.includes('signin') ||
      pageTitle.toLowerCase().includes('sign in')
    ) {
      throw new InterventionError(
        InterventionReason.LOGIN_REQUIRED,
        'Workday requires login. Please sign in to your Workday account in the browser window.',
        pageUrl
      );
    }

    await logger.info('form_located', 'Workday application form ready');
  }

  // ─── Apply ────────────────────────────────────────────────────────────────

  async apply(
    browser: BrowserSession,
    context: WorkflowContext,
    logger: ExecutionLogger
  ): Promise<void> {
    const page = browser.page;

    // Step 1: Upload resume
    const resumePath = await browser.writeMarkdownToPdf(
      context.resumeMarkdown,
      `resume_${context.sessionId}.pdf`
    );

    const resumeInput = page.locator('[data-automation-id="file-upload-input-ref"]').first();
    if (await resumeInput.count() > 0) {
      await resumeInput.setInputFiles(resumePath);
      await logger.info('resume_uploaded', 'Resume uploaded to Workday');
      // Wait for Workday to parse the resume
      await page.waitForTimeout(3000);
    } else {
      await logger.warn('resume_upload_skipped', 'Could not find resume upload field');
    }

    // Step 2: Fill standard fields
    await this.fillStandardFields(browser, context, logger);

    // Step 3: Handle dynamic questions
    await this.answerDynamicQuestions(browser, context, logger);

    // Step 4: Upload cover letter if field exists
    const clPath = await browser.writeMarkdownToPdf(
      context.coverLetterMarkdown,
      `cover_letter_${context.sessionId}.pdf`
    );

    const clInputs = page.locator('[data-automation-id="file-upload-input-ref"]');
    const inputCount = await clInputs.count();
    if (inputCount > 1) {
      await clInputs.nth(1).setInputFiles(clPath);
      await logger.info('cover_letter_uploaded', 'Cover letter uploaded to Workday');
    }
  }

  // ─── Validate ─────────────────────────────────────────────────────────────

  async validate(
    browser: BrowserSession,
    context: WorkflowContext,
    logger: ExecutionLogger
  ): Promise<{ valid: boolean; issues: string[] }> {
    const page = browser.page;
    const issues: string[] = [];

    // Look for Workday validation error elements
    const errorElements = await page.locator('[data-automation-id*="error"], .error-msg, [aria-invalid="true"]').all();
    for (const el of errorElements) {
      const text = await el.textContent();
      if (text?.trim()) issues.push(text.trim());
    }

    // Check if submit/next button is disabled
    const submitDisabled = await page
      .locator('[data-automation-id="bottom-navigation-next-button"]')
      .getAttribute('disabled');
    if (submitDisabled !== null) {
      issues.push('Submit button is disabled — required fields may be missing');
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
    const page = browser.page;

    if (context.simulationMode) {
      await logger.info(
        'simulation_complete',
        'Simulation mode — stopping before submit. Application is ready.'
      );
      return {
        status: AutoApplyStatus.SIMULATED,
        canComplete: true,
        platform: ATSPlatform.WORKDAY,
        automationConfidence: 90,
        stepsCompleted: 5,
        stepsRemaining: 1,
        blockingIssue: null,
        estimatedSubmissionTime: '5 seconds',
      };
    }

    // Live mode — click submit
    const submitSelectors = [
      '[data-automation-id="bottom-navigation-next-button"]',
      '[data-automation-id="submit-button"]',
      'button:has-text("Submit")',
    ];

    let submitted = false;
    for (const selector of submitSelectors) {
      const btn = page.locator(selector);
      if (await btn.count() > 0) {
        await btn.click();
        submitted = true;
        await logger.info('submit_clicked', 'Submit button clicked');
        break;
      }
    }

    if (!submitted) {
      throw new InterventionError(
        InterventionReason.UNEXPECTED_PAGE,
        'Could not find submit button on final Workday page'
      );
    }

    // Verify confirmation
    await page.waitForTimeout(3000);
    const confirmationFound = await page
      .locator('[data-automation-id="confirmationMessage"], :has-text("successfully submitted")')
      .count() > 0;

    if (!confirmationFound) {
      throw new InterventionError(
        InterventionReason.UNEXPECTED_PAGE,
        'No confirmation received after submit — please verify the application was submitted'
      );
    }

    await logger.info('confirmation_received', 'Workday application submitted successfully');

    return {
      status: AutoApplyStatus.APPLIED,
      canComplete: true,
      platform: ATSPlatform.WORKDAY,
      automationConfidence: 90,
      stepsCompleted: 6,
      stepsRemaining: 0,
      blockingIssue: null,
      estimatedSubmissionTime: null,
    };
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  private async fillStandardFields(
    browser: BrowserSession,
    context: WorkflowContext,
    logger: ExecutionLogger
  ): Promise<void> {
    const page = browser.page;
    const profile = context.userProfile;

    // Workday pre-fills from the resume parse — just verify/correct key fields
    const nameField = page.locator('[data-automation-id="legalNameSection_firstName"]');
    if (await nameField.count() > 0) {
      const firstName = profile.name.split(' ')[0] ?? '';
      const lastName = profile.name.split(' ').slice(1).join(' ') ?? '';
      await nameField.fill(firstName);
      await page.locator('[data-automation-id="legalNameSection_lastName"]').fill(lastName);
      await logger.info('field_filled', 'Name fields populated', { hasName: true });
    }

    if (profile.phone) {
      const phoneField = page.locator('[data-automation-id="phone-number"]');
      if (await phoneField.count() > 0) {
        await phoneField.fill(profile.phone);
        await logger.info('field_filled', 'Phone field populated');
      }
    }

    if (profile.location) {
      const locationField = page.locator('[data-automation-id="city"]');
      if (await locationField.count() > 0) {
        await locationField.fill(profile.location.split(',')[0]?.trim() ?? '');
        await logger.info('field_filled', 'Location field populated');
      }
    }
  }

  private async answerDynamicQuestions(
    browser: BrowserSession,
    context: WorkflowContext,
    logger: ExecutionLogger
  ): Promise<void> {
    const page = browser.page;

    // Find all radio groups and select "Yes" for standard affirmative questions
    // (e.g. "Are you authorized to work?", "Do you require sponsorship?")
    const radioGroups = await page.locator('[data-automation-id="radioGroup"]').all();

    for (const group of radioGroups) {
      const label = await group.locator('label').first().textContent();

      // Work authorization — "Yes" to auth, "No" to sponsorship
      if (label?.toLowerCase().includes('authorized to work')) {
        await group.locator('[value="Yes"], [data-automation-id="Yes"]').first().click();
        await logger.info('question_answered', 'Work authorization: Yes');
      } else if (label?.toLowerCase().includes('require sponsorship') || label?.toLowerCase().includes('visa sponsorship')) {
        await group.locator('[value="No"], [data-automation-id="No"]').first().click();
        await logger.info('question_answered', 'Visa sponsorship required: No');
      } else if (label) {
        // Unknown question — log it and signal for intervention
        await logger.warn('unknown_question', `Unknown question encountered: ${label.substring(0, 100)}`);
        throw new InterventionError(
          InterventionReason.UNKNOWN_QUESTION,
          `Workday has a question that requires your input: "${label.trim()}"`,
          page.url()
        );
      }
    }
  }
}

// Self-register
pluginRegistry.register(new WorkdayPlugin());
