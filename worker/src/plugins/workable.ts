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
    await browser.page.waitForTimeout(2000);
    await this.checkClosedJob(browser, logger, applyUrl);
  }

  async apply(browser: BrowserSession, context: WorkflowContext, logger: ExecutionLogger): Promise<void> {
    await logger.info('apply_started', 'Locating Workable form fields...');
    const targetContext: Frame | Page = await browser.findFormFrame([
      'input[name="firstname"]',
      'input[name="first_name"]',
      'input[name="name"]',
      'input[type="file"]',
      'form',
    ]);

    const profile = context.userProfile;
    const nameParts = (profile.name || '').split(' ');
    const firstName = nameParts[0] || '';
    const lastName = nameParts.slice(1).join(' ') || '';

    // 1. First Name & Last Name
    const firstNameInput = await targetContext.$(
      'input[name="firstname"], input[name="first_name"], input[id*="firstname" i], input[autocomplete="given-name"]'
    );
    if (firstNameInput && firstName) {
      await firstNameInput.fill(firstName);
      await logger.info('field_filled', `Filled first name: ${firstName}`);
    }

    const lastNameInput = await targetContext.$(
      'input[name="lastname"], input[name="last_name"], input[id*="lastname" i], input[autocomplete="family-name"]'
    );
    if (lastNameInput && lastName) {
      await lastNameInput.fill(lastName);
      await logger.info('field_filled', `Filled last name: ${lastName}`);
    }

    // Fallback single Full Name field
    if (!firstNameInput && !lastNameInput) {
      const nameInput = await targetContext.$('input[name="name"], input[id*="name" i]');
      if (nameInput && profile.name) {
        await nameInput.fill(profile.name);
      }
    }

    // 2. Email
    const emailInput = await targetContext.$(
      'input[name="email"], input[type="email"], input[id*="email" i]'
    );
    if (emailInput && profile.email) {
      await emailInput.fill(profile.email);
      await logger.info('field_filled', `Filled email: ${profile.email}`);
    }

    // 3. Phone
    const phoneInput = await targetContext.$(
      'input[name="phone"], input[type="tel"], input[id*="phone" i]'
    );
    if (phoneInput && profile.phone) {
      await phoneInput.fill(profile.phone);
      await logger.info('field_filled', `Filled phone: ${profile.phone}`);
    }

    // 4. Social Links
    const linkedinInput = await targetContext.$(
      'input[name*="linkedin" i], input[id*="linkedin" i]'
    );
    if (linkedinInput && profile.linkedinUrl) {
      await linkedinInput.fill(profile.linkedinUrl);
    }

    // 5. Resume File Upload
    const fileInput = await targetContext.$('input[type="file"]');
    if (fileInput && context.resumeMarkdown) {
      const pdfPath = await browser.writeMarkdownToPdf(context.resumeMarkdown, 'Resume.pdf');
      await fileInput.setInputFiles(pdfPath);
      await logger.info('file_uploaded', 'Uploaded PDF resume to Workable form');
    }

    await logger.info('form_filling_complete', 'Workable form fields filled');
  }

  async validate(browser: BrowserSession, context: WorkflowContext, logger: ExecutionLogger): Promise<{ valid: boolean; issues: string[] }> {
    const issues: string[] = [];
    const targetContext = await browser.findFormFrame(['input[name="email"]', 'form']);

    const emailVal = await targetContext.$eval('input[name="email"], input[type="email"]', (el: any) => el.value).catch(() => null);
    if (!emailVal) issues.push('Email field is required');

    return { valid: issues.length === 0, issues };
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

    await submitBtn.click();
    await browser.page.waitForTimeout(3000);

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
