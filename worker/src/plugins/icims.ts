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

/**
 * ICIMSPlugin — automation plugin for iCIMS ATS.
 */
export class ICIMSPlugin extends ATSPlugin {
  readonly platform = ATSPlatform.ICIMS;
  readonly displayName = 'iCIMS';

  detect(url: string, html: string, redirectChain: string[]): ATSDetectionResult {
    let confidence = 0;
    const detectedFeatures: string[] = [];
    const allUrls = [url, ...redirectChain];

    for (const u of allUrls) {
      try {
        const hostname = new URL(u).hostname.toLowerCase();
        if (hostname.endsWith('.icims.com') || hostname.startsWith('careers-')) {
          confidence += 85;
          detectedFeatures.push('hostname:icims.com');
          break;
        }
      } catch {}
    }

    if (html.includes('iCIMS_MainWrapper') || html.includes('iCIMS') || html.includes('icims.js')) {
      confidence += 15;
      detectedFeatures.push('html:iCIMS_MainWrapper');
    }

    return {
      platform: ATSPlatform.ICIMS,
      confidence: Math.min(confidence, 100),
      detectedFeatures,
      automationSupported: true,
    };
  }

  async prepare(browser: BrowserSession, context: WorkflowContext, logger: ExecutionLogger): Promise<void> {
    await logger.info('plugin_loaded', `iCIMS plugin active — navigating to ${context.jobUrl}`);
    await browser.navigate(context.jobUrl, 'domcontentloaded');
    await browser.page.waitForTimeout(2500);
    await this.checkClosedJob(browser, logger, context.jobUrl);

    // Look for iCIMS iframe if present
    const frame = await browser.findFormFrame(['#icims_content_iframe', 'iframe[name="icims_iframe"]', 'form']);
    if (frame && 'url' in frame && frame !== browser.page) {
      await logger.info('iframe_detected', 'Found iCIMS application iframe');
    }

    await this.checkAccountGate(browser.page, context.jobUrl, this.displayName, context);
  }

  async apply(browser: BrowserSession, context: WorkflowContext, logger: ExecutionLogger): Promise<void> {
    await logger.info('apply_started', 'Filling iCIMS candidate application fields...');

    await this.processMultiStepWizard(
      browser,
      context,
      logger,
      async (targetContext, step) => {
        const profile = context.userProfile;
        const nameParts = (profile.name || '').split(' ');
        const firstName = nameParts[0] || '';
        const lastName = nameParts.slice(1).join(' ') || '';

        // 1. Name & Email
        const fnInput = await targetContext.$(
          'input[name*="first_name" i], input[name*="firstname" i], input[id*="first_name" i]'
        );
        if (fnInput && firstName) {
          await fnInput.fill(firstName).catch(() => {});
        }

        const lnInput = await targetContext.$(
          'input[name*="last_name" i], input[name*="lastname" i], input[id*="last_name" i]'
        );
        if (lnInput && lastName) {
          await lnInput.fill(lastName).catch(() => {});
        }

        const email = await targetContext.$(
          'input[name*="email" i], input[type="email"]'
        );
        if (email && profile.email) {
          await email.fill(profile.email).catch(() => {});
        }

        const phone = await targetContext.$(
          'input[name*="phone" i], input[type="tel"]'
        );
        if (phone && profile.phone) {
          await phone.fill(profile.phone).catch(() => {});
        }

        // 2. Resume File Upload
        const fileInput = await targetContext.$('input[type="file"]');
        if (fileInput && context.resumeMarkdown) {
          const pdfPath = await browser.writeMarkdownToPdf(context.resumeMarkdown, 'Resume.pdf');
          await fileInput.setInputFiles(pdfPath).catch(() => {});
          await logger.info('file_uploaded', 'Uploaded PDF resume to iCIMS form');
        }

        await logger.info('form_filling_complete', `Completed filling iCIMS wizard step ${step}`);
      },
      ['button:has-text("Continue")', 'input[value*="Continue" i]', 'a:has-text("Next")']
    );
  }

  async validate(browser: BrowserSession, context: WorkflowContext, logger: ExecutionLogger): Promise<{ valid: boolean; issues: string[] }> {
    const issues: string[] = [];
    const targetContext = await browser.findFormFrame(['input[type="email"]', 'form']);

    const emailVal = await targetContext.$eval(
      'input[name*="email" i], input[type="email"]',
      (el: any) => el.value
    ).catch(() => null);

    if (!emailVal) issues.push('Email field is required');

    return { valid: issues.length === 0, issues };
  }

  async finalize(browser: BrowserSession, context: WorkflowContext, logger: ExecutionLogger): Promise<WorkflowResult> {
    const targetContext = await browser.findFormFrame(['button[type="submit"]', 'form']);

    if (context.simulationMode) {
      const screenshotPath = await browser.screenshot('icims-review.png');
      await logger.info('simulation_completed', 'Completed iCIMS simulation', { screenshotPath });
      return {
        status: AutoApplyStatus.SIMULATED,
        canComplete: true,
        platform: ATSPlatform.ICIMS,
        automationConfidence: 85,
        stepsCompleted: 3,
        stepsRemaining: 0,
        blockingIssue: null,
        estimatedSubmissionTime: null,
      };
    }

    const submitBtn = await this.findSubmitButton(targetContext, logger);
    if (!submitBtn) {
      await this.checkClosedJob(browser, logger, context.jobUrl);
      throw new InterventionError(InterventionReason.UNEXPECTED_PAGE, 'Submit button not found on iCIMS form', context.jobUrl);
    }

    await submitBtn.click();
    await browser.page.waitForTimeout(3000);

    const screenshotPath = await browser.screenshot('icims-submitted.png');
    await logger.info('application_submitted', 'Submitted iCIMS application live', { screenshotPath });

    return {
      status: AutoApplyStatus.APPLIED,
      canComplete: true,
      platform: ATSPlatform.ICIMS,
      automationConfidence: 90,
      stepsCompleted: 4,
      stepsRemaining: 0,
      blockingIssue: null,
      estimatedSubmissionTime: null,
    };
  }
}

pluginRegistry.register(new ICIMSPlugin());
