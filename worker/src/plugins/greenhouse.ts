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

/**
 * GreenhousePlugin — automation plugin for Greenhouse ATS.
 *
 * Detection signals:
 *  - Hostname: boards.greenhouse.io, *.greenhouse.io
 *  - HTML: #grnhse_app, div.opening
 *  - JS: greenhouse.js
 *  - Meta: <meta name="generator" content="Greenhouse">
 *
 * Application flow:
 *  1. prepare()  — Navigate to the job posting; wait for the form to render
 *  2. apply()    — Fill personal info, upload resume + cover letter, answer custom questions
 *  3. validate() — Confirm no inline validation errors
 *  4. finalize() — Submit (live) or stop at review (simulation)
 *
 * Greenhouse form URL pattern:
 *   https://boards.greenhouse.io/{company}/jobs/{jobId}
 *   The page embeds the application form directly (no separate /apply route).
 */
export class GreenhousePlugin extends ATSPlugin {
  readonly platform = ATSPlatform.GREENHOUSE;
  readonly displayName = 'Greenhouse';

  // ─── Detection ────────────────────────────────────────────────────────────

  detect(url: string, html: string, redirectChain: string[]): ATSDetectionResult {
    let confidence = 0;
    const detectedFeatures: string[] = [];
    const allUrls = [url, ...redirectChain];

    for (const u of allUrls) {
      try {
        const hostname = new URL(u).hostname;
        if (hostname === 'boards.greenhouse.io' || hostname.endsWith('.greenhouse.io')) {
          confidence += 80;
          detectedFeatures.push('hostname:greenhouse.io');
          break;
        }
      } catch {}
    }

    if (html.includes('id="grnhse_app"') || html.includes("id='grnhse_app'")) {
      confidence += 15;
      detectedFeatures.push('html:#grnhse_app');
    }
    if (html.includes('div.opening') || html.includes('class="opening"')) {
      confidence += 5;
      detectedFeatures.push('html:.opening');
    }
    if (html.toLowerCase().includes('greenhouse')) {
      confidence += 5;
      detectedFeatures.push('html:greenhouse-reference');
    }
    if (html.includes('greenhouse.js')) {
      confidence += 10;
      detectedFeatures.push('js:greenhouse.js');
    }
    if (html.includes('generator" content="Greenhouse"')) {
      confidence += 10;
      detectedFeatures.push('meta:generator-greenhouse');
    }

    return {
      platform: ATSPlatform.GREENHOUSE,
      confidence: Math.min(confidence, 100),
      detectedFeatures,
      automationSupported: true,
    };
  }

  // ─── Prepare ──────────────────────────────────────────────────────────────

  async prepare(browser: BrowserSession, context: WorkflowContext, logger: ExecutionLogger): Promise<void> {
    const page = browser.page;
    await logger.info('plugin_loaded', `Greenhouse plugin active — navigating to ${context.jobUrl}`);

    // Greenhouse embeds the apply form directly on the job posting page.
    // The page may lazy-load the form inside an iframe or via JS, so we wait
    // for either the direct form container or the Greenhouse iframe.
    await browser.navigate(context.jobUrl);

    // Check for login wall (some internal Greenhouse boards require auth)
    const currentUrl = page.url();
    if (currentUrl.includes('/users/sign_in') || currentUrl.includes('/login')) {
      throw new InterventionError(
        InterventionReason.LOGIN_REQUIRED,
        'This Greenhouse board requires you to sign in. Please log in in the browser window.',
        currentUrl
      );
    }

    // Wait for the Greenhouse app container or the application form fields
    const formSelectors = [
      '#application_form',
      '#main_fields',
      'form#application',
      '#grnhse_app form',
      '.application--form',
    ];

    let formFound = false;
    for (const selector of formSelectors) {
      try {
        await page.waitForSelector(selector, { timeout: 15_000 });
        formFound = true;
        await logger.info('form_located', `Greenhouse application form found via: ${selector}`);
        break;
      } catch {
        // try next selector
      }
    }

    if (!formFound) {
      // Some companies embed Greenhouse in an iframe — check for that
      const frames = page.frames();
      for (const frame of frames) {
        if (frame.url().includes('greenhouse.io')) {
          await logger.info('form_located', 'Greenhouse form detected inside iframe');
          formFound = true;
          break;
        }
      }
    }

    if (!formFound) {
      throw new InterventionError(
        InterventionReason.UNEXPECTED_PAGE,
        'Could not locate the Greenhouse application form on this page. The form may require manual navigation.',
        page.url()
      );
    }
  }

  // ─── Apply ────────────────────────────────────────────────────────────────

  async apply(browser: BrowserSession, context: WorkflowContext, logger: ExecutionLogger): Promise<void> {
    const page = browser.page;
    const profile = context.userProfile;

    // ── Personal information fields ──────────────────────────────────────────
    await this.fillInput(page, '#first_name', profile.name.split(' ')[0] ?? '', logger, 'first_name');
    await this.fillInput(page, '#last_name', profile.name.split(' ').slice(1).join(' ') ?? '', logger, 'last_name');
    await this.fillInput(page, '#email', profile.email, logger, 'email');

    if (profile.phone) {
      await this.fillInput(page, '#phone', profile.phone, logger, 'phone');
    }

    if (profile.location) {
      await this.fillInput(page, '#job_application_location', profile.location, logger, 'location');
    }

    if (profile.linkedinUrl) {
      // Greenhouse uses several possible selectors for LinkedIn
      const linkedinSelectors = [
        '#linkedin_profile',
        'input[name="job_application[urls][LinkedIn]"]',
        'input[placeholder*="LinkedIn"]',
        'input[aria-label*="LinkedIn"]',
      ];
      for (const sel of linkedinSelectors) {
        const el = page.locator(sel);
        if (await el.count() > 0) {
          await el.fill(profile.linkedinUrl);
          await logger.info('field_filled', 'LinkedIn URL populated');
          break;
        }
      }
    }

    if (profile.websiteUrl) {
      const websiteSelectors = [
        '#website',
        'input[name="job_application[urls][Website]"]',
        'input[placeholder*="Website"]',
        'input[placeholder*="Portfolio"]',
      ];
      for (const sel of websiteSelectors) {
        const el = page.locator(sel);
        if (await el.count() > 0) {
          await el.fill(profile.websiteUrl);
          await logger.info('field_filled', 'Website/portfolio URL populated');
          break;
        }
      }
    }

    // ── Resume upload ────────────────────────────────────────────────────────
    const resumePath = await browser.writeMarkdownToPdf(
      context.resumeMarkdown,
      `resume_${context.sessionId}.pdf`
    );

    const resumeSelectors = [
      'input[name="resume"]',
      'input[name="job_application[resume]"]',
      '#resume',
      'input[type="file"][accept*="pdf"]',
      'input[type="file"]',
    ];

    let resumeUploaded = false;
    for (const sel of resumeSelectors) {
      const el = page.locator(sel).first();
      if (await el.count() > 0) {
        await el.setInputFiles(resumePath);
        resumeUploaded = true;
        await logger.info('resume_uploaded', `Resume uploaded via: ${sel}`);
        await page.waitForTimeout(1500);
        break;
      }
    }

    if (!resumeUploaded) {
      await logger.warn('resume_upload_skipped', 'Could not locate resume upload input');
    }

    // ── Cover letter upload (optional field) ─────────────────────────────────
    const clPath = await browser.writeMarkdownToPdf(
      context.coverLetterMarkdown,
      `cover_letter_${context.sessionId}.pdf`
    );

    const clSelectors = [
      'input[name="cover_letter"]',
      'input[name="job_application[cover_letter]"]',
      '#cover_letter',
    ];

    for (const sel of clSelectors) {
      const el = page.locator(sel).first();
      if (await el.count() > 0) {
        await el.setInputFiles(clPath);
        await logger.info('cover_letter_uploaded', 'Cover letter uploaded');
        await page.waitForTimeout(1000);
        break;
      }
    }

    // ── Custom questions ─────────────────────────────────────────────────────
    await this.answerCustomQuestions(browser, context, logger);
  }

  // ─── Validate ─────────────────────────────────────────────────────────────

  async validate(
    browser: BrowserSession,
    _context: WorkflowContext,
    logger: ExecutionLogger
  ): Promise<{ valid: boolean; issues: string[] }> {
    const page = browser.page;
    const issues: string[] = [];

    // Greenhouse marks invalid fields with .invalid-field or aria-invalid
    const errorSelectors = [
      '.invalid-field',
      '[aria-invalid="true"]',
      '.field_with_errors',
      'p.error',
      '.error-message',
    ];

    for (const sel of errorSelectors) {
      const els = await page.locator(sel).all();
      for (const el of els) {
        const text = await el.textContent();
        if (text?.trim()) issues.push(text.trim());
      }
    }

    if (issues.length > 0) {
      await logger.warn('validation_issues', `${issues.length} validation issue(s)`, { issues });
    } else {
      await logger.info('validation_passed', 'Application validated — ready to submit');
    }

    return { valid: issues.length === 0, issues };
  }

  // ─── Finalize ─────────────────────────────────────────────────────────────

  async finalize(
    browser: BrowserSession,
    context: WorkflowContext,
    logger: ExecutionLogger
  ): Promise<WorkflowResult> {
    const page = browser.page;

    if (context.simulationMode) {
      await logger.info(
        'simulation_complete',
        'Simulation mode — stopping before submit. Application is ready.'
      );
      return {
        status: AutoApplyStatus.SIMULATED,
        canComplete: true,
        platform: ATSPlatform.GREENHOUSE,
        automationConfidence: 85,
        stepsCompleted: 5,
        stepsRemaining: 1,
        blockingIssue: null,
        estimatedSubmissionTime: '10 seconds',
      };
    }

    // Live mode — click the submit button
    const submitSelectors = [
      'input[type="submit"]#submit_app',
      'input[type="submit"][value*="Submit"]',
      'button[type="submit"]',
      '#submit_app',
    ];

    let submitted = false;
    for (const sel of submitSelectors) {
      const btn = page.locator(sel).first();
      if (await btn.count() > 0) {
        await btn.click();
        submitted = true;
        await logger.info('submit_clicked', `Submit button clicked via: ${sel}`);
        break;
      }
    }

    if (!submitted) {
      throw new InterventionError(
        InterventionReason.UNEXPECTED_PAGE,
        'Could not find the submit button on the Greenhouse application form.'
      );
    }

    // Wait for submission request to finish and confirmation page/DOM update to render
    try {
      await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => null);
    } catch {}
    await page.waitForTimeout(2000);

    const currentUrl = page.url().toLowerCase();
    const bodyText = ((await page.textContent('body')) ?? '').toLowerCase();

    // Check for Greenhouse confirmation container elements
    const thanksContainerCount = await page.locator('#thanks_container, .thanks-container, #application_confirmed, .application-confirmed, div#flash_notice').count().catch(() => 0);

    // Check if the original form has been hidden or removed after submission
    const formVisible = await page.locator('#application_form, form#application, #main_fields').isVisible().catch(() => false);

    const confirmationFound =
      thanksContainerCount > 0 ||
      (!formVisible && submitted) ||
      currentUrl.includes('thanks') ||
      currentUrl.includes('confirmation') ||
      bodyText.includes('application submitted') ||
      bodyText.includes('thank you') ||
      bodyText.includes('thanks for applying') ||
      bodyText.includes('thanks for your interest') ||
      bodyText.includes('successfully applied') ||
      bodyText.includes('we have received your application') ||
      bodyText.includes('your application has been received') ||
      bodyText.includes('application received') ||
      bodyText.includes('submitted successfully');

    if (!confirmationFound) {
      throw new InterventionError(
        InterventionReason.UNEXPECTED_PAGE,
        'No confirmation received after submitting the Greenhouse application. Please verify it was submitted.',
        page.url()
      );
    }

    await logger.info('confirmation_received', 'Greenhouse application submitted successfully');

    return {
      status: AutoApplyStatus.APPLIED,
      canComplete: true,
      platform: ATSPlatform.GREENHOUSE,
      automationConfidence: 85,
      stepsCompleted: 6,
      stepsRemaining: 0,
      blockingIssue: null,
      estimatedSubmissionTime: null,
    };
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  /**
   * Fill a text input if it exists; log and skip silently if not found.
   */
  private async fillInput(
    page: import('playwright').Page,
    selector: string,
    value: string,
    logger: ExecutionLogger,
    fieldName: string
  ): Promise<void> {
    const el = page.locator(selector).first();
    if (await el.count() > 0 && value) {
      await el.fill(value);
      await logger.info('field_filled', `Field "${fieldName}" populated`);
    }
  }

  /**
   * Iterate Greenhouse custom question fields and answer where possible.
   * Handles text inputs, radio buttons, native HTML selects, and modern React Select dropdowns.
   */
  private async answerCustomQuestions(
    browser: BrowserSession,
    context: WorkflowContext,
    logger: ExecutionLogger
  ): Promise<void> {
    const page = browser.page;
    const profile = context.userProfile;

    // Greenhouse wraps question fields in .field-wrapper, .field, .custom-field, or .select__container
    const questionContainers = await page
      .locator('.field-wrapper, .field, .custom-field, .application--questions > div, div.select')
      .all();

    for (const container of questionContainers) {
      const labelEl = container.locator('label, legend').first();
      const label = (await labelEl.textContent().catch(() => ''))?.toLowerCase().trim() ?? '';
      if (!label) continue;

      // 1. Text inputs (LinkedIn, Website, Phone, Location, etc.)
      const textInput = container.locator('input[type="text"], input[type="url"], input[type="tel"], input:not([type])').first();
      if (await textInput.count() > 0 && await textInput.isVisible().catch(() => false)) {
        let answer = '';
        if (label.includes('linkedin')) {
          answer = profile.linkedinUrl ?? '';
        } else if (label.includes('website') || label.includes('portfolio') || label.includes('github')) {
          answer = profile.websiteUrl ?? '';
        } else if (label.includes('phone') && profile.phone) {
          answer = profile.phone;
        } else if ((label.includes('location') || label.includes('city')) && profile.location) {
          answer = profile.location;
        }

        if (answer) {
          const currentVal = await textInput.inputValue().catch(() => '');
          if (!currentVal) {
            await textInput.fill(answer).catch(() => null);
            await logger.info('question_answered', `Custom text field populated: "${label.substring(0, 50)}"`);
          }
        }
      }

      // 2. Dropdowns: React Select or native <select>
      const hasSelect = (await container.locator('.select-shell, .select__control, select, input.select__input').count()) > 0;
      if (hasSelect) {
        let targetValue = '';

        if (
          label.includes('authorized') ||
          label.includes('eligible to work') ||
          label.includes('legally') ||
          label.includes('remotely') ||
          label.includes('state')
        ) {
          targetValue = 'Yes';
        } else if (label.includes('sponsorship') || label.includes('visa')) {
          targetValue = 'No';
        } else if (label.includes('country')) {
          targetValue = 'United States';
        } else if (label.includes('gender') || label.includes('sex')) {
          targetValue = 'Decline';
        } else if (label.includes('veteran')) {
          targetValue = 'not a protected veteran';
        } else if (label.includes('disability')) {
          targetValue = 'No';
        }

        if (targetValue) {
          try {
            // Check native <select> first
            const nativeSelect = container.locator('select').first();
            if (await nativeSelect.count() > 0) {
              const options = await nativeSelect.locator('option').all();
              for (const opt of options) {
                const optText = (await opt.textContent())?.trim() ?? '';
                if (optText.toLowerCase().includes(targetValue.toLowerCase())) {
                  const val = await opt.getAttribute('value');
                  if (val) await nativeSelect.selectOption(val);
                  await logger.info('question_answered', `Dropdown answered (${targetValue}): "${label.substring(0, 50)}"`);
                  break;
                }
              }
            } else {
              // React Select (.select__control / input.select__input)
              const control = container.locator('.select__control, .select-shell').first();
              const reactInput = container.locator('input.select__input, input[role="combobox"]').first();

              if (await control.count() > 0 || await reactInput.count() > 0) {
                if (await control.count() > 0) await control.click().catch(() => null);
                await page.waitForTimeout(200);

                if (await reactInput.count() > 0) {
                  await reactInput.focus().catch(() => null);
                  await page.keyboard.type(targetValue, { delay: 50 });
                  await page.keyboard.press('Enter');
                  await page.waitForTimeout(300);
                }

                // Fallback: Click matching option in dropdown popup
                const optionItem = page.locator('.select__option, [id*="-option-"]').filter({ hasText: new RegExp(targetValue, 'i') }).first();
                if (await optionItem.count() > 0 && await optionItem.isVisible().catch(() => false)) {
                  await optionItem.click().catch(() => null);
                }
                await logger.info('question_answered', `React Select answered (${targetValue}): "${label.substring(0, 50)}"`);
              }
            }
          } catch (err: any) {
            await logger.warn('question_error', `Failed to answer dropdown: ${label.substring(0, 50)}`, { error: err.message });
          }
        }
      }

      // 3. Radio buttons
      const radioGroup = container.locator('input[type="radio"]');
      if (await radioGroup.count() > 0) {
        if (label.includes('authorized') || label.includes('eligible to work') || label.includes('legally') || label.includes('remotely')) {
          const yesLabel = container.locator('label').filter({ hasText: /^yes$/i }).first();
          const yesRadio = container.locator('input[type="radio"][value="Yes"], input[type="radio"][value="true"]').first();
          if (await yesLabel.count() > 0) {
            await yesLabel.click().catch(() => null);
            await logger.info('question_answered', 'Work auth / Remote: Yes');
          } else if (await yesRadio.count() > 0) {
            await yesRadio.click().catch(() => null);
            await logger.info('question_answered', 'Work auth / Remote: Yes (radio)');
          }
        } else if (label.includes('sponsorship') || label.includes('visa')) {
          const noLabel = container.locator('label').filter({ hasText: /^no$/i }).first();
          if (await noLabel.count() > 0) {
            await noLabel.click().catch(() => null);
            await logger.info('question_answered', 'Visa sponsorship required: No');
          }
        }
      }
    }
  }
}

pluginRegistry.register(new GreenhousePlugin());
