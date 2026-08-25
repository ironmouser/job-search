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
    const currentUrl = page.url() || '';
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

    const hasPasswordField = (await page.locator('input[type="password"], input[data-automation-id*="password" i], input[name*="password" i]').count().catch(() => 0)) > 0;
    const domPasswordReq = (await page.locator(':has-text("Password Requirements"), :has-text("Verify New Password"), :has-text("Verify Password")').count().catch(() => 0)) > 0;

    const authModal = page.locator('[role="dialog"], [aria-modal="true"], [data-automation-id*="auth" i], [data-automation-id*="modal" i], [data-automation-id="signInPage"], [data-automation-id="createAccountPage"], form[action*="login" i], form[action*="auth" i]').first();
    const hasAuthModal = (await authModal.count().catch(() => 0)) > 0 && 
      (await authModal.locator('input[type="password"], input[type="email"], input[name*="user" i], input[data-automation-id*="password" i]').count().catch(() => 0)) > 0;

    const hasAuthInputs = (await page.locator('input[type="email"], input[name*="email" i], input[id*="email" i], input[data-automation-id="email"], input[data-automation-id="userName"], input[data-automation-id="username"], input[name*="user" i]').count().catch(() => 0)) > 0;

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

    // A gate is genuinely active only when a password field is present, password requirements are shown,
    // an auth modal with inputs is open, or an explicit auth URL/title has login input fields.
    const isGateActive = hasPasswordField || domPasswordReq || hasAuthModal || ((urlMatch || titleMatch) && hasAuthInputs);

    if (isGateActive) {
      const email = context?.userProfile?.accountEmail || context?.userProfile?.email;
      const password = context?.userProfile?.accountPassword;
      const authMode = context?.userProfile?.accountAuthMode || 'create_account';

      if (email && password) {
        try {
          // Identify active frame (main page or nested iframe)
          let targetCtx: import('playwright').Page | import('playwright').Frame = page;
          for (const frame of page.frames()) {
            if (frame === page.mainFrame()) continue;
            const framePassCount = await frame.locator('input[type="password"], input[data-automation-id*="password" i]').count().catch(() => 0);
            if (framePassCount > 0) {
              targetCtx = frame;
              break;
            }
          }

          // 1. Tab / View switching — accurately locate switch links WITHOUT clicking submit buttons
          if (authMode === 'create_account') {
            const hasVerifyPass = (await targetCtx.locator('input[data-automation-id="verifyPassword"], input[data-automation-id="confirmPassword"], input[name*="verify" i], input[name*="confirm" i]').count().catch(() => 0)) > 0;
            if (!hasVerifyPass) {
              const createSwitchSelectors = [
                '[data-automation-id="createAccountLink"]',
                'a[data-automation-id="createAccountLink"]',
                'button[data-automation-id="createAccountLink"]',
                'a[data-automation-id*="createAccount" i]:not([data-automation-id*="Submit" i])',
                'a:has-text("Create Account")',
                'a:has-text("Create an account")',
                'a:has-text("Create an Account")',
                'a:has-text("Register")',
                'a:has-text("Sign Up")',
                'a:has-text("Don\'t have an account")',
                'button:has-text("Don\'t have an account")',
                '[role="tab"]:has-text("Create Account")',
                '[role="tab"]:has-text("Register")',
                '[role="tab"]:has-text("Sign Up")',
              ];

              for (const sel of createSwitchSelectors) {
                const switchEl = targetCtx.locator(sel).first();
                if ((await switchEl.count().catch(() => 0)) > 0 && (await switchEl.isVisible().catch(() => false))) {
                  await switchEl.scrollIntoViewIfNeeded().catch(() => {});
                  await switchEl.click({ force: true }).catch(() => {});
                  await page.waitForTimeout(1500);
                  break;
                }
              }
            }
          } else if (authMode === 'sign_in') {
            const hasVerifyPass = (await targetCtx.locator('input[data-automation-id="verifyPassword"], input[data-automation-id="confirmPassword"], input[name*="verify" i], input[name*="confirm" i]').count().catch(() => 0)) > 0;
            if (hasVerifyPass) {
              const signInSwitchSelectors = [
                '[data-automation-id="signInLink"]',
                'a[data-automation-id="signInLink"]',
                'button[data-automation-id="signInLink"]',
                'a[data-automation-id*="signIn" i]:not([data-automation-id*="Submit" i])',
                'a:has-text("Sign In")',
                'a:has-text("Log In")',
                'a:has-text("Already have an account")',
                'button:has-text("Already have an account")',
                '[role="tab"]:has-text("Sign In")',
                '[role="tab"]:has-text("Log In")',
              ];

              for (const sel of signInSwitchSelectors) {
                const switchEl = targetCtx.locator(sel).first();
                if ((await switchEl.count().catch(() => 0)) > 0 && (await switchEl.isVisible().catch(() => false))) {
                  await switchEl.scrollIntoViewIfNeeded().catch(() => {});
                  await switchEl.click({ force: true }).catch(() => {});
                  await page.waitForTimeout(1500);
                  break;
                }
              }
            }
          }

          // 2. Poll/wait for actual <input> elements to render
          const emailInputLocators = [
            targetCtx.locator('input[data-automation-id="email"]').first(),
            targetCtx.locator('input[data-automation-id="userName"]').first(),
            targetCtx.locator('input[data-automation-id="username"]').first(),
            targetCtx.locator('input[type="email"]').first(),
            targetCtx.locator('input[name="email" i]').first(),
            targetCtx.locator('input[id*="email" i]').first(),
            targetCtx.locator('input[name*="user" i]').first(),
            targetCtx.locator('input[id*="user" i]').first(),
            targetCtx.locator('input[autocomplete="username"]').first(),
            targetCtx.locator('input[autocomplete="email"]').first(),
          ];

          const passwordInputLocators = [
            targetCtx.locator('input[data-automation-id="password"]').first(),
            targetCtx.locator('input[type="password"]').first(),
            targetCtx.locator('input[name*="password" i]').first(),
            targetCtx.locator('input[id*="password" i]').first(),
          ];

          let emailInput: import('playwright').Locator | null = null;
          let passwordInput: import('playwright').Locator | null = null;

          for (let waitCount = 0; waitCount < 6; waitCount++) {
            for (const loc of emailInputLocators) {
              if ((await loc.count().catch(() => 0)) > 0 && (await loc.isVisible().catch(() => false))) {
                emailInput = loc;
                break;
              }
            }
            for (const loc of passwordInputLocators) {
              if ((await loc.count().catch(() => 0)) > 0 && (await loc.isVisible().catch(() => false))) {
                passwordInput = loc;
                break;
              }
            }
            if (emailInput && passwordInput) break;
            await page.waitForTimeout(1000);
          }

          if (emailInput && passwordInput) {
            // Helper to fill input and commit React/SPA state events
            const fillAndCommit = async (loc: import('playwright').Locator, val: string) => {
              await loc.scrollIntoViewIfNeeded().catch(() => {});
              await loc.click({ force: true }).catch(() => {});
              await loc.fill(val).catch(async () => {
                await loc.pressSequentially(val, { delay: 20 }).catch(() => {});
              });
              await loc.dispatchEvent('input').catch(() => {});
              await loc.dispatchEvent('change').catch(() => {});
              await loc.dispatchEvent('blur').catch(() => {});
            };

            // Fill Email
            await fillAndCommit(emailInput, email);

            // Fill Primary Password
            await fillAndCommit(passwordInput, password);

            // If Create Account mode: fill verify password & check terms checkbox
            if (authMode === 'create_account') {
              const verifyPasswordLocators = [
                targetCtx.locator('input[data-automation-id="verifyPassword"]').first(),
                targetCtx.locator('input[data-automation-id="confirmPassword"]').first(),
                targetCtx.locator('input[name*="verify" i]').first(),
                targetCtx.locator('input[name*="confirm" i]').first(),
                targetCtx.locator('input[id*="verify" i]').first(),
                targetCtx.locator('input[id*="confirm" i]').first(),
              ];

              for (const loc of verifyPasswordLocators) {
                if ((await loc.count().catch(() => 0)) > 0 && (await loc.isVisible().catch(() => false))) {
                  await fillAndCommit(loc, password);
                  break;
                }
              }

              // Check consent / terms checkbox
              const consentLocators = [
                targetCtx.locator('input[data-automation-id="createAccountCheckbox"]').first(),
                targetCtx.locator('div[data-automation-id="createAccountCheckbox"] input').first(),
                targetCtx.locator('div[data-automation-id*="createAccountCheckbox" i]').first(),
                targetCtx.locator('input[type="checkbox"][name*="term" i]').first(),
                targetCtx.locator('input[type="checkbox"][name*="privacy" i]').first(),
                targetCtx.locator('input[type="checkbox"][name*="consent" i]').first(),
                targetCtx.locator('input[type="checkbox"]').first(),
              ];

              for (const loc of consentLocators) {
                if ((await loc.count().catch(() => 0)) > 0 && (await loc.isVisible().catch(() => false))) {
                  const isChecked = await loc.isChecked().catch(() => false);
                  if (!isChecked) {
                    await loc.check({ force: true }).catch(async () => {
                      await loc.click({ force: true }).catch(() => {});
                    });
                    // Also trigger click on label / container for custom React checkboxes
                    await loc.evaluate((el) => {
                      const label = el.closest('label') || el.parentElement;
                      if (label && !(el as HTMLInputElement).checked) {
                        (label as HTMLElement).click();
                      }
                    }).catch(() => {});
                    await page.waitForTimeout(300);
                  }
                  break;
                }
              }
            }

            // Locate submit button
            let submitBtn: import('playwright').Locator | null = null;
            if (authMode === 'create_account') {
              const createSubmitSelectors = [
                targetCtx.locator('button[data-automation-id="createAccountSubmitButton"]').first(),
                targetCtx.locator('[data-automation-id="createAccountSubmitButton"]').first(),
                targetCtx.locator('button[data-automation-id="createAccount"]').first(),
                targetCtx.locator('button[type="submit"]:has-text("Create Account")').first(),
                targetCtx.locator('button[type="submit"]:has-text("Register")').first(),
                targetCtx.locator('button[type="submit"]:has-text("Sign Up")').first(),
                targetCtx.locator('button:has-text("Create Account")').first(),
                targetCtx.locator('button:has-text("Create an Account")').first(),
                targetCtx.locator('button:has-text("Register")').first(),
                targetCtx.locator('button:has-text("Sign Up")').first(),
                targetCtx.locator('button[type="submit"]').first(),
              ];
              for (const loc of createSubmitSelectors) {
                if ((await loc.count().catch(() => 0)) > 0 && (await loc.isVisible().catch(() => false))) {
                  submitBtn = loc;
                  break;
                }
              }
            } else {
              const signInSubmitSelectors = [
                targetCtx.locator('button[data-automation-id="signInSubmitButton"]').first(),
                targetCtx.locator('[data-automation-id="signInSubmitButton"]').first(),
                targetCtx.locator('button[data-automation-id="signInButton"]').first(),
                targetCtx.locator('button[type="submit"]:has-text("Sign In")').first(),
                targetCtx.locator('button[type="submit"]:has-text("Log In")').first(),
                targetCtx.locator('button:has-text("Sign In")').first(),
                targetCtx.locator('button:has-text("Log In")').first(),
                targetCtx.locator('button[type="submit"]').first(),
              ];
              for (const loc of signInSubmitSelectors) {
                if ((await loc.count().catch(() => 0)) > 0 && (await loc.isVisible().catch(() => false))) {
                  submitBtn = loc;
                  break;
                }
              }
            }

            if (submitBtn) {
              await submitBtn.scrollIntoViewIfNeeded().catch(() => {});
              await submitBtn.click({ force: true }).catch(() => {});

              // Wait up to 15 seconds for modal disappearance, page navigation, or wizard readiness
              for (let i = 0; i < 15; i++) {
                await page.waitForTimeout(1000);

                // Check if application wizard or next step elements are already visible
                const isWizardReady = (await page.locator(
                  '[data-automation-id="bottom-navigation-next-button"]:visible, [data-automation-id="legalNameSection_firstName"]:visible, [data-automation-id="myInformationPage"]:visible, [data-automation-id="applyOptionAutofill"]:visible, [data-automation-id="file-upload-input-ref"]:visible, button:has-text("Autofill with Resume"):visible, button:has-text("Apply Manually"):visible, button:has-text("Save and Continue"):visible'
                ).count().catch(() => 0)) > 0;

                const isPasswordStillVisible = (await page.locator('input[type="password"]:visible').count().catch(() => 0)) > 0;

                if (isWizardReady || !isPasswordStillVisible) {
                  // Check if page transitioned to an email verification prompt
                  const pageText = await page.innerText('body').catch(() => '');
                  const isEmailVerifyGate = /verify your email|verification email sent|check your inbox|activation link|enter the code|security code/i.test(pageText);
                  if (isEmailVerifyGate) {
                    throw new InterventionError(
                      InterventionReason.LOGIN_REQUIRED,
                      'A verification link or OTP code was sent to your email. Please click the link or paste the code in the drawer to resume.',
                      currentUrl || fallbackUrl
                    );
                  }
                  return; // Auth gate cleared!
                }
              }

              // Check for explicit error message from portal (avoid false positives on logos / JSON-LD / password requirements text)
              const errorEl = targetCtx.locator('[data-automation-id*="error" i], .error-msg, .error-message, [aria-invalid="true"]').first();
              let errorDetails = '';
              if (await errorEl.count() > 0 && (await errorEl.isVisible().catch(() => false))) {
                const text = await errorEl.textContent().catch(() => '');
                if (text && text.trim().length > 0) {
                  const cleanText = text.trim().slice(0, 150);
                  // Ensure it's not structured JSON or logo data
                  if (!cleanText.includes('{') && !cleanText.toLowerCase().includes('logo')) {
                    if (/already exists/i.test(cleanText)) {
                      errorDetails = `An account with this email already exists on ${platformDisplayName}. Please select "Yes, Sign In" to enter your existing password.`;
                    } else if (/invalid|incorrect/i.test(cleanText)) {
                      errorDetails = `Invalid email or password reported by ${platformDisplayName}. Please check your credentials.`;
                    } else if (/error|required|failed|must contain/i.test(cleanText)) {
                      errorDetails = `Portal message: "${cleanText}"`;
                    }
                  }
                }
              }

              throw new InterventionError(
                InterventionReason.LOGIN_REQUIRED,
                errorDetails || `Attempted ${authMode === 'create_account' ? 'account creation' : 'sign in'}, but the account gate on ${platformDisplayName} is still active. Please verify your credentials or complete manually.`,
                currentUrl || fallbackUrl
              );
            }
          }
        } catch (authErr) {
          if (authErr instanceof InterventionError) throw authErr;
          console.warn('[checkAccountGate] Automated entry attempt error:', authErr);
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

  protected async dismissCookieBannerIfPresent(
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
        'access is temporarily restricted',
        'we detected unusual activity',
        'automated (bot) activity',
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

      // ─── 2. Check Form Field Validation Errors First ───────────────────────
      const formValidationSelectors = [
        '.invalid-field',
        '[aria-invalid="true"]',
        '.field_with_errors',
        'p.error',
        'span.error',
        '.error-message',
        '.application--error',
        '.form-error',
      ];
      for (const errSel of formValidationSelectors) {
        const errEl = (ctx !== page ? ctx.locator(errSel).first() : page.locator(errSel).first());
        if (await errEl.isVisible().catch(() => false)) {
          const errText = ((await errEl.textContent().catch(() => '')) || '').trim();
          if (errText.length > 0 && !/cookie|privacy/i.test(errText)) {
            await logger.warn('submission_validation_error', `Form field validation error detected on ${platform}: ${errText.slice(0, 100)}`);
            throw new InterventionError(
              InterventionReason.UNKNOWN_QUESTION,
              `Application requires additional input on ${platform}: "${errText.slice(0, 150)}"`,
              page.url()
            );
          }
        }
      }

      if (
        combinedText.includes('this field is required') ||
        combinedText.includes('please fill out this field') ||
        combinedText.includes('select a country')
      ) {
        await logger.warn('submission_validation_error', `Required field validation error on ${platform}`);
        throw new InterventionError(
          InterventionReason.UNKNOWN_QUESTION,
          `Application form on ${platform} has required fields that need your input.`,
          page.url()
        );
      }

      // ─── 3. Check Security Challenges / CAPTCHA (Active Interactive Challenges Only) ───
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

      // Note: We deliberately exclude passive Google reCAPTCHA v3 badge anchors (e.g. iframe[src*="recaptcha/api2/anchor"] or .grecaptcha-badge)
      // which are present harmlessly on all Greenhouse / ATS pages. We only match active challenge puzzles or interactive frames.
      const hasActiveChallengeElement = (await page.locator(
        'iframe[title*="recaptcha challenge" i]:visible, iframe[src*="recaptcha/api2/bframe"]:visible, iframe[src*="recaptcha/enterprise/bframe"]:visible, iframe[src*="hcaptcha.com"][src*="frame=challenge"]:visible, iframe[src*="challenges.cloudflare.com"]:not([hidden]):visible, .cf-turnstile:visible'
      ).count().catch(() => 0)) > 0;

      if (hasChallengePhrase || hasActiveChallengeElement) {
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
