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
    await this.checkClosedJob(browser, logger, context.jobUrl);
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
      await this.typeHumanized(targetContext, nameInput, profile.name);
      await logger.info('field_filled', `Filled name: ${profile.name}`);
    }

    // 2. Email
    try {
      const emailInput = await targetContext.$(BROAD_EMAIL_SELECTOR);
      if (emailInput && profile.email) {
        await this.typeHumanized(targetContext, emailInput, profile.email);
        await logger.info('field_filled', `Filled email: ${profile.email}`);
      } else if (!profile.email) {
        await logger.warn('field_skipped', 'No email in user profile — skipping email field');
      } else {
        await logger.warn('field_skipped', 'Email input not found in form context');
      }
    } catch (err: any) {
      await logger.warn('field_error', `Email field fill failed: ${err.message}`);
    }

    // 3. Phone Number
    const phoneInput = await targetContext.$(
      'input[name="phone"], input[type="tel"], input[placeholder*="Phone" i]'
    );
    if (phoneInput && profile.phone) {
      await this.typeHumanized(targetContext, phoneInput, profile.phone);
      await logger.info('field_filled', `Filled phone: ${profile.phone}`);
    }

    // 4. Social / Portfolio Links (LinkedIn, Website)
    const linkedinInput = await targetContext.$(
      'input[name*="linkedin" i], input[placeholder*="LinkedIn" i], input[id*="linkedin" i]'
    );
    if (linkedinInput && profile.linkedinUrl) {
      await this.typeHumanized(targetContext, linkedinInput, profile.linkedinUrl);
      await logger.info('field_filled', `Filled LinkedIn URL`);
    }

    const websiteInput = await targetContext.$(
      'input[name*="website" i], input[name*="portfolio" i], input[placeholder*="Website" i]'
    );
    if (websiteInput && profile.websiteUrl) {
      await this.typeHumanized(targetContext, websiteInput, profile.websiteUrl);
      await logger.info('field_filled', `Filled Portfolio/Website URL`);
    }

    // 5. Resume Upload
    try {
      const fileInput = await targetContext.$('input[type="file"]');
      if (fileInput && context.resumeMarkdown) {
        const pdfPath = await browser.writeMarkdownToPdf(context.resumeMarkdown, 'Resume.pdf');
        try {
          // Primary: use the frame/page context directly
          await fileInput.setInputFiles(pdfPath);
          await logger.info('file_uploaded', `Uploaded generated PDF resume: Resume.pdf`);
        } catch (frameErr: any) {
          // Fallback: cross-origin iframes block setInputFiles — use the main page locator instead
          await logger.warn('file_upload_retry', `Frame upload failed (${frameErr.message}) — retrying via main page context`);
          const mainPageInput = browser.page.locator('input[type="file"]').first();
          await mainPageInput.setInputFiles(pdfPath);
          await logger.info('file_uploaded', 'Uploaded generated PDF resume via main page context fallback');
        }
      } else if (!context.resumeMarkdown) {
        await logger.warn('file_skipped', 'No resume markdown available — skipping file upload');
      } else {
        await logger.warn('file_skipped', 'No file input found in form — skipping resume upload');
      }
    } catch (err: any) {
      await logger.warn('file_error', `Resume upload failed: ${err.message} — continuing without upload`);
    }

    // 6. Consent & Future Opportunity Checkboxes (e.g. "Do you agree to allow Mural to contact you...")
    try {
      const checkboxes = await targetContext.$$('input[type="checkbox"]');
      for (const cb of checkboxes) {
        const labelText = await cb.evaluate((el) => {
          const parentLabel = el.closest('label') || el.parentElement;
          const surroundingDiv = el.closest('div');
          return `${parentLabel?.textContent || ''} ${surroundingDiv?.textContent || ''}`;
        });
        if (/agree|accept|consent|contact you|future opportunities|privacy policy|terms/i.test(labelText)) {
          await cb.check({ force: true }).catch(() => {});
          await logger.info('checkbox_checked', 'Accepted opportunity contact / privacy consent checkbox');
        }
      }
    } catch {}

    // 7. Work Authorization, Sponsorship, and EEOC Demographics (Veteran, Disability, Gender, Race)
    try {
      const radios = await targetContext.$$('input[type="radio"]');
      for (const radio of radios) {
        const labelText = await radio.evaluate((el) => {
          const parent = el.closest('label') || el.parentElement;
          const section = el.closest('fieldset') || el.closest('[role="group"]') || el.closest('div');
          return `${section?.textContent || ''} :: ${parent?.textContent || ''}`;
        });
        const lower = labelText.toLowerCase();

        // Work Authorization
        if (/legally authorized|eligible to work/i.test(lower) && /yes/i.test(lower)) {
          await radio.check({ force: true }).catch(() => {});
        } else if (/require sponsorship|sponsorship now or in the future/i.test(lower) && /no/i.test(lower)) {
          await radio.check({ force: true }).catch(() => {});
        }
        // Veteran Status
        else if (/veteran/i.test(lower)) {
          if (profile.eeocVeteran && lower.includes(profile.eeocVeteran.toLowerCase())) {
            await radio.check({ force: true }).catch(() => {});
          } else if (/not a protected veteran|not a veteran|decline/i.test(lower)) {
            await radio.check({ force: true }).catch(() => {});
          }
        }
        // Disability Status
        else if (/disability/i.test(lower)) {
          if (profile.eeocDisability && lower.includes(profile.eeocDisability.toLowerCase())) {
            await radio.check({ force: true }).catch(() => {});
          } else if (/no, i (do not|don't) have a disability|do not have a disability|decline|do not wish to answer/i.test(lower)) {
            await radio.check({ force: true }).catch(() => {});
          }
        }
        // Gender
        else if (/gender/i.test(lower)) {
          if (profile.eeocGender && lower.includes(profile.eeocGender.toLowerCase())) {
            await radio.check({ force: true }).catch(() => {});
          } else if (/decline|prefer not/i.test(lower)) {
            await radio.check({ force: true }).catch(() => {});
          }
        }
        // Race / Ethnicity
        else if (/race|ethnicity|hispanic|latino/i.test(lower)) {
          if (profile.eeocRace && lower.includes(profile.eeocRace.toLowerCase())) {
            await radio.check({ force: true }).catch(() => {});
          } else if (/decline|prefer not/i.test(lower)) {
            await radio.check({ force: true }).catch(() => {});
          }
        }
      }
    } catch {}

    // 8. Select dropdowns for EEOC / standard questions
    try {
      const selects = await targetContext.$$('select');
      for (const sel of selects) {
        const labelText = await sel.evaluate((el) => {
          const parent = el.closest('label') || el.closest('div');
          return parent?.textContent || '';
        });
        const lower = labelText.toLowerCase();
        if (/veteran/i.test(lower)) {
          const options = await sel.$$eval('option', (opts) => opts.map((o) => ({ value: o.value, text: o.textContent || '' })));
          const match = options.find((o) => (profile.eeocVeteran && new RegExp(profile.eeocVeteran, 'i').test(o.text)) || /not a protected veteran|decline/i.test(o.text));
          if (match) await sel.selectOption(match.value).catch(() => {});
        } else if (/disability/i.test(lower)) {
          const options = await sel.$$eval('option', (opts) => opts.map((o) => ({ value: o.value, text: o.textContent || '' })));
          const match = options.find((o) => (profile.eeocDisability && new RegExp(profile.eeocDisability, 'i').test(o.text)) || /no|decline|do not wish/i.test(o.text));
          if (match) await sel.selectOption(match.value).catch(() => {});
        } else if (/gender/i.test(lower)) {
          const options = await sel.$$eval('option', (opts) => opts.map((o) => ({ value: o.value, text: o.textContent || '' })));
          const match = options.find((o) => (profile.eeocGender && new RegExp(profile.eeocGender, 'i').test(o.text)) || /decline/i.test(o.text));
          if (match) await sel.selectOption(match.value).catch(() => {});
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
        await this.typeHumanized(targetContext, nameInput, profile.name);
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
        await this.typeHumanized(targetContext, emailInput, profile.email);
        emailVal = profile.email;
      }
    }
    if (!emailVal && !profile.email) {
      issues.push('Email field is empty');
    }

    return { valid: issues.length === 0, issues };
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
      maxWaitMs: 8000,
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
