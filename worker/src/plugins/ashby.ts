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
 * AshbyPlugin — automation plugin for Ashby ATS.
 * Supports direct jobs.ashbyhq.com pages and custom sites embedding Ashby forms via iframes.
 */
export class AshbyPlugin extends ATSPlugin {
  readonly platform = ATSPlatform.ASHBY;
  readonly displayName = 'Ashby';

  detect(url: string, html: string, redirectChain: string[]): ATSDetectionResult {
    let confidence = 0;
    const detectedFeatures: string[] = [];
    const allUrls = [url, ...redirectChain];

    for (const u of allUrls) {
      try {
        const parsed = new URL(u);
        const hostname = parsed.hostname.toLowerCase();
        if (hostname === 'jobs.ashbyhq.com' || hostname.endsWith('.ashbyhq.com')) {
          confidence += 85;
          detectedFeatures.push('hostname:ashbyhq.com');
          break;
        }
        if (parsed.search.includes('ashby_jid') || parsed.hash.includes('ashby_embed')) {
          confidence += 80;
          detectedFeatures.push('url-param:ashby');
          break;
        }
      } catch {}
    }

    if (html.includes('data-ashby-job') || html.includes('ashby-embed') || html.includes('ashby-application-form')) {
      confidence += 15;
      detectedFeatures.push('html:ashby-embed');
    }
    if (html.toLowerCase().includes('ashby')) {
      confidence += 5;
      detectedFeatures.push('html:ashby-reference');
    }

    return {
      platform: ATSPlatform.ASHBY,
      confidence: Math.min(confidence, 100),
      detectedFeatures,
      automationSupported: true,
    };
  }

  async prepare(browser: BrowserSession, context: WorkflowContext, logger: ExecutionLogger): Promise<void> {
    await logger.info('plugin_loaded', `Ashby plugin active — navigating to ${context.jobUrl}`);
    await browser.navigate(context.jobUrl, 'domcontentloaded');
    await logger.info('page_navigated', `Loaded page: ${context.jobUrl}`);

    await browser.page.waitForTimeout(1500);
    await this.dismissCookieBannerIfPresent(browser.page, logger);
    await this.checkClosedJob(browser, logger, context.jobUrl);

    // 1. Ensure "Application" tab is activated if Ashby renders a dual Overview/Application layout
    const appTabSelectors = [
      '[role="tab"]:has-text("Application")',
      'button:has-text("Application")',
      'a:has-text("Application")',
      'a[href*="/application"]',
      '[data-testid*="application" i]',
    ];
    for (const sel of appTabSelectors) {
      const tabEl = browser.page.locator(sel).first();
      if ((await tabEl.count().catch(() => 0)) > 0 && (await tabEl.isVisible().catch(() => false))) {
        await tabEl.click({ force: true }).catch(() => null);
        await logger.info('tab_switched', 'Switched to Ashby Application tab');
        break;
      }
    }

    // 2. Wait for Ashby SPA "Fetching application form" loader to resolve
    const startTime = Date.now();
    while (Date.now() - startTime < 15000) {
      const isFetching = (await browser.page.locator('text="Fetching application form", text="Loading", [class*="spinner" i]').count().catch(() => 0)) > 0;
      const hasFormElements = (await browser.page.locator('input[name="name"], input[autocomplete="name"], input[type="file"], .ashby-application-form, form').count().catch(() => 0)) > 0;

      if (hasFormElements && !isFetching) {
        break;
      }
      await browser.page.waitForTimeout(500);
    }
  }

  async apply(browser: BrowserSession, context: WorkflowContext, logger: ExecutionLogger): Promise<void> {
    await logger.info('apply_started', 'Locating Ashby application form context...');

    const targetContext: Frame | Page = await browser.findFormFrame([
      'input[name="name"]',
      'input[autocomplete="name"]',
      'input[type="file"]',
      'button[type="submit"]',
      '.ashby-application-form',
      'form',
    ], 15000);

    const profile = context.userProfile;

    // 1. Core candidate information & contact fields (Name, Email, Phone, Company, Location, LinkedIn, Portfolio)
    await this.autofillStandardFields(targetContext, profile, logger, context);

    // 2. Resume Upload (automatically awaits OCR parser settlement)
    await this.uploadResumeFile(browser, targetContext, context, logger, {
      specificSelectors: [
        '.ashby-application-form-file-upload input[type="file"]',
        'input[type="file"][accept*="pdf"]',
      ],
    });

    // 2b. Cover Letter Upload (optional)
    if (context.coverLetterMarkdown) {
      await this.uploadCoverLetterFile(browser, targetContext, context, logger);
    }

    // 3. Consent & Future Opportunity Checkboxes (e.g. "Do you agree to allow Mural to contact you...")
    await this.handleConsentCheckboxes(targetContext, logger);

    // 4. Work Authorization, Sponsorship, and EEOC Demographics (Veteran, Disability, Gender, Race)
    await this.handleEEOCDemographics(targetContext, profile, logger);

    // 5. Custom questions & screening questions
    await UniversalQuestionResolver.resolveAndFillQuestions(
      targetContext,
      browser,
      context,
      logger,
      logger.getApiClient()
    );

    await logger.info('form_filling_complete', 'Completed filling Ashby application fields');
  }

  async validate(browser: BrowserSession, context: WorkflowContext, logger: ExecutionLogger): Promise<{ valid: boolean; issues: string[] }> {
    const targetContext = await browser.findFormFrame(['input[name="name"]', 'input[type="email"]', 'form']);
    return this.validateStandardForm(targetContext, context.userProfile, logger, {
      errorSelectors: ['.ashby-application-form-error'],
    });
  }

  async finalize(browser: BrowserSession, context: WorkflowContext, logger: ExecutionLogger): Promise<WorkflowResult> {
    // The Ashby submit button has no type="submit" — it uses the class
    // `ashby-application-form-submit-button`. Include that class in the probe
    // selectors so findFormFrame resolves to the embedded iframe rather than
    // falling back to the main page where the button doesn't exist.
    const targetContext = await browser.findFormFrame([
      '.ashby-application-form-submit-button',
      'button[type="submit"]',
      'form',
    ]);

    if (context.simulationMode) {
      const screenshotPath = await browser.screenshot('ashby-review.png');
      await logger.info('simulation_completed', 'Completed Ashby application simulation', { screenshotPath });
      return {
        status: AutoApplyStatus.SIMULATED,
        canComplete: true,
        platform: ATSPlatform.ASHBY,
        automationConfidence: 90,
        stepsCompleted: 3,
        stepsRemaining: 0,
        blockingIssue: null,
        estimatedSubmissionTime: null,
      };
    }

    // Live submission — use the shared priority-ordered search from ATSPlugin.
    // Ashby's stable semantic class is passed as Tier 1 so we survive CSS Module
    // hash rotations on the obfuscated class names.
    const submitBtn = await this.findSubmitButton(
      targetContext,
      logger,
      ['.ashby-application-form-submit-button']
    );
    if (!submitBtn) {
      await this.checkClosedJob(browser, logger, context.jobUrl);
      throw new InterventionError(InterventionReason.UNEXPECTED_PAGE, 'Could not find submit button on Ashby application form', context.jobUrl);
    }

    // Natural human deliberation delay before submitting (1.5 - 2s)
    await browser.page.waitForTimeout(1800);
    await submitBtn.hover().catch(() => {});
    await browser.page.waitForTimeout(400);

    await submitBtn.click();

    // Verify post-submission status (checks for spam filter flags, limits, validation errors, and confirms success)
    await this.verifyPostSubmission(browser, targetContext, logger, {
      platformDisplayName: 'Ashby',
      confirmationSelectors: [
        '[data-testid="application-submitted-page"]',
        '.ashby-application-form-confirmation',
        '[class*="Confirmation" i]',
        '[class*="Submitted" i]',
        'h1:has-text("Thank you")',
        'h2:has-text("Thank you")',
      ],
      confirmationKeywords: [
        'thank you for applying',
        'thanks for applying',
        'application submitted',
        'application received',
        'we have received your application',
        'your application has been received',
        'your application was submitted',
        'we received your application',
        'thanks for your interest',
        'application submitted successfully',
      ],
      errorSelectors: [
        '.ashby-application-form-error',
        '[role="alert"]',
        '[class*="errorBanner" i]',
        '[class*="Banner" i]',
      ],
      maxWaitMs: 30000,
    });

    const screenshotPath = await browser.screenshot('ashby-submitted.png');
    await logger.info('application_submitted', 'Submitted Ashby application live', { screenshotPath });

    return {
      status: AutoApplyStatus.APPLIED,
      canComplete: true,
      platform: ATSPlatform.ASHBY,
      automationConfidence: 95,
      stepsCompleted: 4,
      stepsRemaining: 0,
      blockingIssue: null,
      estimatedSubmissionTime: null,
    };
  }

}


pluginRegistry.register(new AshbyPlugin());
