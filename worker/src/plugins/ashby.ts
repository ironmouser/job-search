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

    // Allow dynamic iframe or SPA form components to load
    await browser.page.waitForTimeout(2000);
  }

  async apply(browser: BrowserSession, context: WorkflowContext, logger: ExecutionLogger): Promise<void> {
    await logger.info('apply_started', 'Locating Ashby application form context...');

    const targetContext: Frame | Page = await browser.findFormFrame([
      'input[name="name"]',
      'input[autocomplete="name"]',
      'input[type="file"]',
      'button[type="submit"]',
      'form',
    ]);

    const profile = context.userProfile;

    const BROAD_NAME_SELECTOR = 'input[name="name"], input[name="_name_"], input[autocomplete="name"], input[placeholder*="Name" i], input[id*="name" i], input[aria-label*="Name" i]';
    const BROAD_EMAIL_SELECTOR = 'input[name="email"], input[type="email"], input[autocomplete="email"], input[placeholder*="Email" i], input[id*="email" i], input[aria-label*="Email" i]';

    // 1. Full Name
    const nameInput = await targetContext.$(BROAD_NAME_SELECTOR);
    if (nameInput && profile.name) {
      await nameInput.fill(profile.name);
      await nameInput.dispatchEvent('input').catch(() => {});
      await nameInput.dispatchEvent('change').catch(() => {});
      await logger.info('field_filled', `Filled name: ${profile.name}`);
    }

    // 2. Email
    const emailInput = await targetContext.$(BROAD_EMAIL_SELECTOR);
    if (emailInput && profile.email) {
      await emailInput.fill(profile.email);
      await emailInput.dispatchEvent('input').catch(() => {});
      await emailInput.dispatchEvent('change').catch(() => {});
      await logger.info('field_filled', `Filled email: ${profile.email}`);
    }

    // 3. Phone Number
    const phoneInput = await targetContext.$(
      'input[name="phone"], input[type="tel"], input[placeholder*="Phone" i]'
    );
    if (phoneInput && profile.phone) {
      await phoneInput.fill(profile.phone);
      await logger.info('field_filled', `Filled phone: ${profile.phone}`);
    }

    // 4. Social / Portfolio Links (LinkedIn, Website)
    const linkedinInput = await targetContext.$(
      'input[name*="linkedin" i], input[placeholder*="LinkedIn" i], input[id*="linkedin" i]'
    );
    if (linkedinInput && profile.linkedinUrl) {
      await linkedinInput.fill(profile.linkedinUrl);
      await logger.info('field_filled', `Filled LinkedIn URL`);
    }

    const websiteInput = await targetContext.$(
      'input[name*="website" i], input[name*="portfolio" i], input[placeholder*="Website" i]'
    );
    if (websiteInput && profile.websiteUrl) {
      await websiteInput.fill(profile.websiteUrl);
      await logger.info('field_filled', `Filled Portfolio/Website URL`);
    }

    // 5. Resume Upload
    const fileInput = await targetContext.$('input[type="file"]');
    if (fileInput && context.resumeMarkdown) {
      const pdfPath = await browser.writeMarkdownToPdf(context.resumeMarkdown, 'Resume.pdf');
      await fileInput.setInputFiles(pdfPath);
      await logger.info('file_uploaded', `Uploaded generated PDF resume: Resume.pdf`);
    }

    // 6. Common Work Authorization & Sponsorship radio/dropdown fields
    try {
      const radios = await targetContext.$$('input[type="radio"]');
      for (const radio of radios) {
        const labelText = await radio.evaluate((el) => el.closest('label')?.textContent || '');
        if (/legally authorized|eligible to work/i.test(labelText) && /yes/i.test(labelText)) {
          await radio.check({ force: true }).catch(() => {});
        } else if (/require sponsorship|sponsorship now or in the future/i.test(labelText) && /no/i.test(labelText)) {
          await radio.check({ force: true }).catch(() => {});
        }
      }
    } catch {}

    await logger.info('form_filling_complete', 'Completed filling Ashby application fields');
  }

  async validate(browser: BrowserSession, context: WorkflowContext, logger: ExecutionLogger): Promise<{ valid: boolean; issues: string[] }> {
    const issues: string[] = [];
    const targetContext = await browser.findFormFrame(['input[name="name"]', 'input[type="email"]', 'form']);
    const profile = context.userProfile;

    const BROAD_NAME_SELECTOR = 'input[name="name"], input[name="_name_"], input[autocomplete="name"], input[placeholder*="Name" i], input[id*="name" i], input[aria-label*="Name" i]';
    const BROAD_EMAIL_SELECTOR = 'input[name="email"], input[type="email"], input[autocomplete="email"], input[placeholder*="Email" i], input[id*="email" i], input[aria-label*="Email" i]';

    // Check for mandatory name/email fields
    let nameVal = await targetContext.$eval(BROAD_NAME_SELECTOR, (el: any) => el.value).catch(() => null);
    if (!nameVal && profile.name) {
      const nameInput = await targetContext.$(BROAD_NAME_SELECTOR);
      if (nameInput) {
        await nameInput.fill(profile.name);
        await nameInput.dispatchEvent('input').catch(() => {});
        await nameInput.dispatchEvent('change').catch(() => {});
        nameVal = profile.name;
      }
    }
    if (!nameVal && !profile.name) {
      issues.push('Name field is empty');
    }

    let emailVal = await targetContext.$eval(BROAD_EMAIL_SELECTOR, (el: any) => el.value).catch(() => null);
    if (!emailVal && profile.email) {
      const emailInput = await targetContext.$(BROAD_EMAIL_SELECTOR);
      if (emailInput) {
        await emailInput.fill(profile.email);
        await emailInput.dispatchEvent('input').catch(() => {});
        await emailInput.dispatchEvent('change').catch(() => {});
        emailVal = profile.email;
      }
    }
    if (!emailVal && !profile.email) {
      issues.push('Email field is empty');
    }

    return { valid: issues.length === 0, issues };
  }

  async finalize(browser: BrowserSession, context: WorkflowContext, logger: ExecutionLogger): Promise<WorkflowResult> {
    const targetContext = await browser.findFormFrame(['button[type="submit"]', 'form']);

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

    // Live submission
    const submitBtn = await targetContext.$('button[type="submit"], input[type="submit"], button:has-text("Submit Application")');
    if (!submitBtn) {
      throw new InterventionError(InterventionReason.UNEXPECTED_PAGE, 'Could not find submit button on Ashby application form', context.jobUrl);
    }

    await submitBtn.click();
    await browser.page.waitForTimeout(3000);

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
