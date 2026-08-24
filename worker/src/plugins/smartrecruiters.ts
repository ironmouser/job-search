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
import { Frame, Page } from 'playwright';
import { UniversalQuestionResolver } from './question-resolver';

/**
 * SmartRecruitersPlugin — automation plugin for SmartRecruiters ATS.
 */
export class SmartRecruitersPlugin extends ATSPlugin {
  readonly platform = ATSPlatform.SMARTRECRUITERS;
  readonly displayName = 'SmartRecruiters';

  detect(url: string, html: string, redirectChain: string[]): ATSDetectionResult {
    let confidence = 0;
    const detectedFeatures: string[] = [];
    const allUrls = [url, ...redirectChain];

    for (const u of allUrls) {
      try {
        const hostname = new URL(u).hostname.toLowerCase();
        if (hostname.endsWith('.smartrecruiters.com') || hostname === 'careers.smartrecruiters.com') {
          confidence += 85;
          detectedFeatures.push('hostname:smartrecruiters.com');
          break;
        }
      } catch {}
    }

    if (html.includes('st-apply-form') || html.includes('id="st-apply"') || html.includes('smartrecruiters-widget')) {
      confidence += 15;
      detectedFeatures.push('html:st-apply-form');
    }

    return {
      platform: ATSPlatform.SMARTRECRUITERS,
      confidence: Math.min(confidence, 100),
      detectedFeatures,
      automationSupported: true,
    };
  }

  private async checkAccessRestriction(browser: BrowserSession, logger: ExecutionLogger, url: string): Promise<void> {
    const pageText = ((await browser.page.textContent('body').catch(() => '')) || '').toLowerCase();
    const isRestricted =
      pageText.includes('access is temporarily restricted') ||
      pageText.includes('we detected unusual activity') ||
      pageText.includes('automated (bot) activity') ||
      pageText.includes('rapid taps or clicks');

    if (isRestricted) {
      await logger.warn('anti_bot_restriction_detected', 'SmartRecruiters anti-bot access restriction screen detected');
      throw new InterventionError(
        InterventionReason.APPLICATION_BLOCKED_BY_BOT_CHALLENGE,
        'SmartRecruiters temporarily restricted access due to automated activity or network IP reputation. Routing via residential proxy is required.',
        browser.page.url() || url
      );
    }
  }

  async prepare(browser: BrowserSession, context: WorkflowContext, logger: ExecutionLogger): Promise<void> {
    await logger.info('plugin_loaded', `SmartRecruiters plugin active — navigating to ${context.jobUrl}`);
    await browser.navigate(context.jobUrl, 'domcontentloaded');
    await browser.page.waitForTimeout(1500);
    await this.dismissCookieBannerIfPresent(browser.page, logger);

    // Check for access restriction or closed position early
    await this.checkAccessRestriction(browser, logger, context.jobUrl);
    await this.checkClosedJob(browser, logger, context.jobUrl);

    // Organic browsing simulation: natural reading scroll
    await browser.page.evaluate(() => {
      window.scrollBy({ top: 350 + Math.floor(Math.random() * 200), behavior: 'smooth' });
    }).catch(() => {});
    await browser.page.waitForTimeout(800 + Math.floor(Math.random() * 600));

    // If an "I'm interested" or "Apply" button is present on the page, hover and click it
    const applyBtn = await browser.page.$(
      'button:has-text("I\'m interested"), a:has-text("I\'m interested"), button:has-text("Apply"), a:has-text("Apply for this job")'
    ).catch(() => null);

    if (applyBtn) {
      await applyBtn.hover().catch(() => {});
      await browser.page.waitForTimeout(300 + Math.floor(Math.random() * 200));
      await applyBtn.click().catch(() => {});
      await browser.page.waitForTimeout(1500);
    }

    await this.checkAccessRestriction(browser, logger, context.jobUrl);
  }

  async apply(browser: BrowserSession, context: WorkflowContext, logger: ExecutionLogger): Promise<void> {
    await this.checkAccessRestriction(browser, logger, context.jobUrl);
    await logger.info('apply_started', 'Filling SmartRecruiters application form...');
    const targetContext: Frame | Page = await browser.findFormFrame([
      '#first-name-input',
      'input[name="first-name"]',
      'input[name="firstName"]',
      'input[type="file"]',
      'form',
    ]);

    const profile = context.userProfile;
    const nameParts = (profile.name || '').split(' ');
    const firstName = nameParts[0] || '';
    const lastName = nameParts.slice(1).join(' ') || '';

    // 1. First & Last Name
    const fnInput = await targetContext.$(
      '#first-name-input, input[name="firstName"], input[name="first-name"], input[autocomplete="given-name"]'
    );
    if (fnInput && firstName) {
      await this.typeHumanized(targetContext, fnInput, firstName);
      await browser.page.waitForTimeout(200 + Math.floor(Math.random() * 200));
    }

    const lnInput = await targetContext.$(
      '#last-name-input, input[name="lastName"], input[name="last-name"], input[autocomplete="family-name"]'
    );
    if (lnInput && lastName) {
      await this.typeHumanized(targetContext, lnInput, lastName);
      await browser.page.waitForTimeout(200 + Math.floor(Math.random() * 200));
    }

    // 2. Email
    const email = await targetContext.$(
      '#email-input, input[name="email"], input[type="email"]'
    );
    if (email && profile.email) {
      await this.typeHumanized(targetContext, email, profile.email);
      await browser.page.waitForTimeout(200 + Math.floor(Math.random() * 200));
    }

    // 3. Phone
    const phone = await targetContext.$(
      '#phone-number-input, input[name="phoneNumber"], input[type="tel"]'
    );
    if (phone && profile.phone) {
      await this.typeHumanized(targetContext, phone, profile.phone);
      await browser.page.waitForTimeout(200 + Math.floor(Math.random() * 200));
    }

    // 4. Resume File Upload
    const fileInput = await targetContext.$('input[type="file"]');
    if (fileInput && context.resumeMarkdown) {
      const pdfPath = await browser.writeMarkdownToPdf(context.resumeMarkdown, 'Resume.pdf');
      await fileInput.setInputFiles(pdfPath);
      await logger.info('file_uploaded', 'Uploaded PDF resume to SmartRecruiters');
      await browser.page.waitForTimeout(500);
    }

    // 5. Consent & Privacy Checkboxes
    await this.handleConsentCheckboxes(targetContext, logger);

    // 6. Work Authorization & EEOC Demographics
    await this.handleEEOCDemographics(targetContext, profile, logger);

    // 7. Custom questions & screening questions
    await UniversalQuestionResolver.resolveAndFillQuestions(
      targetContext,
      browser,
      context,
      logger,
      logger.getApiClient()
    );

    await logger.info('form_filling_complete', 'Completed filling SmartRecruiters form fields');
  }

  async validate(browser: BrowserSession, context: WorkflowContext, logger: ExecutionLogger): Promise<{ valid: boolean; issues: string[] }> {
    await this.checkAccessRestriction(browser, logger, context.jobUrl);
    const issues: string[] = [];
    const targetContext = await browser.findFormFrame(['input[type="email"]', '#email-input', 'form']);

    const emailVal = await targetContext.$eval(
      '#email-input, input[name="email"], input[type="email"]',
      (el: any) => el.value
    ).catch(() => null);

    if (!emailVal) issues.push('Email field is required');

    return { valid: issues.length === 0, issues };
  }

  async finalize(browser: BrowserSession, context: WorkflowContext, logger: ExecutionLogger): Promise<WorkflowResult> {
    const targetContext = await browser.findFormFrame(['button[type="submit"]', 'form']);

    if (context.simulationMode) {
      const screenshotPath = await browser.screenshot('smartrecruiters-review.png');
      await logger.info('simulation_completed', 'Completed SmartRecruiters simulation', { screenshotPath });
      return {
        status: AutoApplyStatus.SIMULATED,
        canComplete: true,
        platform: ATSPlatform.SMARTRECRUITERS,
        automationConfidence: 90,
        stepsCompleted: 3,
        stepsRemaining: 0,
        blockingIssue: null,
        estimatedSubmissionTime: null,
      };
    }

    const submitBtn = await this.findSubmitButton(targetContext, logger);
    if (!submitBtn) {
      await this.checkClosedJob(browser, logger, context.jobUrl);
      throw new InterventionError(InterventionReason.UNEXPECTED_PAGE, 'Submit button not found on SmartRecruiters form', context.jobUrl);
    }

    await browser.page.waitForTimeout(1500);
    await submitBtn.hover().catch(() => {});
    await browser.page.waitForTimeout(300);

    await submitBtn.click();

    // Verify post-submission status
    await this.verifyPostSubmission(browser, targetContext, logger, {
      platformDisplayName: 'SmartRecruiters',
      confirmationKeywords: [
        'thank you for applying',
        'application received',
        'application submitted',
        'successfully applied',
      ],
      errorSelectors: ['[role="alert"]', '.error-message', 'oc-error-message'],
      maxWaitMs: 8000,
    });

    const screenshotPath = await browser.screenshot('smartrecruiters-submitted.png');
    await logger.info('application_submitted', 'Submitted SmartRecruiters application live', { screenshotPath });

    return {
      status: AutoApplyStatus.APPLIED,
      canComplete: true,
      platform: ATSPlatform.SMARTRECRUITERS,
      automationConfidence: 95,
      stepsCompleted: 4,
      stepsRemaining: 0,
      blockingIssue: null,
      estimatedSubmissionTime: null,
    };
  }
}

pluginRegistry.register(new SmartRecruitersPlugin());
