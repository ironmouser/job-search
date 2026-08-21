import { ATSPlatform, ATSDetectionResult, WorkflowContext, WorkflowResult, InterventionReason } from '../types';
import { ExecutionLogger } from '../execution-logger';
import { BrowserSession } from '../browser-session';
import { detectJobClosed } from '../utils/job-status-detector';
import { safeClick, safeInteract, SafeInteractOptions, SafeInteractResult, UIObstructionDetector, UIObstructionResolver } from '../obstruction';

/**
 * ATSPlugin — Abstract base class for all ATS platform automation plugins.
 *
 * Every supported ATS (Workday, Greenhouse, Lever, etc.) extends this class
 * and provides platform-specific implementations of each lifecycle method.
 *
 * The lifecycle is: detect → prepare → apply → validate → finalize
 *
 * The WorkflowEngine calls these methods in sequence.
 * Plugins should throw InterventionError when they need human help.
 */
export abstract class ATSPlugin {
  /** The ATS platform this plugin handles */
  abstract readonly platform: ATSPlatform;

  /** Human-readable platform name for logging */
  abstract readonly displayName: string;

  /**
   * Detect whether a given page belongs to this ATS.
   * Uses URL patterns, HTML signatures, JS assets, and meta tags.
   * Called synchronously during the detection phase.
   *
   * @param url      The current page URL (after redirects)
   * @param html     The page HTML content
   * @param redirectChain  All URLs visited before reaching the final page
   */
  abstract detect(
    url: string,
    html: string,
    redirectChain: string[]
  ): ATSDetectionResult;

  /**
   * Prepare the browser session for this ATS.
   * Handle login, navigate to the application form, dismiss popups, etc.
   * Should leave the browser on the first page of the application form.
   */
  abstract prepare(
    browser: BrowserSession,
    context: WorkflowContext,
    logger: ExecutionLogger
  ): Promise<void>;

  /**
   * Fill in the application form.
   * Upload resume and cover letter, answer standard and dynamic questions.
   * Should NOT click the final submit button.
   */
  abstract apply(
    browser: BrowserSession,
    context: WorkflowContext,
    logger: ExecutionLogger
  ): Promise<void>;

  /**
   * Validate the form is ready to submit.
   * Check for required fields, validation errors, file upload confirmations.
   * Returns { valid: true } if ready, { valid: false, issues: [...] } otherwise.
   */
  abstract validate(
    browser: BrowserSession,
    context: WorkflowContext,
    logger: ExecutionLogger
  ): Promise<{ valid: boolean; issues: string[] }>;

  /**
   * Finalize the application.
   * In simulation mode: stop at the confirmation page and report canComplete.
   * In live mode: click submit and verify the confirmation.
   */
  abstract finalize(
    browser: BrowserSession,
    context: WorkflowContext,
    logger: ExecutionLogger
  ): Promise<WorkflowResult>;

  // ─── Shared Helpers ────────────────────────────────────────────────────────

  /**
   * Universal helper to detect if a page is requiring candidate account creation,
   * sign in, or password authentication across any ATS platform.
   */
  protected async checkAccountGate(
    page: import('playwright').Page,
    fallbackUrl: string,
    platformDisplayName: string,
    context?: WorkflowContext
  ): Promise<void> {
    const currentUrl = page.url();
    const lowerUrl = currentUrl.toLowerCase();
    const pageTitle = (await page.title().catch(() => '')) || '';
    const lowerTitle = pageTitle.toLowerCase();

    const urlMatch =
      lowerUrl.includes('/login') ||
      lowerUrl.includes('/signin') ||
      lowerUrl.includes('/sign-in') ||
      lowerUrl.includes('/sign_in') ||
      lowerUrl.includes('autofillwithresume') ||
      lowerUrl.includes('applymanually') ||
      lowerUrl.includes('createaccount') ||
      lowerUrl.includes('/create_account') ||
      lowerUrl.includes('/create-account') ||
      lowerUrl.includes('/register') ||
      lowerUrl.includes('/auth/');

    const titleMatch =
      lowerTitle.includes('sign in') ||
      lowerTitle.includes('log in') ||
      lowerTitle.includes('create account') ||
      lowerTitle.includes('create an account') ||
      lowerTitle.includes('register');

    const hasPasswordField = (await page.locator('input[type="password"], [data-automation-id*="password" i], input[name*="password" i]').count().catch(() => 0)) > 0;
    const domCreateAccount = (await page.locator('h1, h2, h3, div, button, a').filter({ hasText: /create account/i }).count().catch(() => 0)) > 0;
    const domSignIn = (await page.locator('h1, h2, h3, button, a').filter({ hasText: /sign in/i }).count().catch(() => 0)) > 0;
    const domPasswordReq = (await page.locator(':has-text("Password Requirements")').count().catch(() => 0)) > 0;
    const domVerifyPassword = (await page.locator(':has-text("Verify New Password")').count().catch(() => 0)) > 0;

    const guestBtn = page.locator('button, a').filter({ hasText: /apply as guest|continue as guest|apply without account/i }).first();
    const isGuestOption = (await guestBtn.count().catch(() => 0)) > 0;

    if (isGuestOption) {
      try {
        await guestBtn.click();
        await page.waitForTimeout(2000);
        return;
      } catch {
        // Guest click failed — proceed to credential attempt or intervention
      }
    }

    const isGateActive = urlMatch || titleMatch || hasPasswordField || domCreateAccount || domSignIn || domPasswordReq || domVerifyPassword;

    if (isGateActive) {
      const email = context?.userProfile?.accountEmail || context?.userProfile?.email;
      const password = context?.userProfile?.accountPassword;
      const authMode = context?.userProfile?.accountAuthMode || 'sign_in';

      if (email && password) {
        try {
          // 1. Tab / View switching
          if (authMode === 'create_account') {
            const createTabSelectors = [
              '[data-automation-id="createAccountLink"]',
              '[data-automation-id="createAccountButton"]',
              '[data-automation-id*="createAccount" i]',
              '[data-automation-id*="register" i]',
              'a:has-text("Create Account")',
              'button:has-text("Create Account")',
              'a:has-text("Create an account")',
              'button:has-text("Create an account")',
              'a:has-text("Register")',
              'button:has-text("Register")',
              'a:has-text("Sign Up")',
              'button:has-text("Sign Up")',
              'a:has-text("Don\'t have an account")',
              'button:has-text("Don\'t have an account")',
              'a:has-text("New User")',
              'button:has-text("New User")',
            ];

            for (const sel of createTabSelectors) {
              const tabEl = page.locator(sel).first();
              if ((await tabEl.count().catch(() => 0)) > 0 && (await tabEl.isVisible().catch(() => false))) {
                await tabEl.scrollIntoViewIfNeeded().catch(() => {});
                await tabEl.click({ force: true }).catch(() => {});
                await page.waitForTimeout(1500);
                break;
              }
            }
          } else if (authMode === 'sign_in') {
            const signInTabSelectors = [
              '[data-automation-id="signInLink"]',
              '[data-automation-id="signInButton"]',
              'a:has-text("Sign In")',
              'button:has-text("Sign In")',
              'a:has-text("Log In")',
              'button:has-text("Log In")',
              'a:has-text("Already have an account")',
              'button:has-text("Already have an account")',
            ];

            for (const sel of signInTabSelectors) {
              const tabEl = page.locator(sel).first();
              if ((await tabEl.count().catch(() => 0)) > 0 && (await tabEl.isVisible().catch(() => false))) {
                await tabEl.scrollIntoViewIfNeeded().catch(() => {});
                await tabEl.click({ force: true }).catch(() => {});
                await page.waitForTimeout(1500);
                break;
              }
            }
          }

          // 2. Poll/wait for Email & Password inputs to render in SPA DOM
          let emailInput = page.locator('input[type="email"], input[name*="email" i], input[id*="email" i], [data-automation-id*="email" i], [data-automation-id="username"], input[name*="user" i]').first();
          let passwordInputs = page.locator('input[type="password"], [data-automation-id*="password" i], input[name*="password" i]');

          for (let waitCount = 0; waitCount < 5; waitCount++) {
            if ((await emailInput.count().catch(() => 0)) > 0 && (await passwordInputs.count().catch(() => 0)) > 0) {
              break;
            }
            await page.waitForTimeout(1000);
            emailInput = page.locator('input[type="email"], input[name*="email" i], input[id*="email" i], [data-automation-id*="email" i], [data-automation-id="username"], input[name*="user" i]').first();
            passwordInputs = page.locator('input[type="password"], [data-automation-id*="password" i], input[name*="password" i]');
          }

          // 3. Fallback: If inputs still not visible, try option buttons (e.g. "Apply Manually", "Sign In to Apply", "Autofill with Resume")
          if ((await emailInput.count().catch(() => 0)) === 0 || (await passwordInputs.count().catch(() => 0)) === 0) {
            const optionBtns = page.locator('button, a').filter({ hasText: /apply manually|autofill with resume|sign in to apply|create account to apply/i });
            if ((await optionBtns.count().catch(() => 0)) > 0) {
              await optionBtns.first().click().catch(() => {});
              await page.waitForTimeout(2000);
              emailInput = page.locator('input[type="email"], input[name*="email" i], input[id*="email" i], [data-automation-id*="email" i], [data-automation-id="username"], input[name*="user" i]').first();
              passwordInputs = page.locator('input[type="password"], [data-automation-id*="password" i], input[name*="password" i]');
            }
          }

          if ((await emailInput.count().catch(() => 0)) > 0 && (await passwordInputs.count().catch(() => 0)) > 0) {
            await emailInput.fill('').catch(() => {});
            await this.typeHumanized(page, emailInput, email);
            
            // Fill primary password
            await passwordInputs.nth(0).fill('').catch(() => {});
            await this.typeHumanized(page, passwordInputs.nth(0), password);

            // Fill verify password if a second password field exists
            if (await passwordInputs.count() > 1) {
              await passwordInputs.nth(1).fill('').catch(() => {});
              await this.typeHumanized(page, passwordInputs.nth(1), password);
            } else {
              const confirmInput = page.locator('input[name*="confirm" i], input[name*="verify" i], [data-automation-id*="verifyPassword" i], [data-automation-id*="confirmPassword" i]').first();
              if (await confirmInput.count() > 0) {
                await confirmInput.fill('').catch(() => {});
                await this.typeHumanized(page, confirmInput, password);
              }
            }

            const termsCheckbox = page.locator('input[type="checkbox"][name*="term" i], input[type="checkbox"][name*="privacy" i], [data-automation-id*="agree" i], [data-automation-id*="checkbox" i], input[type="checkbox"]').first();
            if (await termsCheckbox.count() > 0) {
              const isChecked = await termsCheckbox.isChecked().catch(() => false);
              if (!isChecked) {
                await termsCheckbox.check({ force: true }).catch(() => {});
              }
            }

            let submitBtn = authMode === 'create_account'
              ? page.locator('[data-automation-id="createAccountSubmitButton"], [data-automation-id*="createAccount" i], button:has-text("Create Account"), button:has-text("Register"), button:has-text("Sign Up"), button:has-text("Create")').first()
              : page.locator('[data-automation-id="signInSubmitButton"], [data-automation-id*="signIn" i], button:has-text("Sign In"), button:has-text("Log In")').first();

            if (await submitBtn.count() === 0) {
              submitBtn = page.locator('button[type="submit"], input[type="submit"], [data-automation-id="createAccountSubmitButton"], [data-automation-id="signInSubmitButton"], [data-automation-id*="createAccount" i], [data-automation-id*="signIn" i], [data-automation-id*="submit" i], button:has-text("Create Account"), button:has-text("Sign In"), button:has-text("Register"), button:has-text("Log In"), button:has-text("Submit"), button:has-text("Continue")').first();
            }

            if (await submitBtn.count() > 0) {
              await submitBtn.click({ force: true }).catch(() => {});
              
              // Wait up to 10 seconds for navigation or password field disappearance
              for (let i = 0; i < 10; i++) {
                await page.waitForTimeout(1000);
                const isPasswordStillVisible = (await page.locator('input[type="password"]').count().catch(() => 0)) > 0;
                if (!isPasswordStillVisible) {
                  return; // Gate successfully cleared!
                }
              }

              // Check if an error message is visible on the page
              const errorEl = page.locator('[data-automation-id*="error" i], [data-automation-id="alert"], .error-msg, [aria-invalid="true"], [role="alert"], :has-text("already exists"), :has-text("Invalid user name"), :has-text("Password Requirements")').first();
              let errorDetails = '';
              if (await errorEl.count() > 0) {
                const text = await errorEl.textContent().catch(() => '');
                if (text && text.trim().length > 0) {
                  const cleanText = text.trim().slice(0, 150);
                  if (/already exists/i.test(cleanText)) {
                    errorDetails = ` An account with this email already exists on ${platformDisplayName}. Please select "Yes, sign me in" to use your existing password.`;
                  } else if (/invalid|incorrect/i.test(cleanText)) {
                    errorDetails = ` Invalid email or password reported by ${platformDisplayName}. Please check your credentials.`;
                  } else {
                    errorDetails = ` Portal notice: "${cleanText}"`;
                  }
                }
              }

              throw new InterventionError(
                InterventionReason.LOGIN_REQUIRED,
                errorDetails ? `Authentication issue: ${errorDetails.trim()}` : `Attempted candidate account entry, but the account gate on ${platformDisplayName} is still active. Please verify your credentials or finish manually.`,
                currentUrl || fallbackUrl
              );
            }
          }
        } catch (authErr) {
          if (authErr instanceof InterventionError) throw authErr;
          // Automated credential entry encountered error — fallback to intervention
        }
      }

      throw new InterventionError(
        InterventionReason.LOGIN_REQUIRED,
        `${platformDisplayName} requires candidate account creation or sign in. Please log in or create an account to proceed.`,
        currentUrl || fallbackUrl
      );
    }
  }

  /**
   * Universal multi-step application wizard processor.
   * Works across all ATS platforms (Workday, Taleo, iCIMS, multi-page forms, etc.).
   *
   * Iterates through sequential pages, invoking `fillStepCallback` on each page,
   * checking for account gates, and clicking "Save & Continue" / "Next" buttons
   * until reaching the final submission step.
   */
  protected async processMultiStepWizard(
    browser: BrowserSession,
    context: WorkflowContext,
    logger: ExecutionLogger,
    fillStepCallback: (ctx: import('playwright').Frame | import('playwright').Page, step: number) => Promise<void>,
    nextSelectors: string[] = []
  ): Promise<void> {
    const page = browser.page;
    const maxSteps = 8;

    const defaultNextSelectors = [
      '[data-automation-id="bottom-navigation-next-button"]',
      'button[type="submit"]:has-text("Next")',
      'button[type="submit"]:has-text("Continue")',
      'button:has-text("Save and Continue")',
      'button:has-text("Save & Continue")',
      'button:has-text("Next Step")',
      'button:has-text("Continue")',
      'input[type="submit"][value*="Next" i]',
      'input[type="submit"][value*="Continue" i]',
      'input[type="button"][value*="Next" i]',
      'input[type="button"][value*="Continue" i]',
      'a:has-text("Save and Continue")',
      'a:has-text("Next")',
    ];

    const candidates = [...nextSelectors, ...defaultNextSelectors];

    for (let step = 1; step <= maxSteps; step++) {
      await logger.info('wizard_step', `Processing ${this.displayName} application step ${step}`);

      // Check account gate or login prompt on every page step
      await this.checkAccountGate(page, context.jobUrl, this.displayName, context);

      // Find active form frame if present (e.g. iCIMS or Taleo iframes)
      const formCtx = await browser.findFormFrame([
        'input[type="file"]',
        'input[name*="email" i]',
        'input[name*="first" i]',
        'form',
      ]);

      // Execute step form fill logic
      await fillStepCallback(formCtx, step);

      // Search for the Next / Save and Continue button
      let nextBtn: import('playwright').ElementHandle | null = null;
      let matchedText = '';

      for (const sel of candidates) {
        const handle = await formCtx.$(sel).catch(() => null);
        if (handle) {
          const isVisible = await handle.isVisible().catch(() => false);
          if (isVisible) {
            nextBtn = handle;
            matchedText = ((await handle.textContent().catch(() => '')) || '').trim().toLowerCase();
            break;
          }
        }
      }

      if (nextBtn) {
        // If button text is "submit", "complete", or "finish", we reached the final step
        if (matchedText.includes('submit') || matchedText.includes('complete application') || matchedText.includes('finish')) {
          await logger.info('wizard_complete', `Reached final submission step on ${this.displayName}`);
          break;
        }

        const isDisabled = (await nextBtn.getAttribute('disabled').catch(() => null)) !== null;
        if (!isDisabled) {
          await nextBtn.click().catch(() => {});
          await logger.info('wizard_advanced', `Advanced ${this.displayName} wizard to step ${step + 1}`);
          await page.waitForTimeout(3000);
        } else {
          await logger.warn('wizard_step_blocked', `Next button is disabled on step ${step} — required fields may be missing`);
          break;
        }
      } else {
        await logger.info('wizard_complete', `Completed ${this.displayName} wizard page navigation`);
        break;
      }
    }
  }

  /**
   * Locates the final submit button within a frame/page using a priority-ordered
   * strategy that balances precision against resilience to CSS-Module hash changes
   * and ATS-specific markup quirks.
   *
   * Priority:
   *  1. Platform-specific semantic selector(s) — passed in via `semanticSelectors`.
   *     These are intentionally stable identifiers the ATS vendor adds for their
   *     own tooling (e.g. `.ashby-application-form-submit-button`, `#submit_app`).
   *  2. Standard HTML `type="submit"` attribute on <button> or <input>.
   *  3. Fuzzy: any <button> or <input> whose class, id, name, data-testid, or
   *     aria-label *contains* "submit" (case-insensitive). Each candidate is
   *     validated against a blocklist so that "Next Step" / "Continue" / "Save
   *     Draft" buttons are never matched.
   *  4. Text-content fallback: any <button> or <a> whose visible text contains
   *     "submit" (case-insensitive), again blocklist-validated.
   *
   * @param ctx               The Playwright Frame or Page to search within.
   * @param logger            ExecutionLogger for audit trail entries.
   * @param semanticSelectors Optional ordered list of platform-specific CSS
   *                          selectors to try before falling back to generic tiers.
   */
  protected async findSubmitButton(
    ctx: import('playwright').Frame | import('playwright').Page,
    logger: ExecutionLogger,
    semanticSelectors: string[] = []
  ): Promise<import('playwright').ElementHandle | null> {
    // Words that disqualify a fuzzy or text match — these appear on navigation
    // and save-draft buttons, not on final-submission buttons.
    const BLOCKLIST = /\b(next|continue|back|previous|save|cancel|skip|draft)\b/i;

    // ── Tier 1: platform-specific semantic selectors ───────────────────────
    for (const sel of semanticSelectors) {
      const el = await ctx.$(sel).catch(() => null);
      if (el) {
        await logger.info('submit_btn_found', `Submit button located via semantic selector: "${sel}"`);
        return el;
      }
    }

    // ── Tier 2: standard HTML submit attribute ─────────────────────────────
    const tier2 = await ctx.$('button[type="submit"], input[type="submit"]').catch(() => null);
    if (tier2) {
      await logger.info('submit_btn_found', 'Submit button located via type="submit"');
      return tier2;
    }

    // ── Tier 3: fuzzy attribute/class contains "submit", text-validated ────
    // CSS attribute selectors support case-insensitive matching via the `i` flag.
    const FUZZY_SELECTOR = [
      'button[class*="submit" i]',
      'button[id*="submit" i]',
      'button[name*="submit" i]',
      'button[data-testid*="submit" i]',
      'button[aria-label*="submit" i]',
      'input[id*="submit" i]',
      'input[name*="submit" i]',
      'input[data-testid*="submit" i]',
    ].join(', ');

    const candidates = await ctx.$$(FUZZY_SELECTOR).catch(() => []);
    for (const candidate of candidates) {
      const text = ((await candidate.textContent().catch(() => null)) ?? '').trim();
      if (!BLOCKLIST.test(text)) {
        await logger.info('submit_btn_found', `Submit button located via fuzzy attr/class match (text: "${text}")`);
        return candidate;
      }
    }

    // ── Tier 4: visible text contains "submit", blocklist-validated ─────────
    const allClickable = await ctx.$$('button, a[role="button"]').catch(() => []);
    for (const el of allClickable) {
      const text = ((await el.textContent().catch(() => null)) ?? '').trim();
      if (/submit/i.test(text) && !BLOCKLIST.test(text)) {
        await logger.info('submit_btn_found', `Submit button located via text-content scan (text: "${text}")`);
        return el;
      }
    }

    await logger.warn('submit_btn_not_found', 'All four tiers exhausted — submit button not found');
    return null;
  }

  /**
   * Helper to check if the current page has closed-job or expired indicators.
   * If detected, throws an InterventionError with InterventionReason.JOB_CLOSED.
   */
  protected async checkClosedJob(
    browser: BrowserSession,
    logger: ExecutionLogger,
    fallbackUrl?: string
  ): Promise<void> {
    const closedCheck = await detectJobClosed(browser, logger);
    if (closedCheck.isClosed) {
      throw new InterventionError(
        InterventionReason.JOB_CLOSED,
        closedCheck.reason || 'This position is no longer accepting applications or has been closed by the employer.',
        browser.page?.url() || fallbackUrl
      );
    }
  }

  /**
   * Reusable obstruction-aware click helper available to all ATS plugins.
   */
  protected async safeClick(
    ctx: import('playwright').Frame | import('playwright').Page,
    target: import('playwright').Locator | string,
    logger?: ExecutionLogger,
    options?: SafeInteractOptions
  ): Promise<SafeInteractResult> {
    return safeClick(ctx, target, options, logger);
  }

  /**
   * Reusable obstruction-aware interaction wrapper available to all ATS plugins.
   */
  protected async safeInteract(
    ctx: import('playwright').Frame | import('playwright').Page,
    target: import('playwright').Locator | string,
    action: (loc: import('playwright').Locator) => Promise<void>,
    logger?: ExecutionLogger,
    options?: SafeInteractOptions
  ): Promise<SafeInteractResult> {
    return safeInteract(ctx, target, action, options, logger);
  }

  /**
   * Proactively scans and dismisses any visible cookie settings/banners on the page.
   */
  protected async dismissCookieBanners(
    ctx: import('playwright').Frame | import('playwright').Page,
    logger?: ExecutionLogger
  ): Promise<boolean> {
    return UIObstructionResolver.dismissCookieBannerIfPresent(ctx, logger);
  }

  /**
   * Types text into a form input with randomized human-like character latency
   * and dispatches necessary DOM events to avoid anti-bot velocity triggers.
   */
  protected async typeHumanized(
    ctx: import('playwright').Frame | import('playwright').Page,
    target: import('playwright').ElementHandle | import('playwright').Locator | string,
    text: string,
    options: { delayMin?: number; delayMax?: number; clearFirst?: boolean } = {}
  ): Promise<void> {
    const { delayMin = 15, delayMax = 40, clearFirst = true } = options;

    let handle: import('playwright').ElementHandle | null = null;
    let locator: import('playwright').Locator | null = null;

    if (typeof target === 'string') {
      locator = ctx.locator(target).first();
    } else if ('click' in target && 'fill' in target && 'pressSequentially' in target) {
      locator = target as import('playwright').Locator;
    } else {
      handle = target as import('playwright').ElementHandle;
    }

    if (locator) {
      if (clearFirst) {
        await locator.fill('').catch(() => {});
      }
      await locator.focus().catch(() => {});
      for (const char of text) {
        const delay = Math.floor(Math.random() * (delayMax - delayMin + 1)) + delayMin;
        await locator.pressSequentially(char, { delay }).catch(() => {});
      }
      await locator.dispatchEvent('input').catch(() => {});
      await locator.dispatchEvent('change').catch(() => {});
    } else if (handle) {
      if (clearFirst) {
        await handle.fill('').catch(() => {});
      }
      await handle.focus().catch(() => {});
      for (const char of text) {
        const delay = Math.floor(Math.random() * (delayMax - delayMin + 1)) + delayMin;
        await handle.type(char, { delay }).catch(() => {});
      }
      await handle.dispatchEvent('input').catch(() => {});
      await handle.dispatchEvent('change').catch(() => {});
    }

    // Small natural pause between fields (150-300ms)
    await new Promise((r) => setTimeout(r, Math.floor(Math.random() * 150) + 150));
  }

  /**
   * Universal helper to handle consent, terms, privacy, and future talent pool checkboxes.
   */
  protected async handleConsentCheckboxes(
    ctx: import('playwright').Frame | import('playwright').Page,
    logger?: ExecutionLogger
  ): Promise<void> {
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
          if (logger) {
            await logger.info('checkbox_checked', 'Accepted opportunity contact / privacy consent checkbox');
          }
        }
      }
    } catch {}
  }

  /**
   * Universal helper to answer EEOC demographic and work eligibility fields
   * across radios, dropdowns, and selects.
   */
  protected async handleEEOCDemographics(
    ctx: import('playwright').Frame | import('playwright').Page,
    profile: import('../types').UserProfile,
    logger?: ExecutionLogger
  ): Promise<void> {
    // 1. Process Radio buttons
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

    // 2. Process Select dropdowns
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
   * Universal helper to verify application submission results across any ATS.
   * Actively scans for anti-bot spam flags, employer limits, validation errors,
   * and requires positive confirmation before allowing APPLIED status.
   */
  protected async verifyPostSubmission(
    browser: BrowserSession,
    ctx: import('playwright').Frame | import('playwright').Page,
    logger: ExecutionLogger,
    options: {
      platformDisplayName: string;
      confirmationSelectors?: string[];
      confirmationKeywords?: string[];
      expectedUrlKeywords?: string[];
      errorSelectors?: string[];
      maxWaitMs?: number;
    }
  ): Promise<void> {
    const page = browser.page;
    const maxWait = options.maxWaitMs ?? 8000;
    const startTime = Date.now();
    const platform = options.platformDisplayName;

    const defaultConfirmationKeywords = [
      'thank you for applying',
      'thanks for applying',
      'application submitted',
      'application received',
      'successfully submitted',
      'successfully applied',
      'we have received your application',
      'your application has been received',
      'your application was submitted',
      'we received your application',
      'thanks for your interest',
    ];

    const allConfirmKeywords = [
      ...defaultConfirmationKeywords,
      ...(options.confirmationKeywords || []).map((k) => k.toLowerCase()),
    ];

    const defaultUrlKeywords = ['thanks', 'confirmation', 'submitted', 'applied', 'success'];
    const allUrlKeywords = [
      ...defaultUrlKeywords,
      ...(options.expectedUrlKeywords || []).map((k) => k.toLowerCase()),
    ];

    while (Date.now() - startTime < maxWait) {
      await page.waitForTimeout(1000);

      const currentUrl = (page.url() || '').toLowerCase();
      const pageText = ((await page.textContent('body').catch(() => '')) || '').toLowerCase();
      const frameText = (ctx !== page ? ((await ctx.textContent('body').catch(() => '')) || '').toLowerCase() : '');
      const combinedText = `${pageText} ${frameText}`;

      // ─── 1. Check Anti-Bot / Spam Flag Banners ────────────────────────────
      const spamKeywords = [
        'flagged as possible spam',
        'flagged as spam',
        'couldn\'t submit your application',
        'could not submit your application',
        'try these steps',
        'turn off your vpn or proxy',
        'turn off your vpn',
        'legitimate applications are occasionally flagged',
      ];
      for (const kw of spamKeywords) {
        if (combinedText.includes(kw)) {
          await logger.warn('submission_spam_flagged', `Submission flagged by anti-bot/spam filter on ${platform}`);
          throw new InterventionError(
            InterventionReason.APPLICATION_BLOCKED_BY_BOT_CHALLENGE,
            `Application submission was flagged as possible spam by ${platform} anti-bot detection. Please verify your network or submit manually.`,
            page.url()
          );
        }
      }

      // ─── 2. Check Security Challenges / CAPTCHA ───────────────────────────
      const activeChallengePhrases = [
        'verify you are human',
        'verifying you are human',
        'cloudflare challenge',
        'please complete the security check to continue',
        'solve the puzzle to prove you are human',
        'press and hold to confirm',
        'confirm you are not a robot',
        'complete the captcha to submit',
      ];
      const hasChallengePhrase = activeChallengePhrases.some((phrase) => combinedText.includes(phrase));

      const hasVisibleChallengeElement = (await page.locator(
        'iframe[src*="recaptcha"]:visible, iframe[src*="hcaptcha"]:visible, iframe[src*="turnstile"]:visible, iframe[src*="cloudflare"]:visible, .g-recaptcha:visible, .cf-turnstile:visible'
      ).count().catch(() => 0)) > 0;

      if (hasChallengePhrase || hasVisibleChallengeElement) {
        await logger.warn('submission_security_challenge', `Security challenge / CAPTCHA detected on ${platform}`);
        throw new InterventionError(
          InterventionReason.APPLICATION_BLOCKED_BY_BOT_CHALLENGE,
          `Security challenge or CAPTCHA detected on ${platform} after submission. Please complete the verification in the portal.`,
          page.url()
        );
      }

      // ─── 3. Check Explicit Submission Rejection Errors ────────────────────
      if (
        combinedText.includes('you have exceeded the maximum number of applications') ||
        combinedText.includes('you have already submitted the maximum allowed applications') ||
        combinedText.includes('maximum application limit exceeded')
      ) {
        await logger.warn('submission_limit_exceeded', `Application limit exceeded on ${platform}`);
        throw new InterventionError(
          InterventionReason.JOB_CLOSED,
          `You have exceeded the maximum allowed applications for this company on ${platform}.`,
          page.url()
        );
      }

      // ─── 4. Check Positive Confirmation Indicators ─────────────────────────
      // URL pattern match
      const urlConfirmed = allUrlKeywords.some((kw) => currentUrl.includes(kw));

      // Custom or platform confirmation selectors
      let selectorConfirmed = false;
      if (options.confirmationSelectors && options.confirmationSelectors.length > 0) {
        for (const sel of options.confirmationSelectors) {
          const count = await ctx.locator(sel).count().catch(() => 0);
          if (count > 0) {
            selectorConfirmed = true;
            break;
          }
          if (ctx !== page) {
            const pageCount = await page.locator(sel).count().catch(() => 0);
            if (pageCount > 0) {
              selectorConfirmed = true;
              break;
            }
          }
        }
      }

      // Body text keyword match
      const textConfirmed = allConfirmKeywords.some((kw) => combinedText.includes(kw));

      if (urlConfirmed || selectorConfirmed || textConfirmed) {
        await logger.info('confirmation_received', `${platform} application confirmed successfully`);
        return;
      }

      // ─── 5. Check Explicit Form Error Banners ──────────────────────────────
      const errorSelectors = [
        '[role="alert"]',
        '.error-message',
        '.error-banner',
        '.ashby-application-form-error',
        '[class*="errorMessage" i]',
        '[class*="errorBanner" i]',
        ...(options.errorSelectors || []),
      ];

      for (const errSel of errorSelectors) {
        const errorEl = ctx.locator(errSel).first();
        if (await errorEl.isVisible().catch(() => false)) {
          const errText = ((await errorEl.textContent().catch(() => '')) || '').trim();
          if (errText.length > 0) {
            // Ignore benign non-errors (e.g. cookie consent notices)
            if (!/cookie|privacy/i.test(errText)) {
              await logger.warn('submission_form_error', `Form error banner detected on ${platform}: ${errText.slice(0, 100)}`);
              throw new InterventionError(
                InterventionReason.UNEXPECTED_PAGE,
                `${platform} reported a submission error: "${errText.slice(0, 150)}"`,
                page.url()
              );
            }
          }
        }
      }
    }

    // If timeout is reached and no positive confirmation was found:
    await logger.warn('confirmation_not_found', `No submission confirmation detected on ${platform} after ${maxWait}ms`);
    throw new InterventionError(
      InterventionReason.UNEXPECTED_PAGE,
      `No confirmation received after submitting the ${platform} application. Please verify submission directly on the portal.`,
      page.url()
    );
  }
}

/**
 * InterventionError — thrown by plugins when human help is required.
 * The WorkflowEngine catches this and creates an InterventionRequest via the API.
 */
export class InterventionError extends Error {
  constructor(
    public readonly reason: string,
    public readonly description: string,
    public readonly pageUrl?: string
  ) {
    super(`Intervention needed [${reason}]: ${description}`);
    this.name = 'InterventionError';
  }
}
