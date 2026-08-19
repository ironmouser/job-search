/**
 * worker/src/generic-agent/generic-form-filler.ts
 *
 * GenericFormFiller — standard form automation engine for custom employer career portals.
 * Fills candidate information, uploads resume/cover letter PDFs, answers common questions,
 * processes multi-step wizards, and validates form readiness.
 */

import { Frame, Locator, Page } from 'playwright';
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

    // 5. If form is a multi-step wizard, attempt to advance steps
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
   * Answers common questions (work authorization, terms and conditions, sponsorship).
   */
  private async answerStandardQuestions(
    ctx: Page | Frame,
    profile: UserProfile,
    logger: ExecutionLogger
  ): Promise<void> {
    // 1. Terms and conditions checkbox
    const termsCheckboxes = ctx.locator('input[type="checkbox"][name*="term" i], input[type="checkbox"][name*="agree" i], input[type="checkbox"][name*="consent" i], input[type="checkbox"][name*="privacy" i]');
    const count = await termsCheckboxes.count().catch(() => 0);
    for (let i = 0; i < count; i++) {
      try {
        const cb = termsCheckboxes.nth(i);
        if (!(await cb.isChecked().catch(() => false))) {
          await cb.check({ force: true }).catch(() => {});
          await logger.info('terms_accepted', 'Agreed to terms/consent checkbox');
        }
      } catch {}
    }

    // 2. US Work Authorization Radio / Select
    if (profile.usWorkAuthorization) {
      try {
        const authRadios = ctx.locator('input[type="radio"][name*="auth" i], input[type="radio"][name*="legally" i]');
        if ((await authRadios.count().catch(() => 0)) > 0) {
          const yesRadio = ctx.locator('input[type="radio"][value*="yes" i], input[type="radio"][value="1"]').first();
          if ((await yesRadio.count().catch(() => 0)) > 0) {
            await yesRadio.check({ force: true }).catch(() => {});
          }
        }
      } catch {}
    }
  }

  /**
   * Checks if application is multi-step and clicks Next/Continue.
   */
  private async advanceMultiStepWizardIfPresent(
    browser: BrowserSession,
    context: WorkflowContext,
    logger: ExecutionLogger
  ): Promise<void> {
    const page = browser.page;
    const nextBtn = page.locator('button:has-text("Save and Continue"), button:has-text("Save & Continue"), button:has-text("Next Step"), button:has-text("Next")').first();

    if ((await nextBtn.count().catch(() => 0)) > 0 && (await nextBtn.isVisible().catch(() => false))) {
      await logger.info('wizard_step', 'Multi-step wizard next button detected — advancing step');
      await safeClick(page, nextBtn, { actionName: 'wizard_advance' }, logger);
      await page.waitForTimeout(2000);
    }
  }

  /**
   * Helper to find first matching input from selector list and fill it.
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
            await el.fill(value);
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
      await safeClick(page, submitBtn, { actionName: 'final_submit' }, logger);
      await page.waitForTimeout(5000);

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
