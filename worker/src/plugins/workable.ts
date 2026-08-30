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
 * WorkablePlugin — automation plugin for Workable ATS (apply.workable.com).
 */
export class WorkablePlugin extends ATSPlugin {
  readonly platform = ATSPlatform.WORKABLE;
  readonly displayName = 'Workable';

  detect(url: string, html: string, redirectChain: string[]): ATSDetectionResult {
    let confidence = 0;
    const detectedFeatures: string[] = [];
    const allUrls = [url, ...redirectChain];

    for (const u of allUrls) {
      try {
        const hostname = new URL(u).hostname.toLowerCase();
        if (hostname === 'apply.workable.com' || hostname.endsWith('.workable.com')) {
          confidence += 85;
          detectedFeatures.push('hostname:workable.com');
          break;
        }
      } catch {}
    }

    if (html.includes('data-ui="application-form"') || html.includes('workable-jobs') || html.includes('workable.com')) {
      confidence += 15;
      detectedFeatures.push('html:workable-form');
    }

    return {
      platform: ATSPlatform.WORKABLE,
      confidence: Math.min(confidence, 100),
      detectedFeatures,
      automationSupported: true,
    };
  }

  async prepare(browser: BrowserSession, context: WorkflowContext, logger: ExecutionLogger): Promise<void> {
    await logger.info('plugin_loaded', `Workable plugin active — navigating to ${context.jobUrl}`);

    let applyUrl = context.jobUrl;
    if (!applyUrl.includes('/apply') && applyUrl.includes('apply.workable.com')) {
      applyUrl = applyUrl.endsWith('/') ? `${applyUrl}apply` : `${applyUrl}/apply`;
    }

    await browser.navigate(applyUrl, 'domcontentloaded');
    await logger.info('page_navigated', `Loaded Workable URL: ${applyUrl}`);
    await browser.page.waitForTimeout(1500);
    await this.dismissCookieBannerIfPresent(browser.page, logger);
    await this.checkClosedJob(browser, logger, applyUrl);

    // If application elements are not yet present, look for and click the Apply button
    await this.ensureApplicationFormReached(browser, context, logger, {
      customApplySelectors: [
        'button[data-ui="apply-button"]',
        'a[data-ui="apply-button"]',
        'button:has-text("Apply for this job")',
        'a:has-text("Apply for this job")',
        'button:has-text("Apply")',
        'a:has-text("Apply")',
      ],
    });
  }

  async apply(browser: BrowserSession, context: WorkflowContext, logger: ExecutionLogger): Promise<void> {
    await logger.info('apply_started', 'Locating Workable form fields...');
    await this.dismissCookieBannerIfPresent(browser.page, logger);
    const targetContext: Frame | Page = await browser.findFormFrame([
      'input[name="firstname"]',
      'input[name="first_name"]',
      'input[name="name"]',
      'input[type="file"]',
      'form',
    ]);

    const profile = context.userProfile;
    const nameParts = (profile.name || '').split(' ');
    // 1. Core candidate information & contact fields (Name, Email, Phone, Company, Location, LinkedIn, Portfolio)
    await this.autofillStandardFields(targetContext, profile, logger, context);

    // 2. Resume File Upload (automatically awaits parser settlement)
    await this.uploadResumeFile(browser, targetContext, context, logger);

    // 2b. Cover Letter Upload (optional)
    if (context.coverLetterMarkdown) {
      await this.uploadCoverLetterFile(browser, targetContext, context, logger);
    }

    // 3. Consent & Talent Community Checkboxes
    await this.handleConsentCheckboxes(targetContext, logger);

    // 4. Work Authorization & EEOC Demographics
    await this.handleEEOCDemographics(targetContext, profile, logger);

    // 5. Custom screening questions
    await UniversalQuestionResolver.resolveAndFillQuestions(
      targetContext,
      browser,
      context,
      logger,
      logger.getApiClient()
    );

    await logger.info('form_filling_complete', 'Workable form fields filled');
  }

  async validate(browser: BrowserSession, context: WorkflowContext, logger: ExecutionLogger): Promise<{ valid: boolean; issues: string[] }> {
    const targetContext = await browser.findFormFrame(['input[name="email"]', 'form']);
    return this.validateStandardForm(targetContext, context.userProfile, logger, {
      errorSelectors: ['[data-ui*="error" i]', '[class*="error" i]'],
    });
  }

  async finalize(browser: BrowserSession, context: WorkflowContext, logger: ExecutionLogger): Promise<WorkflowResult> {
    const targetContext = await browser.findFormFrame(['button[type="submit"]', 'form']);

    if (context.simulationMode) {
      const screenshotPath = await browser.screenshot('workable-review.png');
      await logger.info('simulation_completed', 'Completed Workable application simulation', { screenshotPath });
      return {
        status: AutoApplyStatus.SIMULATED,
        canComplete: true,
        platform: ATSPlatform.WORKABLE,
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
      throw new InterventionError(InterventionReason.UNEXPECTED_PAGE, 'Could not find submit button on Workable form', context.jobUrl);
    }

    await browser.page.waitForTimeout(1500);
    await submitBtn.hover().catch(() => {});
    await browser.page.waitForTimeout(300);

    const initialUrl = browser.page.url();
    await submitBtn.click();

    // Verify post-submission status
    await this.verifyPostSubmission(browser, targetContext, logger, {
      platformDisplayName: 'Workable',
      initialUrl,
      confirmationKeywords: [
        'thank you for applying',
        'application submitted',
        'application received',
        'successfully applied',
      ],
      errorSelectors: ['[role="alert"]', '.error-message', '[data-ui="error-message"]'],
      maxWaitMs: 30000,
    });

    const screenshotPath = await browser.screenshot('workable-submitted.png');
    await logger.info('application_submitted', 'Submitted Workable application live', { screenshotPath });

    return {
      status: AutoApplyStatus.APPLIED,
      canComplete: true,
      platform: ATSPlatform.WORKABLE,
      automationConfidence: 95,
      stepsCompleted: 4,
      stepsRemaining: 0,
      blockingIssue: null,
      estimatedSubmissionTime: null,
    };
  }
}

pluginRegistry.register(new WorkablePlugin());
