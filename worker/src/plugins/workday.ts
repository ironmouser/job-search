import { ATSPlatform, ATSDetectionResult, WorkflowContext, WorkflowResult, AutoApplyStatus, InterventionReason } from '../types';
import { ATSPlugin, InterventionError } from './base-plugin';
import { BrowserSession } from '../browser-session';
import { ExecutionLogger } from '../execution-logger';
import { pluginRegistry } from '../registry';
import { UniversalQuestionResolver } from './question-resolver';
import { replaceValue } from '../utils/form-commit';
import {
  isTransgenderOrGenderIdentityQuestion,
  matchesOptionSafely,
} from '../utils/demographic-matching';

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

    const currentUrl = page.url() || '';
    const isOnWorkdaySite = currentUrl.includes('myworkdayjobs.com') || currentUrl.includes('workday.com');

    // Only perform full navigation if not already on the Workday job/portal page
    if (!isOnWorkdaySite || currentUrl === 'about:blank') {
      await browser.navigate(context.jobUrl);
      await logger.info('page_navigated', 'Navigated to Workday job posting');
      await this.dismissCookieBannerIfPresent(page, logger);
    }

    // Check for login/create account page before clicking Apply (if URL is already on a dedicated auth gate)
    await this.checkLoginOrCreateAccount(page, context.jobUrl, context);

    // Wait for and click the Apply button if still on job posting overview
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
        const btn = page.locator(selector).first();
        if ((await btn.count().catch(() => 0)) > 0 && (await btn.isVisible().catch(() => false))) {
          await btn.click();
          clicked = true;
          await logger.info('apply_button_clicked', `Clicked apply button via: ${selector}`);
          break;
        }
      } catch {
        // Try next selector
      }
    }

    // Give page time to load after click
    await page.waitForTimeout(2000);

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
        await page.waitForTimeout(2000);
        break;
      }
    }

    // Check for login/create account page after clicking Apply and selecting application mode
    await this.checkLoginOrCreateAccount(page, context.jobUrl, context);

    // If wizard or form inputs are present, mark ready
    let hasWizard = (await page.locator('[data-automation-id="bottom-navigation-next-button"], [data-automation-id="file-upload-input-ref"], [data-automation-id="legalNameSection_firstName"], [data-automation-id="myInformationPage"]').count().catch(() => 0)) > 0;

    if (!hasWizard && !page.url().includes('/apply')) {
      const reached = await this.ensureApplicationFormReached(browser, context, logger, {
        customApplySelectors: applySelectors,
      });
      if (reached) {
        hasWizard = true;
      }
    }

    if (!hasWizard && !page.url().includes('/apply')) {
      await this.checkClosedJob(browser, logger, context.jobUrl);
      throw new InterventionError(
        InterventionReason.UNEXPECTED_PAGE,
        'Could not find Apply button or application elements on Workday job page',
        context.jobUrl
      );
    }

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
      await this.uploadResumeFile(browser, page, context, logger, {
        specificSelectors: ['[data-automation-id="file-upload-input-ref"]'],
      });

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

      // Step 4: Upload cover letter (if cover letter input or field exists on this step)
      if (context.coverLetterMarkdown) {
        await this.uploadCoverLetterFile(browser, page, context, logger, {
          specificSelectors: ['[data-automation-id="file-upload-input-ref"]'],
        });
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
    const customAnswers = profile.customAnswers || {};

    // 1. Country Selection (First, because Country changes dependent State/Subdivision fields)
    const countryVal = profile.country || customAnswers['country'] || customAnswers['Country'] || 'United States';
    const countryDropdownSelectors = [
      'button[data-automation-id="addressSection_countryRegion"]',
      'button[data-automation-id="countryRegion"]',
      '[data-automation-id="addressSection_countryRegion"] button',
      '[data-automation-id="countryRegion"] button',
      'button[data-automation-id="country"]',
      'div[data-automation-id="formLabel"]:has-text("Country") ~ div button',
      'div[data-automation-id="formLabel"]:has-text("Country") ~ div [role="combobox"]',
    ];
    for (const sel of countryDropdownSelectors) {
      const loc = page.locator(sel).first();
      if ((await loc.count().catch(() => 0)) > 0 && (await loc.isVisible().catch(() => false))) {
        const selected = await this.selectWorkdayDropdown(page, loc, countryVal);
        if (selected) {
          await logger.info('field_filled', `Country selected: ${countryVal}`);
          await page.waitForTimeout(1000); // Allow country subdivision cascade to settle
        }
        break;
      }
    }

    // 2. First & Last Name
    const firstName = profile.name ? profile.name.split(' ')[0] ?? '' : '';
    const lastName = profile.name ? profile.name.split(' ').slice(1).join(' ') ?? '' : '';

    if (firstName) {
      const firstNameSelectors = [
        '[data-automation-id="legalNameSection_firstName"]',
        '[data-automation-id="nameSection_firstName"]',
        '[data-automation-id="firstName"]',
        'input[data-automation-id*="firstName" i]',
        'input[name*="firstName" i]',
        'input[id*="firstName" i]',
        'label:has-text("First Name") ~ div input',
        'div[data-automation-id="formLabel"]:has-text("First Name") ~ div input',
      ];
      for (const sel of firstNameSelectors) {
        const loc = page.locator(sel).first();
        if ((await loc.count().catch(() => 0)) > 0 && (await loc.isVisible().catch(() => false))) {
          await this.typeHumanized(page, loc, firstName);
          await logger.info('field_filled', `First name populated: ${firstName}`);
          break;
        }
      }
    }

    if (lastName) {
      const lastNameSelectors = [
        '[data-automation-id="legalNameSection_lastName"]',
        '[data-automation-id="nameSection_lastName"]',
        '[data-automation-id="lastName"]',
        'input[data-automation-id*="lastName" i]',
        'input[name*="lastName" i]',
        'input[id*="lastName" i]',
        'label:has-text("Last Name") ~ div input',
        'div[data-automation-id="formLabel"]:has-text("Last Name") ~ div input',
      ];
      for (const sel of lastNameSelectors) {
        const loc = page.locator(sel).first();
        if ((await loc.count().catch(() => 0)) > 0 && (await loc.isVisible().catch(() => false))) {
          await this.typeHumanized(page, loc, lastName);
          await logger.info('field_filled', `Last name populated: ${lastName}`);
          break;
        }
      }
    }

    // 3. Address Line 1
    const address1Val = profile.streetAddress ||
      customAnswers['addressLine1'] ||
      customAnswers['Address Line 1'] ||
      customAnswers['streetAddress'] ||
      profile.location ||
      '';

    if (address1Val) {
      const address1Selectors = [
        '[data-automation-id="addressSection_addressLine1"]',
        '[data-automation-id="addressSection_primaryAddress_addressLine1"]',
        '[data-automation-id="addressLine1"]',
        'input[data-automation-id*="addressLine1" i]',
        'input[id*="addressLine1" i]',
        'input[name*="addressLine1" i]',
        'label:has-text("Address Line 1") ~ div input',
        'div[data-automation-id="formLabel"]:has-text("Address Line 1") ~ div input',
      ];
      for (const sel of address1Selectors) {
        const loc = page.locator(sel).first();
        if ((await loc.count().catch(() => 0)) > 0 && (await loc.isVisible().catch(() => false))) {
          await this.typeHumanized(page, loc, address1Val);
          await logger.info('field_filled', `Address Line 1 populated: ${address1Val}`);
          break;
        }
      }
    }

    // 4. Address Line 2
    const address2Val = profile.streetAddress2 || customAnswers['addressLine2'] || customAnswers['Address Line 2'] || '';
    if (address2Val) {
      const address2Selectors = [
        '[data-automation-id="addressSection_addressLine2"]',
        '[data-automation-id="addressLine2"]',
        'input[data-automation-id*="addressLine2" i]',
        'input[id*="addressLine2" i]',
      ];
      for (const sel of address2Selectors) {
        const loc = page.locator(sel).first();
        if ((await loc.count().catch(() => 0)) > 0 && (await loc.isVisible().catch(() => false))) {
          await this.typeHumanized(page, loc, address2Val);
          break;
        }
      }
    }

    // 5. City
    const cityVal = profile.city ||
      customAnswers['city'] ||
      customAnswers['City'] ||
      (profile.location ? profile.location.split(',')[0]?.trim() : '');

    if (cityVal) {
      const citySelectors = [
        '[data-automation-id="addressSection_city"]',
        '[data-automation-id="city"]',
        'input[data-automation-id*="city" i]',
        'input[id*="city" i]',
        'input[name*="city" i]',
        'label:has-text("City") ~ div input',
        'div[data-automation-id="formLabel"]:has-text("City") ~ div input',
      ];
      for (const sel of citySelectors) {
        const loc = page.locator(sel).first();
        if ((await loc.count().catch(() => 0)) > 0 && (await loc.isVisible().catch(() => false))) {
          await this.typeHumanized(page, loc, cityVal);
          await logger.info('field_filled', `City field populated: ${cityVal}`);
          break;
        }
      }
    }

    // 6. State / Country Subdivision Code
    const stateVal = profile.state ||
      customAnswers['state'] ||
      customAnswers['State'] ||
      (profile.location ? profile.location.split(',')[1]?.trim() : '');

    if (stateVal) {
      const stateDropdownSelectors = [
        'button[data-automation-id="addressSection_countrySubdivisionCode"]',
        'button[data-automation-id="countrySubdivisionCode"]',
        'button[data-automation-id="state"]',
        '[data-automation-id="addressSection_countrySubdivisionCode"] button',
        'div[data-automation-id="formLabel"]:has-text("State") ~ div button',
        'div[data-automation-id="formLabel"]:has-text("Province") ~ div button',
      ];
      for (const sel of stateDropdownSelectors) {
        const loc = page.locator(sel).first();
        if ((await loc.count().catch(() => 0)) > 0 && (await loc.isVisible().catch(() => false))) {
          await this.selectWorkdayDropdown(page, loc, stateVal);
          await logger.info('field_filled', `State selected: ${stateVal}`);
          break;
        }
      }

      // Input fallback for state text inputs
      const stateInput = page.locator('input[data-automation-id*="countrySubdivisionCode" i], input[id*="state" i]').first();
      if ((await stateInput.count().catch(() => 0)) > 0 && (await stateInput.isVisible().catch(() => false))) {
        await this.typeHumanized(page, stateInput, stateVal);
      }
    }

    // 7. Postal Code / Zip Code
    const postalVal = profile.postalCode ||
      customAnswers['postalCode'] ||
      customAnswers['postal_code'] ||
      customAnswers['Postal Code'] ||
      customAnswers['zipCode'] ||
      '';

    if (postalVal) {
      const postalSelectors = [
        '[data-automation-id="addressSection_postalCode"]',
        '[data-automation-id="postalCode"]',
        'input[data-automation-id*="postalCode" i]',
        'input[id*="postalCode" i]',
        'input[name*="postalCode" i]',
        'label:has-text("Postal Code") ~ div input',
        'label:has-text("Zip Code") ~ div input',
        'div[data-automation-id="formLabel"]:has-text("Postal Code") ~ div input',
      ];
      for (const sel of postalSelectors) {
        const loc = page.locator(sel).first();
        if ((await loc.count().catch(() => 0)) > 0 && (await loc.isVisible().catch(() => false))) {
          await this.typeHumanized(page, loc, postalVal);
          await logger.info('field_filled', `Postal code field populated: ${postalVal}`);
          break;
        }
      }
    }

    // 8. Phone Number
    if (profile.phone) {
      const phoneSelectors = [
        '[data-automation-id="phone-number"]',
        '[data-automation-id="phoneNumber"]',
        '[data-automation-id="phoneSection_phoneNumber"]',
        'input[data-automation-id*="phone" i]',
        'input[type="tel"]',
        'label:has-text("Phone") ~ div input',
        'div[data-automation-id="formLabel"]:has-text("Phone") ~ div input',
      ];
      for (const sel of phoneSelectors) {
        const loc = page.locator(sel).first();
        if ((await loc.count().catch(() => 0)) > 0 && (await loc.isVisible().catch(() => false))) {
          await this.typeHumanized(page, loc, profile.phone);
          await logger.info('field_filled', 'Phone field populated');
          break;
        }
      }

      // Phone Device Type (Mobile)
      const phoneTypeSelectors = [
        'button[data-automation-id="phone-device-type"]',
        'button[data-automation-id="phoneDeviceType"]',
        '[data-automation-id="phone-device-type"] button',
        'div[data-automation-id="formLabel"]:has-text("Phone Device Type") ~ div button',
        'div[data-automation-id="formLabel"]:has-text("Device Type") ~ div button',
      ];
      for (const sel of phoneTypeSelectors) {
        const loc = page.locator(sel).first();
        if ((await loc.count().catch(() => 0)) > 0 && (await loc.isVisible().catch(() => false))) {
          await this.selectWorkdayDropdown(page, loc, 'Mobile');
          break;
        }
      }
    }

    // 9. Source / "How Did You Hear About Us"
    const sourceSelectors = [
      'button[data-automation-id="source"]',
      'button[data-automation-id="howDidYouHearAboutUs"]',
      '[data-automation-id="source"] button',
      'div[data-automation-id="formLabel"]:has-text("How Did You Hear") ~ div button',
      'div[data-automation-id="formLabel"]:has-text("Source") ~ div button',
    ];
    for (const sel of sourceSelectors) {
      const loc = page.locator(sel).first();
      if ((await loc.count().catch(() => 0)) > 0 && (await loc.isVisible().catch(() => false))) {
        const selected = await this.selectWorkdayDropdown(page, loc, 'Job Board') ||
          await this.selectWorkdayDropdown(page, loc, 'LinkedIn') ||
          await this.selectWorkdayDropdown(page, loc, 'Other');
        if (selected) {
          await logger.info('field_filled', 'Source / referral selected');
        }
        break;
      }
    }
  }

  private async selectWorkdayDropdown(
    page: import('playwright').Page,
    triggerLocator: import('playwright').Locator,
    targetText: string
  ): Promise<boolean> {
    try {
      if ((await triggerLocator.count()) === 0 || !(await triggerLocator.isVisible().catch(() => false))) {
        return false;
      }

      const currentText = ((await triggerLocator.textContent().catch(() => '')) || '').trim();
      if (currentText.toLowerCase().includes(targetText.toLowerCase())) {
        return true; // Already selected
      }

      await triggerLocator.click().catch(() => {});
      await page.waitForTimeout(400);

      // Check for search input in popup
      const searchInput = page.locator('[data-automation-id="searchBox"], input[type="search"], div[role="listbox"] input').first();
      if ((await searchInput.count().catch(() => 0)) > 0 && (await searchInput.isVisible().catch(() => false))) {
        await replaceValue(searchInput, targetText).catch(() => {});
        await page.waitForTimeout(400);
      }

      const option = page.locator(`[role="option"], [data-automation-id*="promptOption"], li`).filter({ hasText: new RegExp(targetText, 'i') }).first();
      if ((await option.count().catch(() => 0)) > 0 && (await option.isVisible().catch(() => false))) {
        await option.click().catch(() => {});
        await page.waitForTimeout(400);
        return true;
      }

      // Close dropdown if nothing selected
      await page.keyboard.press('Escape').catch(() => {});
    } catch {}
    return false;
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
      else if ((lowerLabel.includes('gender') || lowerLabel.includes('sex')) && !isTransgenderOrGenderIdentityQuestion(lowerLabel)) {
        const choice = profile.eeocGender || 'Decline';
        const labels = await group.locator('label').all();
        let clicked = false;
        for (const lbl of labels) {
          const txt = (await lbl.textContent().catch(() => ''))?.trim() ?? '';
          if (matchesOptionSafely(txt, choice)) {
            await lbl.click().catch(() => {});
            clicked = true;
            break;
          }
        }
        if (!clicked) {
          const opt = group.locator('label:has-text("Decline"), label:has-text("I do not wish to answer")').first();
          if (await opt.count() > 0) await opt.click().catch(() => {});
        }
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
