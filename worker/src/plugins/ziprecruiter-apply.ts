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
import { safeClick, safeInteract } from '../obstruction';
import { pluginRegistry } from '../registry';

/**
 * ZipRecruiterApplyPlugin
 *
 * Automates native "1-Click Apply" and "Quick Apply" job applications on ZipRecruiter.
 */
export class ZipRecruiterApplyPlugin extends ATSPlugin {
  readonly platform = ATSPlatform.ZIPRECRUITER_NATIVE;
  readonly displayName = 'ZipRecruiter 1-Click Apply';

  detect(url: string, html: string, redirectChain: string[]): ATSDetectionResult {
    const isZipDomain =
      url.includes('ziprecruiter.com') ||
      url.includes('zipapply.com') ||
      redirectChain.some((u) => u.includes('ziprecruiter.com') || u.includes('zipapply.com'));

    if (!isZipDomain) {
      return {
        platform: ATSPlatform.UNKNOWN,
        confidence: 0,
        detectedFeatures: [],
        automationSupported: false,
      };
    }

    const hasOneClickApply =
      html.includes('1-Click Apply') ||
      html.includes('1-click-apply') ||
      html.includes('one_click_apply') ||
      html.includes('Quick Apply') ||
      html.includes('zipapply');

    // If it doesn't have native 1-click apply, allow AggregatorHandler to discover external ATS links
    if (!hasOneClickApply) {
      return {
        platform: ATSPlatform.ZIPRECRUITER_NATIVE,
        confidence: 20,
        detectedFeatures: ['ziprecruiter_domain'],
        automationSupported: false,
      };
    }

    return {
      platform: ATSPlatform.ZIPRECRUITER_NATIVE,
      confidence: 90,
      detectedFeatures: ['ziprecruiter_domain', 'one_click_apply_button'],
      automationSupported: true,
    };
  }

  async prepare(
    browser: BrowserSession,
    context: WorkflowContext,
    logger: ExecutionLogger
  ): Promise<void> {
    const page = browser.page;
    await logger.info('ziprecruiter_prepare', 'Preparing ZipRecruiter 1-Click Apply session');

    // Proactively dismiss any cookie or privacy consent modal
    await this.dismissCookieBannerIfPresent(page, logger);

    // 1. Verify Authentication
    const html = await browser.getHtml();
    const isLoggedOut =
      html.includes('Sign In to Apply') ||
      html.includes('Sign in or create an account') ||
      html.includes('action="/login"') ||
      (await page.$('button:has-text("Sign In to Apply"), a:has-text("Sign In to Apply")').catch(() => null)) !== null;

    // If no connected session was passed or session is logged out
    if (!context.connectedSession && isLoggedOut) {
      const email = context.userProfile?.accountEmail || context.userProfile?.email;
      const password = context.userProfile?.accountPassword;
      if (email && password) {
        await this.checkAccountGate(page, context.jobUrl, this.displayName, context);
      } else {
        throw new InterventionError(
          InterventionReason.JOB_BOARD_AUTH_REQUIRED,
          'ZipRecruiter requires you to connect your account before JAHQ can automate 1-Click applications.',
          page.url()
        );
      }
    }

    // 2. Locate 1-Click Apply / Quick Apply button
    const applyButtonSelectors = [
      'button[data-testid="one-click-apply-button"]',
      'button:has-text("1-Click Apply")',
      'button:has-text("1-click apply")',
      'button:has-text("Quick Apply")',
      'a:has-text("1-Click Apply")',
      'button[data-testid="apply-button"]',
      'button.job_apply_button',
    ];

    let clicked = false;
    for (const selector of applyButtonSelectors) {
      const btn = await page.$(selector).catch(() => null);
      if (btn && (await btn.isVisible().catch(() => false))) {
        await logger.info('ziprecruiter_click_apply', `Clicking ZipRecruiter apply button: ${selector}`);
        await safeClick(page, selector);
        clicked = true;
        break;
      }
    }

    if (!clicked) {
      await logger.warn('ziprecruiter_no_apply_btn', 'Could not locate standard 1-Click Apply button');
      throw new InterventionError(
        InterventionReason.UNEXPECTED_PAGE,
        'Could not locate the ZipRecruiter 1-Click Apply button on this job posting. The position may require applying directly on the employer site.',
        page.url()
      );
    }

    await page.waitForTimeout(2000);
  }

  async apply(
    browser: BrowserSession,
    context: WorkflowContext,
    logger: ExecutionLogger
  ): Promise<void> {
    const page = browser.page;
    await logger.info('ziprecruiter_apply', 'Processing ZipRecruiter application fields');

    // 1. Handle phone input if requested in modal
    const phoneInput = await page.$('input[type="tel"], input[name*="phone"], input[id*="phone"]').catch(() => null);
    if (phoneInput && (await phoneInput.isVisible().catch(() => false)) && context.userProfile.phone) {
      const currentVal = await phoneInput.inputValue().catch(() => '');
      if (!currentVal) {
        await this.typeHumanized(page, phoneInput, context.userProfile.phone);
        await logger.info('ziprecruiter_fill_phone', 'Filled phone number');
      }
    }

    // 2. Answer standard boolean eligibility questions (US Work Auth, 18+ years old)
    const radioGroups = await page.$$('input[type="radio"]').catch(() => []);
    for (const radio of radioGroups) {
      try {
        const label = await page.evaluate((el) => {
          const lbl = el.closest('label') || document.querySelector(`label[for="${el.id}"]`);
          return lbl?.textContent?.toLowerCase() || '';
        }, radio);

        if (label.includes('authorized to work') || label.includes('legally authorized') || label.includes('18 years of age')) {
          const value = await radio.getAttribute('value');
          if (value === 'yes' || value === 'true' || value === '1' || label.includes('yes')) {
            await radio.check().catch(() => {});
          }
        }
      } catch {
        // Skip unprocessable radio
      }
    }

    // 3. Upload resume if file input is presented
    await this.uploadResumeFile(browser, page, context, logger);

    // 3b. Upload cover letter (optional)
    if (context.coverLetterMarkdown) {
      await this.uploadCoverLetterFile(browser, page, context, logger);
    }

    // 4. Consent & Talent Community Checkboxes
    await this.handleConsentCheckboxes(page, logger);

    // 5. EEOC Demographics
    await this.handleEEOCDemographics(page, context.userProfile, logger);

    // 6. Universal Question Resolver
    const { UniversalQuestionResolver } = await import('./question-resolver');
    await UniversalQuestionResolver.resolveAndFillQuestions(
      page,
      browser,
      context,
      logger,
      logger.getApiClient()
    );

    await page.waitForTimeout(1000);
  }

  async validate(
    browser: BrowserSession,
    context: WorkflowContext,
    logger: ExecutionLogger
  ): Promise<{ valid: boolean; issues: string[] }> {
    const page = browser.page;
    const issues: string[] = [];

    // Check for error validation banners
    const errors = await page.$$eval('.error-message, [aria-invalid="true"], .invalid-feedback', (els) =>
      els.filter((e) => (e as HTMLElement).offsetParent !== null).map((e) => e.textContent?.trim() || '')
    ).catch(() => []);

    if (errors.length > 0) {
      issues.push(...errors);
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
      await logger.info('ziprecruiter_simulated', 'Simulation mode: application ready for submission');
      return {
        status: AutoApplyStatus.SIMULATED,
        canComplete: true,
        platform: this.platform,
        automationConfidence: 95,
        stepsCompleted: 4,
        stepsRemaining: 0,
        blockingIssue: null,
        estimatedSubmissionTime: '10s',
      };
    }

    // Live mode: Locate final submit button
    const submitBtn = await this.findSubmitButton(
      page,
      logger,
      [
        'button:has-text("Submit Application")',
        'button:has-text("Send Application")',
        'button:has-text("Apply Now")',
        'button[type="submit"]',
        'button:has-text("Confirm")',
      ]
    );

    if (!submitBtn) {
      await logger.warn('ziprecruiter_no_submit_btn', 'Could not locate submit button on ZipRecruiter application form');
      throw new InterventionError(
        InterventionReason.UNEXPECTED_PAGE,
        'Could not locate the submit button on the ZipRecruiter application form.',
        page.url()
      );
    }

    await page.waitForTimeout(1500);
    await submitBtn.hover().catch(() => {});
    await page.waitForTimeout(300);

    const initialUrl = page.url();
    await submitBtn.click();

    // Verify post-submission status
    await this.verifyPostSubmission(browser, page, logger, {
      platformDisplayName: 'ZipRecruiter',
      initialUrl,
      confirmationKeywords: [
        'application submitted',
        'application sent',
        'thank you for applying',
        'successfully applied',
      ],
      errorSelectors: ['[role="alert"]', '.error_message', '.error-text'],
      maxWaitMs: 30000,
    });

    await logger.info('ziprecruiter_submitted', 'ZipRecruiter application successfully submitted');

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

pluginRegistry.register(new ZipRecruiterApplyPlugin());

