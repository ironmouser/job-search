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
 * TaleoPlugin — automation plugin for Oracle Taleo ATS.
 */
export class TaleoPlugin extends ATSPlugin {
  readonly platform = ATSPlatform.TALEO;
  readonly displayName = 'Taleo';

  detect(url: string, html: string, redirectChain: string[]): ATSDetectionResult {
    let confidence = 0;
    const detectedFeatures: string[] = [];
    const allUrls = [url, ...redirectChain];

    for (const u of allUrls) {
      try {
        const hostname = new URL(u).hostname.toLowerCase();
        if (hostname.endsWith('.taleo.net') || hostname.endsWith('.taleo.com')) {
          confidence += 85;
          detectedFeatures.push('hostname:taleo.net');
          break;
        }
      } catch {}
    }

    if (html.includes('class="taleo"') || html.includes('data-taleo') || html.includes('taleo.min.js')) {
      confidence += 15;
      detectedFeatures.push('html:taleo');
    }

    return {
      platform: ATSPlatform.TALEO,
      confidence: Math.min(confidence, 100),
      detectedFeatures,
      automationSupported: true,
    };
  }

  async prepare(browser: BrowserSession, context: WorkflowContext, logger: ExecutionLogger): Promise<void> {
    await logger.info('plugin_loaded', `Taleo plugin active — navigating to ${context.jobUrl}`);
    await browser.navigate(context.jobUrl, 'domcontentloaded');
    await browser.page.waitForTimeout(2500);

    // Look for "Apply Online" or "Apply" button on Taleo job description page
    const applyBtn = await browser.page.$(
      'a:has-text("Apply Online"), button:has-text("Apply Online"), a:has-text("Apply"), button:has-text("Apply")'
    ).catch(() => null);

    if (applyBtn) {
      await applyBtn.click().catch(() => {});
      await browser.page.waitForTimeout(2000);
    }

    await this.checkAccountGate(browser.page, context.jobUrl, this.displayName, context);
  }

  async apply(browser: BrowserSession, context: WorkflowContext, logger: ExecutionLogger): Promise<void> {
    await logger.info('apply_started', 'Navigating Taleo application steps...');

    const targetContext: Frame | Page = await browser.findFormFrame([
      'input[name*="firstName" i]',
      'input[name*="email" i]',
      'input[type="file"]',
      'form',
    ]);

    const profile = context.userProfile;
    const nameParts = (profile.name || '').split(' ');
    const firstName = nameParts[0] || '';
    const lastName = nameParts.slice(1).join(' ') || '';

    // 1. Personal Information Fields
    const fnInput = await targetContext.$(
      'input[name*="firstName" i], input[id*="firstName" i], input[name*="fname" i]'
    );
    if (fnInput && firstName) {
      await fnInput.fill(firstName);
    }

    const lnInput = await targetContext.$(
      'input[name*="lastName" i], input[id*="lastName" i], input[name*="lname" i]'
    );
    if (lnInput && lastName) {
      await lnInput.fill(lastName);
    }

    const email = await targetContext.$(
      'input[name*="email" i], input[id*="email" i], input[type="email"]'
    );
    if (email && profile.email) {
      await email.fill(profile.email);
    }

    const phone = await targetContext.$(
      'input[name*="phone" i], input[id*="phone" i], input[type="tel"]'
    );
    if (phone && profile.phone) {
      await phone.fill(profile.phone);
    }

    // 2. Resume Attachment
    const fileInput = await targetContext.$('input[type="file"]');
    if (fileInput && context.resumeMarkdown) {
      const pdfPath = await browser.writeMarkdownToPdf(context.resumeMarkdown, 'Resume.pdf');
      await fileInput.setInputFiles(pdfPath);
      await logger.info('file_uploaded', 'Uploaded PDF resume to Oracle Taleo');
    }

    await logger.info('form_filling_complete', 'Completed filling Taleo wizard step');
  }

  async validate(browser: BrowserSession, context: WorkflowContext, logger: ExecutionLogger): Promise<{ valid: boolean; issues: string[] }> {
    const issues: string[] = [];
    const targetContext = await browser.findFormFrame(['input[name*="email" i]', 'form']);

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
      const screenshotPath = await browser.screenshot('taleo-review.png');
      await logger.info('simulation_completed', 'Completed Taleo simulation', { screenshotPath });
      return {
        status: AutoApplyStatus.SIMULATED,
        canComplete: true,
        platform: ATSPlatform.TALEO,
        automationConfidence: 85,
        stepsCompleted: 3,
        stepsRemaining: 0,
        blockingIssue: null,
        estimatedSubmissionTime: null,
      };
    }

    const submitBtn = await this.findSubmitButton(targetContext, logger);
    if (!submitBtn) {
      throw new InterventionError(InterventionReason.UNEXPECTED_PAGE, 'Submit button not found on Taleo form', context.jobUrl);
    }

    await submitBtn.click();
    await browser.page.waitForTimeout(3000);

    const screenshotPath = await browser.screenshot('taleo-submitted.png');
    await logger.info('application_submitted', 'Submitted Taleo application live', { screenshotPath });

    return {
      status: AutoApplyStatus.APPLIED,
      canComplete: true,
      platform: ATSPlatform.TALEO,
      automationConfidence: 90,
      stepsCompleted: 4,
      stepsRemaining: 0,
      blockingIssue: null,
      estimatedSubmissionTime: null,
    };
  }
}

pluginRegistry.register(new TaleoPlugin());
