import { ATSPlugin, InterventionError } from './base-plugin';
import {
  ATSPlatform,
  ATSDetectionResult,
  WorkflowContext,
  WorkflowResult,
  AutoApplyStatus,
  InterventionReason,
} from '../types';
import { BrowserSession } from '../browser-session';
import { ExecutionLogger } from '../execution-logger';
import { safeClick } from '../obstruction';
import { pluginRegistry } from '../registry';
import { replaceValue, replaceValueHumanized, waitForSensorSettling } from '../utils/form-commit';
import { UniversalQuestionResolver } from './question-resolver';

/**
 * DiceApplyPlugin
 *
 * Automates native "Easy Apply" job applications on Dice.com.
 */
export class DiceApplyPlugin extends ATSPlugin {
  readonly platform = ATSPlatform.DICE_NATIVE;
  readonly displayName = 'Dice Easy Apply';

  detect(url: string, html: string, redirectChain: string[]): ATSDetectionResult {
    const isDice =
      url.includes('dice.com') ||
      redirectChain.some((u) => u.includes('dice.com'));

    if (!isDice) {
      return {
        platform: ATSPlatform.UNKNOWN,
        confidence: 0,
        detectedFeatures: [],
        automationSupported: false,
      };
    }

    const hasEasyApply =
      html.includes('Easy Apply') ||
      html.includes('dice-easy-apply') ||
      html.includes('data-cy="easy-apply-button"') ||
      html.includes('apply-button');

    // If it doesn't have native easy apply, allow AggregatorHandler to discover external ATS links
    if (!hasEasyApply) {
      return {
        platform: ATSPlatform.DICE_NATIVE,
        confidence: 20,
        detectedFeatures: ['dice_domain'],
        automationSupported: false,
      };
    }

    return {
      platform: ATSPlatform.DICE_NATIVE,
      confidence: 90,
      detectedFeatures: ['dice_domain', 'dice_easy_apply_button'],
      automationSupported: true,
    };
  }

  /**
   * Detects and autonomously resolves Dice candidate account login / registration modal.
   * Handles multi-step flow (email input -> continue -> password/name input -> submit -> OTP/MFA).
   */
  private async handleDiceAuth(
    browser: BrowserSession,
    page: any,
    context: WorkflowContext,
    logger: ExecutionLogger
  ): Promise<void> {
    const html = await browser.getHtml().catch(() => '');
    const lowerHtml = html.toLowerCase();
    const currentUrl = page.url() || '';

    // Check if on an auth URL or if modal/drawer is displaying auth text
    const isAuthUrl = /login|signin|sign-in|register|auth/i.test(currentUrl);
    const isLoggedOutText =
      lowerHtml.includes('log in to apply') ||
      lowerHtml.includes('create an account or sign in') ||
      lowerHtml.includes("let's get you hired") ||
      lowerHtml.includes("let’s get you hired") ||
      lowerHtml.includes('please enter your email to sign in') ||
      lowerHtml.includes('continue with email') ||
      lowerHtml.includes('sign in with your email');

    // Scoped selectors that indicate an active candidate auth modal / screen
    const authElementSelectors = [
      'button:has-text("Log In to Apply")',
      'a:has-text("Log In to Apply")',
      'input[placeholder*="yourdomain.com"]',
      'button:has-text("Continue with email")',
      'button:has-text("Continue with Email")',
      'button:has-text("Continue with Google")',
      'button:has-text("Continue with Apple")',
      'button:has-text("Sign in with Google")',
      'button:has-text("Sign in with Apple")',
      '[data-testid="sign-in-button"]',
      '[data-testid="register-button"]',
      '[role="dialog"] input[type="password"]',
      '[aria-modal="true"] input[type="password"]',
    ];

    let hasAuthElement = false;
    for (const sel of authElementSelectors) {
      const el = await page.$(sel).catch(() => null);
      if (el && (await el.isVisible().catch(() => false))) {
        hasAuthElement = true;
        break;
      }
    }

    const hasPasswordField = (await page.locator('input[type="password"], input[name*="password" i]').count().catch(() => 0)) > 0;
    const isAuthActive = isAuthUrl || isLoggedOutText || hasAuthElement || (hasPasswordField && !currentUrl.includes('/apply'));

    if (!isAuthActive) {
      return;
    }

    await logger.info('dice_auth_detected', 'Dice candidate authentication gate detected');

    const profile = context.userProfile;
    const emailToUse = profile.accountEmail || profile.email;
    const passwordToUse = profile.accountPassword;
    const authMode = profile.accountAuthMode || 'sign_in';

    // If credentials are NOT provided in profile, trigger structured intervention
    if (!passwordToUse || !emailToUse) {
      await logger.warn('dice_auth_required', 'Dice candidate account credentials needed — requesting intervention');
      throw new InterventionError(
        InterventionReason.JOB_BOARD_AUTH_REQUIRED,
        'Dice requires you to connect your account or sign in before JAHQ can automate applications.',
        currentUrl
      );
    }

    await logger.info('dice_auth_starting', `Automating Dice candidate authentication (${authMode}) for ${emailToUse}`);

    // Helper to fill input using humanized typing and trigger native events
    const fillInput = async (loc: any, val: string) => {
      await loc.scrollIntoViewIfNeeded().catch(() => {});
      await loc.click({ force: true }).catch(() => {});
      try {
        await replaceValueHumanized(loc, val);
      } catch {
        await replaceValue(loc, val).catch(() => {});
      }
      await loc.dispatchEvent('change').catch(() => {});
      await loc.dispatchEvent('blur').catch(() => {});
    };

    // Step 1: Locate and fill Email input
    const emailLocators = [
      page.locator('input[placeholder*="yourdomain.com"]').first(),
      page.locator('[role="dialog"] input[type="email"], [aria-modal="true"] input[type="email"]').first(),
      page.locator('input[type="email"]').first(),
      page.locator('input[name="email" i]').first(),
      page.locator('input[id*="email" i]').first(),
      page.locator('input[data-testid*="email" i]').first(),
    ];

    for (const loc of emailLocators) {
      if ((await loc.count().catch(() => 0)) > 0 && (await loc.isVisible().catch(() => false))) {
        await fillInput(loc, emailToUse);
        await logger.info('dice_email_filled', 'Entered candidate email into Dice authentication form');
        break;
      }
    }

    // Allow anti-bot / PerimeterX client sensors to register keystrokes and settle
    await waitForSensorSettling(page, 1500);

    // Step 1b: If there is a "Continue with email" / "Continue" / "Next" button, click it to advance to password
    const continueBtnLocators = [
      page.locator('button:has-text("Continue with email")').first(),
      page.locator('button:has-text("Continue with Email")').first(),
      page.locator('[role="dialog"] button:has-text("Continue"), [aria-modal="true"] button:has-text("Continue")').first(),
      page.locator('button:has-text("Continue")').first(),
      page.locator('button:has-text("Next")').first(),
    ];

    for (const btn of continueBtnLocators) {
      if ((await btn.count().catch(() => 0)) > 0 && (await btn.isVisible().catch(() => false))) {
        await btn.click().catch(() => {});
        await logger.info('dice_continue_clicked', 'Clicked continue on Dice email step');
        await page.waitForTimeout(2000);
        break;
      }
    }

    // Step 1c: Check immediately for Unexpected Sign In Response or Bot Challenge on Email step
    const earlyErrorText = await page.$$eval('[aria-invalid="true"], .error-feedback, .d-inline-error, [role="alert"], [class*="error" i]', (els: any[]) =>
      els.map((e) => e.textContent?.trim() || '').filter(Boolean).join('; ')
    ).catch(() => '');

    if (
      earlyErrorText &&
      (earlyErrorText.toLowerCase().includes('unexpected sign in response') ||
       earlyErrorText.toLowerCase().includes('unexpected response') ||
       earlyErrorText.toLowerCase().includes('something went wrong') ||
       earlyErrorText.toLowerCase().includes('try again later'))
    ) {
      await logger.warn('dice_auth_unexpected_response', `Dice authentication blocked: ${earlyErrorText}`);
      throw new InterventionError(
        InterventionReason.JOB_BOARD_AUTH_REQUIRED,
        `Dice authentication returned an unexpected response (${earlyErrorText}). Please complete sign-in using the live interactive browser stream.`,
        page.url()
      );
    }

    // Step 2: Locate and fill Password input (wait up to 5 seconds if rendering asynchronously)
    const passLocators = [
      page.locator('input[type="password"]').first(),
      page.locator('input[name="password" i]').first(),
      page.locator('input[id*="password" i]').first(),
      page.locator('input[data-testid*="password" i]').first(),
    ];

    let passFilled = false;
    for (let wait = 0; wait < 5; wait++) {
      for (const loc of passLocators) {
        if ((await loc.count().catch(() => 0)) > 0 && (await loc.isVisible().catch(() => false))) {
          await fillInput(loc, passwordToUse);
          passFilled = true;
          await logger.info('dice_password_filled', 'Entered candidate password into Dice authentication form');
          break;
        }
      }
      if (passFilled) break;
      await page.waitForTimeout(1000);
    }

    // Step 2b: If in Create Account mode or registration fields are present, fill them
    if (authMode === 'create_account') {
      const nameParts = (profile.name || '').trim().split(/\s+/);
      const firstName = nameParts[0] || 'Candidate';
      const lastName = nameParts.slice(1).join(' ') || 'Applicant';

      const fnLoc = page.locator('input[name*="firstName" i], input[id*="firstName" i], input[placeholder*="First Name" i]').first();
      if ((await fnLoc.count().catch(() => 0)) > 0 && (await fnLoc.isVisible().catch(() => false))) {
        await fillInput(fnLoc, firstName);
      }

      const lnLoc = page.locator('input[name*="lastName" i], input[id*="lastName" i], input[placeholder*="Last Name" i]').first();
      if ((await lnLoc.count().catch(() => 0)) > 0 && (await lnLoc.isVisible().catch(() => false))) {
        await fillInput(lnLoc, lastName);
      }

      const confirmPassLoc = page.locator('input[name*="confirm" i], input[name*="verify" i], input[id*="confirm" i]').first();
      if ((await confirmPassLoc.count().catch(() => 0)) > 0 && (await confirmPassLoc.isVisible().catch(() => false))) {
        await fillInput(confirmPassLoc, passwordToUse);
      }

      const termsCheck = page.locator('input[type="checkbox"]').first();
      if ((await termsCheck.count().catch(() => 0)) > 0 && (await termsCheck.isVisible().catch(() => false))) {
        const isChecked = await termsCheck.isChecked().catch(() => false);
        if (!isChecked) {
          await termsCheck.check({ force: true }).catch(() => termsCheck.click({ force: true }));
        }
      }
    }

    // Allow sensor settling before final submission
    await waitForSensorSettling(page, 1000);

    // Step 3: Submit authentication form
    const submitAuthLocators = [
      page.locator('button:has-text("Sign In")').first(),
      page.locator('button:has-text("Log In")').first(),
      page.locator('button:has-text("Create Account")').first(),
      page.locator('button:has-text("Register")').first(),
      page.locator('button:has-text("Sign Up")').first(),
      page.locator('[role="dialog"] button[type="submit"], [aria-modal="true"] button[type="submit"]').first(),
      page.locator('button[data-testid*="submit" i]').first(),
      page.locator('button[type="submit"]').first(),
    ];

    for (const btn of submitAuthLocators) {
      if ((await btn.count().catch(() => 0)) > 0 && (await btn.isVisible().catch(() => false))) {
        await btn.click().catch(() => {});
        await logger.info('dice_auth_submitted', `Submitted Dice credentials (${authMode})`);
        await page.waitForTimeout(3000);
        break;
      }
    }

    // Step 4: Check for OTP / MFA Verification Security Code
    const otpLocators = [
      page.locator('input[name*="otp" i]').first(),
      page.locator('input[name*="code" i]').first(),
      page.locator('input[autocomplete="one-time-code"]').first(),
      page.locator('input[data-testid*="otp" i]').first(),
      page.locator('input[placeholder*="code" i]').first(),
    ];

    for (const loc of otpLocators) {
      if ((await loc.count().catch(() => 0)) > 0 && (await loc.isVisible().catch(() => false))) {
        const otpCode = profile.otpCode || profile.customAnswers?.['security_code'] || profile.customAnswers?.['verification_code'] || profile.customAnswers?.['otp'];
        if (otpCode) {
          await fillInput(loc, otpCode);
          const verifyBtn = page.locator('button:has-text("Verify"), button:has-text("Submit"), button:has-text("Continue")').first();
          if ((await verifyBtn.count().catch(() => 0)) > 0) {
            await verifyBtn.click().catch(() => {});
            await page.waitForTimeout(2500);
          }
        } else {
          throw new InterventionError(
            InterventionReason.MFA_REQUIRED,
            'Dice sent a security verification code to your email. Please enter the code in the drawer to continue.',
            page.url()
          );
        }
        break;
      }
    }

    // Step 5: Check for authentication errors
    const errorText = await page.$$eval('[aria-invalid="true"], .error-feedback, .d-inline-error, [role="alert"], [class*="error" i]', (els: any[]) =>
      els.map((e) => e.textContent?.trim() || '').filter(Boolean).join('; ')
    ).catch(() => '');

    if (errorText && (errorText.toLowerCase().includes('password') || errorText.toLowerCase().includes('invalid') || errorText.toLowerCase().includes('incorrect') || errorText.toLowerCase().includes('unexpected sign in response'))) {
      await logger.warn('dice_auth_failed', `Dice authentication error: ${errorText}`);
      throw new InterventionError(
        InterventionReason.JOB_BOARD_AUTH_REQUIRED,
        `Dice authentication error: ${errorText}. Please complete sign-in using the live interactive browser stream.`,
        page.url()
      );
    }

    // Step 6: Wait for auth modal to close
    await page.waitForTimeout(2000);
    await logger.info('dice_auth_completed', 'Dice candidate authentication finished');
  }

  async prepare(
    browser: BrowserSession,
    context: WorkflowContext,
    logger: ExecutionLogger
  ): Promise<void> {
    const page = browser.page;
    await logger.info('dice_prepare', 'Preparing Dice Easy Apply session');

    // Proactively dismiss any cookie or privacy consent modal
    await this.dismissCookieBannerIfPresent(page, logger);

    // 1. Check & handle authentication requirements before clicking apply
    await this.handleDiceAuth(browser, page, context, logger);

    // 2. Click Easy Apply / Apply button
    const applyButtonSelectors = [
      'button:has-text("Easy Apply")',
      'button[data-cy="easy-apply-button"]',
      'button[aria-label="Easy Apply"]',
      'button:has-text("Apply Now")',
      'a:has-text("Easy Apply")',
      'a:has-text("Apply Now")',
      '[data-cy="apply-button"]',
      'button[data-cy="apply-button"]',
      'a[data-cy="apply-button"]',
    ];

    let clicked = false;
    for (const selector of applyButtonSelectors) {
      const btn = await page.$(selector).catch(() => null);
      if (btn && (await btn.isVisible().catch(() => false))) {
        await logger.info('dice_click_apply', `Clicking Dice apply button: ${selector}`);
        await safeClick(page, selector);
        clicked = true;
        break;
      }
    }

    if (!clicked) {
      await logger.warn('dice_no_apply_btn', 'Could not locate standard Dice Easy Apply button');
    }

    // Wait for the slide-over drawer / modal to appear and dismiss any newly triggered cookie overlays
    await page.waitForTimeout(2000);
    await this.dismissCookieBannerIfPresent(page, logger);

    // 3. Re-check authentication requirements (clicking apply often launches the sign-in modal)
    await this.handleDiceAuth(browser, page, context, logger);
  }

  async apply(
    browser: BrowserSession,
    context: WorkflowContext,
    logger: ExecutionLogger
  ): Promise<void> {
    const page = browser.page;
    await logger.info('dice_apply', 'Processing Dice application drawer');

    // Dismiss any cookie modal before proceeding with drawer fields
    await this.dismissCookieBannerIfPresent(page, logger);

    // Verify session isn't gated behind sign-in modal
    await this.handleDiceAuth(browser, page, context, logger);

    const profile = context.userProfile;
    const nameParts = (profile.name || '').trim().split(/\s+/);
    const firstName = nameParts[0] || '';
    const lastName = nameParts.slice(1).join(' ') || '';

    // 1. Fill contact information if fields are present in drawer
    const fnInput = await page.$('input[name*="firstName" i], input[id*="firstName" i], input[placeholder*="First Name" i]').catch(() => null);
    if (fnInput && (await fnInput.isVisible().catch(() => false)) && firstName) {
      const cur = await fnInput.inputValue().catch(() => '');
      if (!cur) await this.typeHumanized(page, fnInput, firstName);
    }

    const lnInput = await page.$('input[name*="lastName" i], input[id*="lastName" i], input[placeholder*="Last Name" i]').catch(() => null);
    if (lnInput && (await lnInput.isVisible().catch(() => false)) && lastName) {
      const cur = await lnInput.inputValue().catch(() => '');
      if (!cur) await this.typeHumanized(page, lnInput, lastName);
    }

    const phoneInput = await page.$('input[type="tel"], input[name*="phone" i], input[id*="phone" i]').catch(() => null);
    if (phoneInput && (await phoneInput.isVisible().catch(() => false)) && profile.phone) {
      const cur = await phoneInput.inputValue().catch(() => '');
      if (!cur) await this.typeHumanized(page, phoneInput, profile.phone);
    }

    // 2. Upload or select resume
    try {
      await this.uploadResumeFile(browser, page, context, logger);
    } catch (uploadErr) {
      await this.handleDiceAuth(browser, page, context, logger);
      throw uploadErr;
    }

    // 2b. Cover letter (optional)
    if (context.coverLetterMarkdown) {
      await this.uploadCoverLetterFile(browser, page, context, logger);
    }

    // 3. Fill standard work authorization questions if present
    const workAuthInputs = await page.$$('input[name*="auth"], input[id*="auth"], select[name*="auth"]').catch(() => []);
    for (const input of workAuthInputs) {
      const tagName = await input.evaluate((el: any) => el.tagName.toLowerCase()).catch(() => '');
      if (tagName === 'select') {
        await input.selectOption({ label: 'Yes' }).catch(() => {});
      } else {
        const type = await input.getAttribute('type');
        if (type === 'radio' || type === 'checkbox') {
          await input.check().catch(() => {});
        }
      }
    }

    // 4. Fill compensation if requested
    if (context.userProfile.expectedSalary) {
      const salaryInput = await page.$('input[name*="salary"], input[id*="compensation"]').catch(() => null);
      if (salaryInput && (await salaryInput.isVisible().catch(() => false))) {
        const cleanSalary = context.userProfile.expectedSalary.replace(/[^0-9]/g, '');
        await this.typeHumanized(page, salaryInput, cleanSalary);
        await logger.info('dice_fill_salary', 'Filled expected salary');
      }
    }

    // 5. Consent & Talent Community Checkboxes
    await this.handleConsentCheckboxes(page, logger);

    // 6. EEOC Demographics
    await this.handleEEOCDemographics(page, context.userProfile, logger);

    // 7. Universal Screening Questions
    await UniversalQuestionResolver.resolveAndFillQuestions(
      page,
      browser,
      context,
      logger,
      logger.getApiClient()
    );

    // 8. Advance through multi-step drawer (Next / Review)
    const nextBtn = await page.$('button:has-text("Next"), button:has-text("Review")').catch(() => null);
    if (nextBtn && (await nextBtn.isVisible().catch(() => false))) {
      await safeClick(page, 'button:has-text("Next"), button:has-text("Review")');
      await page.waitForTimeout(1500);
    }
  }

  async validate(
    browser: BrowserSession,
    context: WorkflowContext,
    logger: ExecutionLogger
  ): Promise<{ valid: boolean; issues: string[] }> {
    const page = browser.page;
    const issues: string[] = [];

    const errorBanners = await page.$$eval('[aria-invalid="true"], .error-feedback, .d-inline-error', (els) =>
      els.filter((e) => (e as HTMLElement).offsetParent !== null).map((e) => e.textContent?.trim() || '')
    ).catch(() => []);

    if (errorBanners.length > 0) {
      issues.push(...errorBanners);
    }

    return { valid: issues.length === 0, issues };
  }

  async finalize(
    browser: BrowserSession,
    context: WorkflowContext,
    logger: ExecutionLogger
  ): Promise<WorkflowResult> {
    const page = browser.page;

    if (context.simulationMode) {
      await logger.info('dice_simulated', 'Simulation mode: Dice application ready for submission');
      return {
        status: AutoApplyStatus.SIMULATED,
        canComplete: true,
        platform: this.platform,
        automationConfidence: 95,
        stepsCompleted: 4,
        stepsRemaining: 0,
        blockingIssue: null,
        estimatedSubmissionTime: '15s',
      };
    }

    // Live mode: Click final submit
    const submitBtn = await page.$('button:has-text("Submit Application"), button[data-cy="submit-application"]').catch(() => null);
    if (submitBtn && (await submitBtn.isVisible().catch(() => false))) {
      await page.waitForTimeout(1500);
      await submitBtn.hover().catch(() => {});
      await page.waitForTimeout(300);

      const initialUrl = page.url();
      await safeClick(page, 'button:has-text("Submit Application"), button[data-cy="submit-application"]');

      // Verify post-submission status
      await this.verifyPostSubmission(browser, page, logger, {
        platformDisplayName: 'Dice',
        initialUrl,
        confirmationKeywords: [
          'application submitted',
          'successfully applied',
          'application sent',
          'thank you for applying',
        ],
        errorSelectors: ['[role="alert"]', '.error-feedback', '.d-inline-error'],
        maxWaitMs: 30000,
      });
    }

    await logger.info('dice_submitted', 'Dice Easy Apply application submitted');

    return {
      status: AutoApplyStatus.APPLIED,
      canComplete: true,
      platform: this.platform,
      automationConfidence: 95,
      stepsCompleted: 5,
      stepsRemaining: 0,
      blockingIssue: null,
      estimatedSubmissionTime: null,
    };
  }
}

pluginRegistry.register(new DiceApplyPlugin());

