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

  async prepare(browser: BrowserSession, context: WorkflowContext, logger: ExecutionLogger): Promise<void> {
    await logger.info('plugin_loaded', `SmartRecruiters plugin active — navigating to ${context.jobUrl}`);
    await browser.navigate(context.jobUrl, 'domcontentloaded');
    await browser.page.waitForTimeout(2000);

    // If an "I'm interested" or "Apply" button is present on the page, click it to show the form
    const applyBtn = await browser.page.$(
      'button:has-text("I\'m interested"), a:has-text("I\'m interested"), button:has-text("Apply"), a:has-text("Apply for this job")'
    ).catch(() => null);

    if (applyBtn) {
      await applyBtn.click().catch(() => {});
      await browser.page.waitForTimeout(1500);
    }
  }

  async apply(browser: BrowserSession, context: WorkflowContext, logger: ExecutionLogger): Promise<void> {
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
      await fnInput.fill(firstName);
    }

    const lnInput = await targetContext.$(
      '#last-name-input, input[name="lastName"], input[name="last-name"], input[autocomplete="family-name"]'
    );
    if (lnInput && lastName) {
      await lnInput.fill(lastName);
    }

    // 2. Email
    const email = await targetContext.$(
      '#email-input, input[name="email"], input[type="email"]'
    );
    if (email && profile.email) {
      await email.fill(profile.email);
    }

    // 3. Phone
    const phone = await targetContext.$(
      '#phone-number-input, input[name="phoneNumber"], input[type="tel"]'
    );
    if (phone && profile.phone) {
      await phone.fill(profile.phone);
    }

    // 4. Resume File Upload
    const fileInput = await targetContext.$('input[type="file"]');
    if (fileInput && context.resumeMarkdown) {
      const pdfPath = await browser.writeMarkdownToPdf(context.resumeMarkdown, 'Resume.pdf');
      await fileInput.setInputFiles(pdfPath);
      await logger.info('file_uploaded', 'Uploaded PDF resume to SmartRecruiters');
    }

    await logger.info('form_filling_complete', 'Completed filling SmartRecruiters form fields');
  }

  async validate(browser: BrowserSession, context: WorkflowContext, logger: ExecutionLogger): Promise<{ valid: boolean; issues: string[] }> {
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

    const submitBtn = await targetContext.$(
      'button[type="submit"], button:has-text("Submit"), button:has-text("Send")'
    );
    if (!submitBtn) {
      throw new InterventionError(InterventionReason.UNEXPECTED_PAGE, 'Submit button not found on SmartRecruiters form', context.jobUrl);
    }

    await submitBtn.click();
    await browser.page.waitForTimeout(3000);

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
