import { ATSPlatform, ATSDetectionResult, WorkflowContext, WorkflowResult, AutoApplyStatus, InterventionReason } from '../types';
import { ATSPlugin, InterventionError } from './base-plugin';
import { BrowserSession } from '../browser-session';
import { ExecutionLogger } from '../execution-logger';
import { pluginRegistry } from '../registry';
import { UniversalQuestionResolver } from './question-resolver';

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
    await this.dismissCookieBannerIfPresent(page, logger);

    // Check for login/create account page before clicking Apply (if URL is already on a dedicated auth gate)
    await this.checkLoginOrCreateAccount(page, context.jobUrl, context);

    // Wait for and click the Apply button
    // Workday uses data-automation-id for most interactive elements
    const applySelectors = [
      '[data-automation-id="applyButton"]',
      '[data-automation-id="Apply"]',
      'a[data-automation-id*="apply" i]',
      'button[data-automation-id*="apply" i]',
      'button:has-text("Apply")',
      'a:has-text("Autofill with Resume")',
      'button:has-text("Autofill with Resume")',
      'a:has-text("Apply Manually")',
      'button:has-text("Apply Manually")',
    ];

    let clicked = false;
    for (const selector of applySelectors) {
      try {
        await page.waitForSelector(selector, { timeout: 4000 });
        await page.click(selector);
        clicked = true;
        await logger.info('apply_button_clicked', `Clicked apply button via: ${selector}`);
        break;
      } catch {
        // Try next selector
      }
    }

    // Give page time to load after click
    await page.waitForTimeout(2500);

    // If clicking "Apply" opened a popover menu (e.g. "Autofill with Resume", "Apply Manually"), click "Autofill with Resume"
    const subOptionSelectors = [
      '[data-automation-id="autofillWithResume"]',
      'a[data-automation-id*="autofill" i]',
      'button[data-automation-id*="autofill" i]',
      'a:has-text("Autofill with Resume")',
      'button:has-text("Autofill with Resume")',
      '[data-automation-id="applyManually"]',
      'a[data-automation-id*="applyManually" i]',
      'button[data-automation-id*="applyManually" i]',
      'a:has-text("Apply Manually")',
      'button:has-text("Apply Manually")',
    ];

    for (const sel of subOptionSelectors) {
      const subOption = page.locator(sel).first();
      if ((await subOption.count().catch(() => 0)) > 0 && (await subOption.isVisible().catch(() => false))) {
        await subOption.click().catch(() => {});
        await logger.info('sub_option_clicked', `Selected Workday application mode via: ${sel}`);
        await page.waitForTimeout(2500);
        break;
      }
    }

    if (!clicked) {
      await this.checkClosedJob(browser, logger, context.jobUrl);
      throw new InterventionError(
        InterventionReason.UNEXPECTED_PAGE,
        'Could not find Apply button on Workday job page',
        context.jobUrl
      );
    }

    // Check for login/create account page after clicking Apply and selecting application mode
    await this.checkLoginOrCreateAccount(page, context.jobUrl, context);

    await logger.info('form_located', 'Workday application form ready');
  }

  /**
   * Helper to detect if Workday is currently showing a Sign In or Create Account screen.
   */
  private async checkLoginOrCreateAccount(page: import('playwright').Page, fallbackUrl: string, context?: WorkflowContext): Promise<void> {
    await this.checkAccountGate(page, fallbackUrl, this.displayName, context);
  }

  // ─── Apply ────────────────────────────────────────────────────────────────

  async apply(
    browser: BrowserSession,
    context: WorkflowContext,
    logger: ExecutionLogger
  ): Promise<void> {
    const page = browser.page;

    // Workday applications are multi-step wizards (usually 3 to 6 steps).
    // Loop through each step, filling fields, answering questions, and clicking "Save and Continue"
    // until reaching the final Review / Submit page.
    const maxWizardSteps = 8;
    for (let step = 1; step <= maxWizardSteps; step++) {
      await logger.info('wizard_step', `Processing Workday application step ${step}`);

      // Check if account gate is active (e.g. login/create account)
      await this.checkLoginOrCreateAccount(page, context.jobUrl, context);

      // Step 1: Upload resume (if upload input exists on current step)
      const resumeInput = page.locator('[data-automation-id="file-upload-input-ref"]').first();
      if (await resumeInput.count() > 0) {
        const resumePath = await browser.writeMarkdownToPdf(
          context.resumeMarkdown,
          `resume_${context.sessionId}.pdf`
        );
        await resumeInput.setInputFiles(resumePath).catch(() => {});
        await logger.info('resume_uploaded', 'Resume uploaded to Workday');
        await page.waitForTimeout(3000);
      }

      // Step 2: Fill standard fields (Name, Phone, Address, City, Postal)
      await this.fillStandardFields(browser, context, logger);

      // Step 3: Handle dynamic questions (Radio groups, Dropdowns, EEOC)
      await this.answerDynamicQuestions(browser, context, logger);
      await this.handleConsentCheckboxes(page, logger);
      await this.handleEEOCDemographics(page, context.userProfile, logger);

      // Custom screening questions & questionnaires
      await UniversalQuestionResolver.resolveAndFillQuestions(
        page,
        browser,
        context,
        logger,
        logger.getApiClient()
      );

      // Step 4: Upload cover letter if second upload field exists
      const clInputs = page.locator('[data-automation-id="file-upload-input-ref"]');
      if (await clInputs.count() > 1) {
        const clPath = await browser.writeMarkdownToPdf(
          context.coverLetterMarkdown,
          `cover_letter_${context.sessionId}.pdf`
        );
        await clInputs.nth(1).setInputFiles(clPath).catch(() => {});
        await logger.info('cover_letter_uploaded', 'Cover letter uploaded to Workday');
      }

      // Look for "Save and Continue" / "Next" button to advance to the next step
      const nextBtn = page.locator(
        '[data-automation-id="bottom-navigation-next-button"], button:has-text("Save and Continue"), button:has-text("Next")'
      ).first();

      if (await nextBtn.count() > 0) {
        const btnText = ((await nextBtn.textContent().catch(() => '')) || '').trim().toLowerCase();
        
        // If button text is "submit", we have reached the final submission page
        if (btnText.includes('submit')) {
          await logger.info('wizard_complete', 'Reached final submission step in Workday');
          break;
        }

        const isBtnDisabled = (await nextBtn.getAttribute('disabled')) !== null;
        if (!isBtnDisabled) {
          await nextBtn.click();
          await logger.info('wizard_advanced', `Advanced Workday wizard to step ${step + 1}`);
          await page.waitForTimeout(3000);
        } else {
          // Next button disabled — missing required input on current step
          await logger.warn('wizard_step_blocked', `Save and Continue is disabled on step ${step} — required fields missing`);
          break;
        }
      } else {
        // No Next button — completed wizard navigation
        await logger.info('wizard_complete', 'Completed Workday wizard navigation');
        break;
      }
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

    // Live mode — click submit.
    // Workday uses data-automation-id attributes as stable semantic identifiers;
    // pass them as Tier 1 so the base-class helper tries them first.
    const submitBtn = await this.findSubmitButton(
      page,
      logger,
      [
        '[data-automation-id="bottom-navigation-next-button"]',
        '[data-automation-id="submit-button"]',
      ]
    );

    if (!submitBtn) {
      throw new InterventionError(
        InterventionReason.UNEXPECTED_PAGE,
        'Could not find submit button on final Workday page'
      );
    }

    await submitBtn.click();

    // Verify post-submission status (checks for confirmation, anti-bot challenges, limits, and form error banners)
    await this.verifyPostSubmission(browser, page, logger, {
      platformDisplayName: 'Workday',
      confirmationSelectors: [
        '[data-automation-id="confirmationMessage"]',
        ':has-text("successfully submitted")',
        ':has-text("Thank you for applying")',
      ],
      confirmationKeywords: [
        'successfully submitted',
        'thank you for applying',
        'application submitted',
        'application received',
      ],
      errorSelectors: ['[data-automation-id*="error" i]', '[role="alert"]', '.error-msg'],
      maxWaitMs: 8000,
    });

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
      await this.typeHumanized(page, nameField, firstName);
      await this.typeHumanized(page, page.locator('[data-automation-id="legalNameSection_lastName"]'), lastName);
      await logger.info('field_filled', 'Name fields populated', { hasName: true });
    }

    if (profile.phone) {
      const phoneField = page.locator('[data-automation-id="phone-number"]');
      if (await phoneField.count() > 0) {
        await this.typeHumanized(page, phoneField, profile.phone);
        await logger.info('field_filled', 'Phone field populated');
      }
    }

    const cityVal = profile.city || (profile.location ? profile.location.split(',')[0]?.trim() : '');
    if (cityVal) {
      const locationField = page.locator('[data-automation-id="city"]');
      if (await locationField.count() > 0) {
        await this.typeHumanized(page, locationField, cityVal);
        await logger.info('field_filled', 'City field populated');
      }
    }

    if (profile.streetAddress) {
      const addressField = page.locator('[data-automation-id="addressSection_addressLine1"]');
      if (await addressField.count() > 0) {
        await this.typeHumanized(page, addressField, profile.streetAddress);
        await logger.info('field_filled', 'Street address field populated');
      }
    }

    if (profile.postalCode) {
      const postalField = page.locator('[data-automation-id="postalCode"]');
      if (await postalField.count() > 0) {
        await this.typeHumanized(page, postalField, profile.postalCode);
        await logger.info('field_filled', 'Postal code field populated');
      }
    }
  }

  private async answerDynamicQuestions(
    browser: BrowserSession,
    context: WorkflowContext,
    logger: ExecutionLogger
  ): Promise<void> {
    const page = browser.page;
    const profile = context.userProfile;

    const radioGroups = await page.locator('[data-automation-id="radioGroup"], fieldset').all();

    for (const group of radioGroups) {
      const labelEl = group.locator('label, legend, [data-automation-id="formLabel"]').first();
      let label = '';
      if (await labelEl.count() > 0) {
        label = (await labelEl.textContent({ timeout: 1500 }).catch(() => '')) || '';
      }
      if (!label) {
        label = (await group.textContent({ timeout: 1000 }).catch(() => '')) || '';
      }
      const lowerLabel = label.toLowerCase();
      if (!label.trim()) continue;

      // Work authorization
      if (lowerLabel.includes('authorized to work') || lowerLabel.includes('work authorization')) {
        const val = profile.usWorkAuthorization === 'No' ? 'No' : 'Yes';
        const opt = group.locator(`[value="${val}"], [data-automation-id="${val}"], label:has-text("${val}")`).first();
        if (await opt.count() > 0) await opt.click().catch(() => {});
        await logger.info('question_answered', `Work authorization: ${val}`);
      } 
      // Visa sponsorship
      else if (lowerLabel.includes('require sponsorship') || lowerLabel.includes('visa sponsorship')) {
        const val = profile.visaSponsorship === 'Yes' ? 'Yes' : 'No';
        const opt = group.locator(`[value="${val}"], [data-automation-id="${val}"], label:has-text("${val}")`).first();
        if (await opt.count() > 0) await opt.click().catch(() => {});
        await logger.info('question_answered', `Visa sponsorship: ${val}`);
      } 
      // EEOC Gender
      else if (lowerLabel.includes('gender') || lowerLabel.includes('sex')) {
        const choice = profile.eeocGender || 'Decline';
        const opt = group.locator(`label:has-text("${choice}"), label:has-text("Decline"), label:has-text("I do not wish to answer")`).first();
        if (await opt.count() > 0) await opt.click().catch(() => {});
        await logger.info('eeoc_answered', `EEOC Gender: ${choice}`);
      }
      // EEOC Race / Ethnicity
      else if (lowerLabel.includes('race') || lowerLabel.includes('ethnicity')) {
        const choice = profile.eeocRace || 'Decline';
        const opt = group.locator(`label:has-text("${choice}"), label:has-text("Decline"), label:has-text("I do not wish to answer")`).first();
        if (await opt.count() > 0) await opt.click().catch(() => {});
        await logger.info('eeoc_answered', `EEOC Race: ${choice}`);
      }
      // EEOC Veteran status
      else if (lowerLabel.includes('veteran')) {
        const choice = profile.eeocVeteran || 'Decline';
        const opt = group.locator(`label:has-text("${choice}"), label:has-text("Decline"), label:has-text("I do not wish to answer"), label:has-text("No")`).first();
        if (await opt.count() > 0) await opt.click().catch(() => {});
        await logger.info('eeoc_answered', `EEOC Veteran: ${choice}`);
      }
      // EEOC Disability status
      else if (lowerLabel.includes('disability')) {
        const choice = profile.eeocDisability || 'Decline';
        const opt = group.locator(`label:has-text("${choice}"), label:has-text("Decline"), label:has-text("I do not wish to answer"), label:has-text("No")`).first();
        if (await opt.count() > 0) await opt.click().catch(() => {});
        await logger.info('eeoc_answered', `EEOC Disability: ${choice}`);
      }
      else {
        // Fallback for optional questions: try selecting a decline/no option if available
        const fallbackOpt = group.locator('label:has-text("Decline"), label:has-text("I do not wish"), label:has-text("No")').first();
        if (await fallbackOpt.count() > 0) {
          await fallbackOpt.click().catch(() => {});
        } else {
          await logger.warn('unknown_question', `Unknown question encountered: ${label.substring(0, 100)}`);
          throw new InterventionError(
            InterventionReason.UNKNOWN_QUESTION,
            `I did not have enough information to answer: "${label.trim()}"`,
            page.url()
          );
        }
      }
    }
  }
}

// Self-register
pluginRegistry.register(new WorkdayPlugin());
