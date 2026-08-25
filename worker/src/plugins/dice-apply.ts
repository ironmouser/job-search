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

  async prepare(
    browser: BrowserSession,
    context: WorkflowContext,
    logger: ExecutionLogger
  ): Promise<void> {
    const page = browser.page;
    await logger.info('dice_prepare', 'Preparing Dice Easy Apply session');

    // 1. Check authentication
    const html = await browser.getHtml();
    const isLoggedOut =
      html.includes('Log In to Apply') ||
      html.includes('/dashboard/login') ||
      (await page.$('a[href*="/login"], button:has-text("Log In")').catch(() => null)) !== null;

    if (!context.connectedSession && isLoggedOut) {
      throw new InterventionError(
        InterventionReason.JOB_BOARD_AUTH_REQUIRED,
        'Dice requires you to connect your account before JAHQ can automate applications.',
        page.url()
      );
    }

    // 2. Click Easy Apply / Apply button
    const applyButtonSelectors = [
      'button:has-text("Easy Apply")',
      'button[data-cy="easy-apply-button"]',
      'button[aria-label="Easy Apply"]',
      'button:has-text("Apply Now")',
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

    // Wait for the slide-over drawer to appear
    await page.waitForTimeout(2000);
  }

  async apply(
    browser: BrowserSession,
    context: WorkflowContext,
    logger: ExecutionLogger
  ): Promise<void> {
    const page = browser.page;
    await logger.info('dice_apply', 'Processing Dice application drawer');

    // 1. Upload or select resume
    await this.uploadResumeFile(browser, page, context, logger);

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

