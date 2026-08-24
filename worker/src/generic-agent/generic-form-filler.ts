/**
 * worker/src/generic-agent/generic-form-filler.ts
 *
 * GenericFormFiller — standard form automation engine for custom employer career portals.
 * Fills candidate information, uploads resume/cover letter PDFs, answers common questions,
 * processes multi-step wizards, and validates form readiness.
 */

import { Frame, Page } from 'playwright';
import { BrowserSession } from '../browser-session';
import { ExecutionLogger } from '../execution-logger';
import {
  ATSPlatform,
  AutoApplyStatus,
  InterventionReason,
  UserProfile,
  WorkflowContext,
  WorkflowResult,
} from '../types';
import { InterventionError } from '../plugins/base-plugin';
import { safeClick } from '../obstruction/safe-interact';
import { UIObstructionResolver } from '../obstruction/resolver';
import { UniversalQuestionResolver } from '../plugins/question-resolver';

export class GenericFormFiller {
  /**
   * Fills personal details, custom questions, and file uploads across active form frames.
   */
  async fillForm(
    browser: BrowserSession,
    context: WorkflowContext,
    logger: ExecutionLogger
  ): Promise<void> {
    const page = browser.page;
    await logger.info('form_filling', 'Beginning generic application form automation');

    // Dismiss any active cookie or privacy banner before finding form controls
    await UIObstructionResolver.dismissCookieBannerIfPresent(page, logger);

    const formCtx = await browser.findFormFrame([
      'input[type="file"]',
      'input[name*="email" i]',
      'input[name*="first" i]',
      'input[name*="name" i]',
      'form',
    ]);

    // 1. Fill personal details
    await this.fillPersonalDetails(formCtx, context.userProfile, logger);

    // 2. Upload resume
    await this.uploadResume(browser, formCtx, context, logger);

    // 3. Upload cover letter if optional field exists
    if (context.coverLetterMarkdown) {
      await this.uploadCoverLetter(browser, formCtx, context, logger);
    }

    // 4. Answer standard questions (EEO, work auth, terms)
    await this.answerStandardQuestions(formCtx, context.userProfile, logger);

    // 5. Answer custom & screening questions using AI
    await UniversalQuestionResolver.resolveAndFillQuestions(
      formCtx,
      browser,
      context,
      logger,
      logger.getApiClient()
    );

    // 6. If form is a multi-step wizard, attempt to advance steps
    await this.advanceMultiStepWizardIfPresent(browser, context, logger);
  }

  /**
   * Fills standard contact & personal info fields using smart selector tiers.
   */
  private async fillPersonalDetails(
    ctx: Page | Frame,
    profile: UserProfile,
    logger: ExecutionLogger
  ): Promise<void> {
    const nameParts = (profile.name || '').trim().split(/\s+/);
    const firstName = nameParts[0] || '';
    const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : '';

    // First Name
    if (firstName) {
      const filled = await this.tryFillInput(ctx, [
        'input[name="first_name" i]',
        'input[name="firstName" i]',
        'input[name*="first" i]',
        'input[id*="first" i]',
        'input[placeholder*="First Name" i]',
        'input[aria-label*="First Name" i]',
      ], firstName);
      if (filled) await logger.info('field_filled', `First name populated: ${firstName}`);
    }

    // Last Name
    if (lastName) {
      const filled = await this.tryFillInput(ctx, [
        'input[name="last_name" i]',
        'input[name="lastName" i]',
        'input[name*="last" i]',
        'input[id*="last" i]',
        'input[placeholder*="Last Name" i]',
        'input[aria-label*="Last Name" i]',
      ], lastName);
      if (filled) await logger.info('field_filled', `Last name populated: ${lastName}`);
    }

    // Full Name (if single full name input exists and first/last was not separate)
    if (profile.name) {
      await this.tryFillInput(ctx, [
        'input[name="full_name" i]',
        'input[name="fullName" i]',
        'input[name="name" i]',
        'input[id="name" i]',
        'input[placeholder*="Full Name" i]',
        'input[aria-label*="Full Name" i]',
      ], profile.name);
    }

    // Email
    if (profile.email) {
      const filled = await this.tryFillInput(ctx, [
        'input[type="email"]',
        'input[name="email" i]',
        'input[name*="email" i]',
        'input[id*="email" i]',
        'input[placeholder*="Email" i]',
        'input[aria-label*="Email" i]',
      ], profile.email);
      if (filled) await logger.info('field_filled', `Email populated: ${profile.email}`);
    }

    // Phone
    if (profile.phone) {
      const filled = await this.tryFillInput(ctx, [
        'input[type="tel"]',
        'input[name="phone" i]',
        'input[name*="phone" i]',
        'input[name*="mobile" i]',
        'input[id*="phone" i]',
        'input[placeholder*="Phone" i]',
        'input[aria-label*="Phone" i]',
      ], profile.phone);
      if (filled) await logger.info('field_filled', `Phone populated: ${profile.phone}`);
    }

    // Street Address
    if (profile.streetAddress) {
      await this.tryFillInput(ctx, [
        'input[name*="address" i]',
        'input[name*="street" i]',
        'input[id*="address" i]',
        'input[placeholder*="Address" i]',
      ], profile.streetAddress);
    }

    // City
    if (profile.city) {
      await this.tryFillInput(ctx, [
        'input[name="city" i]',
        'input[name*="city" i]',
        'input[id*="city" i]',
        'input[placeholder*="City" i]',
      ], profile.city);
    }

    // Postal / Zip Code
    if (profile.postalCode) {
      await this.tryFillInput(ctx, [
        'input[name*="postal" i]',
        'input[name*="zip" i]',
        'input[id*="postal" i]',
        'input[id*="zip" i]',
        'input[placeholder*="Zip" i]',
        'input[placeholder*="Postal" i]',
      ], profile.postalCode);
    }

    // State / Province
    if (profile.state) {
      await this.tryFillInput(ctx, [
        'input[name*="state" i]',
        'input[name*="province" i]',
        'input[id*="state" i]',
        'input[placeholder*="State" i]',
      ], profile.state);
    }

    // LinkedIn URL
    if (profile.linkedinUrl) {
      await this.tryFillInput(ctx, [
        'input[name*="linkedin" i]',
        'input[id*="linkedin" i]',
        'input[placeholder*="LinkedIn" i]',
        'input[aria-label*="LinkedIn" i]',
      ], profile.linkedinUrl);
    }

    // Portfolio / Website URL
    if (profile.websiteUrl) {
      await this.tryFillInput(ctx, [
        'input[name*="website" i]',
        'input[name*="portfolio" i]',
        'input[id*="website" i]',
        'input[placeholder*="Website" i]',
        'input[placeholder*="Portfolio" i]',
      ], profile.websiteUrl);
    }
  }

  /**
   * Uploads resume PDF converted from markdown.
   */
  private async uploadResume(
    browser: BrowserSession,
    ctx: Page | Frame,
    context: WorkflowContext,
    logger: ExecutionLogger
  ): Promise<void> {
    if (!context.resumeMarkdown) return;

    try {
      const resumePath = await browser.writeMarkdownToPdf(
        context.resumeMarkdown,
        `resume_${context.sessionId}.pdf`
      );

      const fileInputs = ctx.locator('input[type="file"]');
      const count = await fileInputs.count().catch(() => 0);

      if (count > 0) {
        // Try specific resume input first
        const resumeInput = ctx.locator(
          'input[type="file"][name*="resume" i], input[type="file"][id*="resume" i], input[type="file"][accept*="pdf" i]'
        ).first();

        if ((await resumeInput.count().catch(() => 0)) > 0) {
          await resumeInput.setInputFiles(resumePath);
          await logger.info('resume_uploaded', 'Resume PDF uploaded via targeted selector');
          return;
        }

        // Otherwise use first available file input
        await fileInputs.first().setInputFiles(resumePath);
        await logger.info('resume_uploaded', 'Resume PDF uploaded to first file input');
      } else {
        await logger.warn('resume_upload_skipped', 'No file upload inputs detected on application form');
      }
    } catch (err: any) {
      await logger.warn('resume_upload_failed', `Could not upload resume: ${err.message}`);
    }
  }

  /**
   * Uploads cover letter PDF if cover letter input exists.
   */
  private async uploadCoverLetter(
    browser: BrowserSession,
    ctx: Page | Frame,
    context: WorkflowContext,
    logger: ExecutionLogger
  ): Promise<void> {
    try {
      const clInput = ctx.locator(
        'input[type="file"][name*="cover" i], input[type="file"][id*="cover" i], input[type="file"][aria-label*="cover" i]'
      ).first();

      if ((await clInput.count().catch(() => 0)) > 0) {
        const clPath = await browser.writeMarkdownToPdf(
          context.coverLetterMarkdown,
          `cover_letter_${context.sessionId}.pdf`
        );
        await clInput.setInputFiles(clPath);
        await logger.info('cover_letter_uploaded', 'Cover letter PDF uploaded');
      }
    } catch (err: any) {
      await logger.warn('cover_letter_upload_failed', `Could not upload cover letter: ${err.message}`);
    }
  }

  /**
   * Answers common questions (work authorization, terms and conditions, sponsorship, consent, EEOC demographics).
   */
  private async answerStandardQuestions(
    ctx: Page | Frame,
    profile: UserProfile,
    logger: ExecutionLogger
  ): Promise<void> {
    // 1. Terms, Privacy, and Future Opportunity Consent Checkboxes
    try {
      const checkboxes = await ctx.$$('input[type="checkbox"]');
      for (const cb of checkboxes) {
        const isVisible = await cb.isVisible().catch(() => false);
        if (!isVisible) continue;

        const isChecked = await cb.isChecked().catch(() => false);
        if (isChecked) continue;

        const labelText = await cb.evaluate((el) => {
          const parentLabel = el.closest('label') || el.parentElement;
          const surroundingDiv = el.closest('div');
          const fieldset = el.closest('fieldset');
          return `${parentLabel?.textContent || ''} ${surroundingDiv?.textContent || ''} ${fieldset?.textContent || ''}`;
        }).catch(() => '');

        const lower = labelText.toLowerCase();
        if (
          lower.includes('agree') ||
          lower.includes('accept') ||
          lower.includes('consent') ||
          lower.includes('contact you') ||
          lower.includes('contact me') ||
          lower.includes('future opportunit') ||
          lower.includes('talent pool') ||
          lower.includes('talent community') ||
          lower.includes('privacy policy') ||
          lower.includes('terms') ||
          lower.includes('data processing') ||
          lower.includes('acknowledge')
        ) {
          await cb.check({ force: true }).catch(() => {});
          await logger.info('terms_accepted', 'Agreed to terms/consent/future opportunity checkbox');
        }
      }
    } catch {}

    // 2. US Work Authorization & Sponsorship & EEOC Radios
    try {
      const radios = await ctx.$$('input[type="radio"]');
      for (const radio of radios) {
        const isVisible = await radio.isVisible().catch(() => false);
        if (!isVisible) continue;

        const labelText = await radio.evaluate((el) => {
          const parent = el.closest('label') || el.parentElement;
          const section = el.closest('fieldset') || el.closest('[role="group"]') || el.closest('div');
          return `${section?.textContent || ''} :: ${parent?.textContent || ''}`;
        }).catch(() => '');
        const lower = labelText.toLowerCase();

        // Work Auth / Sponsorship
        if (/legally authorized|eligible to work/i.test(lower) && /yes/i.test(lower)) {
          await radio.check({ force: true }).catch(() => {});
        } else if (/require sponsorship|sponsorship now or in the future/i.test(lower) && /no/i.test(lower)) {
          await radio.check({ force: true }).catch(() => {});
        }
        // Veteran Status
        else if (/veteran/i.test(lower)) {
          if (profile.eeocVeteran && lower.includes(profile.eeocVeteran.toLowerCase())) {
            await radio.check({ force: true }).catch(() => {});
          } else if (/not a protected veteran|not a veteran|decline|prefer not/i.test(lower)) {
            await radio.check({ force: true }).catch(() => {});
          }
        }
        // Disability Status
        else if (/disability/i.test(lower)) {
          if (profile.eeocDisability && lower.includes(profile.eeocDisability.toLowerCase())) {
            await radio.check({ force: true }).catch(() => {});
          } else if (/no, i (do not|don't) have a disability|do not have a disability|decline|do not wish to answer|prefer not/i.test(lower)) {
            await radio.check({ force: true }).catch(() => {});
          }
        }
        // Gender
        else if (/gender|sex\b/i.test(lower)) {
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

    // 3. EEOC & Standard Select Dropdowns
    try {
      const selects = await ctx.$$('select');
      for (const sel of selects) {
        const isVisible = await sel.isVisible().catch(() => false);
        if (!isVisible) continue;

        const labelText = await sel.evaluate((el) => {
          const parent = el.closest('label') || el.closest('div');
          return parent?.textContent || '';
        }).catch(() => '');
        const lower = labelText.toLowerCase();

        if (/veteran/i.test(lower)) {
          const options = await sel.$$eval('option', (opts) => opts.map((o) => ({ value: o.value, text: o.textContent || '' })));
          const match = options.find((o) => (profile.eeocVeteran && new RegExp(profile.eeocVeteran, 'i').test(o.text)) || /not a protected veteran|decline/i.test(o.text));
          if (match) await sel.selectOption(match.value).catch(() => {});
        } else if (/disability/i.test(lower)) {
          const options = await sel.$$eval('option', (opts) => opts.map((o) => ({ value: o.value, text: o.textContent || '' })));
          const match = options.find((o) => (profile.eeocDisability && new RegExp(profile.eeocDisability, 'i').test(o.text)) || /no|decline|do not wish/i.test(o.text));
          if (match) await sel.selectOption(match.value).catch(() => {});
        } else if (/gender|sex\b/i.test(lower)) {
          const options = await sel.$$eval('option', (opts) => opts.map((o) => ({ value: o.value, text: o.textContent || '' })));
          const match = options.find((o) => (profile.eeocGender && new RegExp(profile.eeocGender, 'i').test(o.text)) || /decline|prefer not/i.test(o.text));
          if (match) await sel.selectOption(match.value).catch(() => {});
        } else if (/race|ethnicity|hispanic/i.test(lower)) {
          const options = await sel.$$eval('option', (opts) => opts.map((o) => ({ value: o.value, text: o.textContent || '' })));
          const match = options.find((o) => (profile.eeocRace && new RegExp(profile.eeocRace, 'i').test(o.text)) || /decline|prefer not/i.test(o.text));
          if (match) await sel.selectOption(match.value).catch(() => {});
        }
      }
    } catch {}
  }

  /**
   * Checks if application is multi-step and clicks Next/Continue.
   */
  /**
   * Checks if application is multi-step and iteratively advances steps up to 6 times.
   */
  private async advanceMultiStepWizardIfPresent(
    browser: BrowserSession,
    context: WorkflowContext,
    logger: ExecutionLogger
  ): Promise<void> {
    const page = browser.page;
    let stepCount = 1;
    const maxSteps = 6;

    while (stepCount <= maxSteps) {
      // Check if a final submit button is already visible and enabled
      const submitBtn = page.locator('button[type="submit"], input[type="submit"], button:has-text("Submit Application"), button:has-text("Submit"), button:has-text("Finish")').first();
      const hasFinalSubmit = (await submitBtn.count().catch(() => 0)) > 0 && (await submitBtn.isVisible().catch(() => false));

      const nextBtn = page.locator('button, a[role="button"], input[type="button"]').filter({
        hasText: /save and continue|save & continue|next step|next|continue to next|proceed to next/i,
      }).first();

      const hasNext = (await nextBtn.count().catch(() => 0)) > 0 && (await nextBtn.isVisible().catch(() => false));

      if (hasFinalSubmit && !hasNext) {
        await logger.info('wizard_reached_final', `Reached final submission step of application wizard`);
        break;
      }

      if (!hasNext) {
        break;
      }

      await logger.info('wizard_step_advancing', `Advancing multi-step wizard (Step ${stepCount} -> ${stepCount + 1})`);
      await safeClick(page, nextBtn, { actionName: `wizard_advance_step_${stepCount}` }, logger);
      await page.waitForTimeout(2500);

      // Re-scan and fill any new screening questions on subsequent step
      const formCtx = await browser.findFormFrame(['input', 'select', 'textarea', 'form']);
      await this.fillPersonalDetails(formCtx, context.userProfile, logger);
      await this.answerStandardQuestions(formCtx, context.userProfile, logger);
      await UniversalQuestionResolver.resolveAndFillQuestions(
        formCtx,
        browser,
        context,
        logger,
        logger.getApiClient()
      );

      stepCount++;
    }
  }

  /**
   * Helper to find first matching input from selector list and fill it with humanized typing.
   */
  private async tryFillInput(
    ctx: Page | Frame,
    selectors: string[],
    value: string
  ): Promise<boolean> {
    for (const sel of selectors) {
      try {
        const el = ctx.locator(sel).first();
        if ((await el.count().catch(() => 0)) > 0 && (await el.isVisible().catch(() => false))) {
          const currentVal = await el.inputValue().catch(() => '');
          if (!currentVal) {
            await el.focus().catch(() => {});
            for (const char of value) {
              const delay = Math.floor(Math.random() * 25) + 15;
              await el.pressSequentially(char, { delay }).catch(() => {});
            }
            await el.dispatchEvent('input').catch(() => {});
            await el.dispatchEvent('change').catch(() => {});
            await new Promise((r) => setTimeout(r, Math.floor(Math.random() * 150) + 150));
            return true;
          }
        }
      } catch {}
    }
    return false;
  }

  /**
   * Validates whether form has errors before submission.
   */
  async validateForm(
    browser: BrowserSession,
    context: WorkflowContext,
    logger: ExecutionLogger
  ): Promise<{ valid: boolean; issues: string[] }> {
    const page = browser.page;
    const issues: string[] = [];

    const errorSelectors = [
      '[aria-invalid="true"]',
      '.error-message',
      '.invalid-feedback',
      '.field-error',
      '.has-error',
      'span.error',
      'p.error',
    ];

    for (const sel of errorSelectors) {
      try {
        const els = await page.locator(sel).all();
        for (const el of els) {
          if (await el.isVisible().catch(() => false)) {
            const text = (await el.textContent().catch(() => ''))?.trim();
            if (text && text.length > 3 && !issues.includes(text)) {
              issues.push(text);
            }
          }
        }
      } catch {}
    }

    return {
      valid: issues.length === 0,
      issues,
    };
  }

  /**
   * Finalizes application submission or stops at simulation preview.
   */
  async finalize(
    browser: BrowserSession,
    context: WorkflowContext,
    logger: ExecutionLogger
  ): Promise<WorkflowResult> {
    const page = browser.page;

    if (context.simulationMode) {
      await logger.info('simulation_mode', 'Simulation mode active — stopping prior to final submission on custom portal');
      return {
        status: AutoApplyStatus.SIMULATED,
        canComplete: true,
        platform: ATSPlatform.UNKNOWN,
        automationConfidence: 85,
        stepsCompleted: 5,
        stepsRemaining: 1,
        blockingIssue: null,
        estimatedSubmissionTime: '15 seconds',
      };
    }

    // Live submission
    const submitBtn = page.locator(
      'button[type="submit"], input[type="submit"], button:has-text("Submit Application"), button:has-text("Submit")'
    ).first();

    if ((await submitBtn.count().catch(() => 0)) > 0 && (await submitBtn.isVisible().catch(() => false))) {
      await logger.info('application_submission', 'Clicking final application submit button');
      await page.waitForTimeout(1500);
      await submitBtn.hover().catch(() => {});
      await page.waitForTimeout(300);

      await safeClick(page, submitBtn, { actionName: 'final_submit' }, logger);

      // Verify post-submission state across custom portal
      const startTime = Date.now();
      const maxWait = 8000;
      let confirmed = false;

      while (Date.now() - startTime < maxWait) {
        await page.waitForTimeout(1000);
        const currentUrl = (page.url() || '').toLowerCase();
        const bodyText = ((await page.textContent('body').catch(() => '')) || '').toLowerCase();

        // 1. Spam filter check
        if (bodyText.includes('flagged as possible spam') || bodyText.includes('couldn\'t submit your application')) {
          throw new InterventionError(
            InterventionReason.APPLICATION_BLOCKED_BY_BOT_CHALLENGE,
            'Application submission was flagged by anti-bot/spam filter on portal.',
            page.url()
          );
        }

        // 2. Security challenge check
        if (bodyText.includes('verify you are human') || bodyText.includes('cloudflare challenge')) {
          throw new InterventionError(
            InterventionReason.APPLICATION_BLOCKED_BY_BOT_CHALLENGE,
            'Security verification challenge detected on portal after submission.',
            page.url()
          );
        }

        // 3. Positive confirmation check
        const urlMatch = currentUrl.includes('/thanks') || currentUrl.includes('/confirmation') || currentUrl.includes('/submitted');
        const textMatch =
          bodyText.includes('thank you for applying') ||
          bodyText.includes('application submitted') ||
          bodyText.includes('application received') ||
          bodyText.includes('successfully submitted') ||
          bodyText.includes('we have received your application');

        if (urlMatch || textMatch) {
          confirmed = true;
          break;
        }

        // 4. Form error check
        const errorEl = page.locator('[role="alert"], .error-message, [aria-invalid="true"]').first();
        if (await errorEl.isVisible().catch(() => false)) {
          const errText = (await errorEl.textContent().catch(() => ''))?.trim();
          if (errText && !/cookie|privacy/i.test(errText)) {
            throw new InterventionError(
              InterventionReason.UNEXPECTED_PAGE,
              `Portal reported submission error: "${errText.slice(0, 150)}"`,
              page.url()
            );
          }
        }
      }

      if (!confirmed) {
        throw new InterventionError(
          InterventionReason.UNEXPECTED_PAGE,
          'No confirmation received after submitting on employer portal. Please verify submission.',
          page.url()
        );
      }

      return {
        status: AutoApplyStatus.APPLIED,
        canComplete: true,
        platform: ATSPlatform.UNKNOWN,
        automationConfidence: 90,
        stepsCompleted: 6,
        stepsRemaining: 0,
        blockingIssue: null,
        estimatedSubmissionTime: null,
      };
    }

    throw new InterventionError(
      InterventionReason.UNEXPECTED_PAGE,
      'Could not locate final application submit button on employer portal.',
      page.url()
    );
  }
}
