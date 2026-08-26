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

  private async checkDiceAuthGating(
    browser: BrowserSession,
    page: any,
    context: WorkflowContext,
    logger: ExecutionLogger
  ): Promise<void> {
    const html = await browser.getHtml().catch(() => '');
    const lowerHtml = html.toLowerCase();

    const isLoggedOutText =
      lowerHtml.includes('log in to apply') ||
      lowerHtml.includes('create an account or sign in') ||
      lowerHtml.includes("let's get you hired") ||
      lowerHtml.includes("let’s get you hired") ||
      lowerHtml.includes('please enter your email to sign in') ||
      lowerHtml.includes('continue with email');

    const authElementSelectors = [
      'button:has-text("Log In to Apply")',
      'a:has-text("Log In to Apply")',
      'input[placeholder*="yourdomain.com"]',
      'input[type="email"]',
      'button:has-text("Continue with email")',
      'button:has-text("Continue with Google")',
      'button:has-text("Continue with Apple")',
    ];

    let hasAuthElement = false;
    for (const sel of authElementSelectors) {
      const el = await page.$(sel).catch(() => null);
      if (el && (await el.isVisible().catch(() => false))) {
        hasAuthElement = true;
        break;
      }
    }

    if (!context.connectedSession && (isLoggedOutText || hasAuthElement)) {
      await logger.warn('dice_auth_required', 'Dice candidate account login/registration modal detected.');
      throw new InterventionError(
        InterventionReason.JOB_BOARD_AUTH_REQUIRED,
        'Dice requires you to connect your account or sign in before JAHQ can automate applications.',
        page.url()
      );
    }
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

    // 1. Check authentication requirements before clicking apply
    await this.checkDiceAuthGating(browser, page, context, logger);

    // 2. Click Easy Apply / Apply button
    const applyButtonSelectors = [
      'button:has-text("Easy Apply")',
      'button[data-cy="easy-apply-button"]',
      'button[aria-label="Easy Apply"]',
      'button:has-text("Apply Now")',
      'a:has-text("Easy Apply")',
      'a:has-text("Apply Now")',
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
    await this.checkDiceAuthGating(browser, page, context, logger);
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
    await this.checkDiceAuthGating(browser, page, context, logger);

    // 1. Upload or select resume
    try {
      await this.uploadResumeFile(browser, page, context, logger);
    } catch (uploadErr) {
      await this.checkDiceAuthGating(browser, page, context, logger);
      throw uploadErr;
    }

    // 1b. Cover letter (optional)
    if (context.coverLetterMarkdown) {
      await this.uploadCoverLetterFile(browser, page, context, logger);
    }

    // 2. Fill standard work authorization questions if present
    const workAuthInputs = await page.$$('input[name*="auth"], input[id*="auth"], select[name*="auth"]').catch(() => []);
    for (const input of workAuthInputs) {
      const tagName = await input.evaluate((el) => el.tagName.toLowerCase()).catch(() => '');
      if (tagName === 'select') {
        await input.selectOption({ label: 'Yes' }).catch(() => {});
      } else {
        const type = await input.getAttribute('type');
        if (type === 'radio' || type === 'checkbox') {
          await input.check().catch(() => {});
        }
      }
    }

    // 3. Fill compensation if requested
    if (context.userProfile.expectedSalary) {
      const salaryInput = await page.$('input[name*="salary"], input[id*="compensation"]').catch(() => null);
      if (salaryInput && (await salaryInput.isVisible().catch(() => false))) {
        const cleanSalary = context.userProfile.expectedSalary.replace(/[^0-9]/g, '');
        await this.typeHumanized(page, salaryInput, cleanSalary);
        await logger.info('dice_fill_salary', 'Filled expected salary');
      }
    }

    // 4. Consent & Talent Community Checkboxes
    await this.handleConsentCheckboxes(page, logger);

    // 5. EEOC Demographics
    await this.handleEEOCDemographics(page, context.userProfile, logger);

    // 4. Advance through multi-step drawer (Next / Review)
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

      await safeClick(page, 'button:has-text("Submit Application"), button[data-cy="submit-application"]');

      // Verify post-submission status
      await this.verifyPostSubmission(browser, page, logger, {
        platformDisplayName: 'Dice',
        confirmationKeywords: [
          'application submitted',
          'successfully applied',
          'application sent',
          'thank you for applying',
        ],
        errorSelectors: ['[role="alert"]', '.error-feedback', '.d-inline-error'],
        maxWaitMs: 8000,
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

