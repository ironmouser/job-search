/**
 * worker/src/auth/universal-auth-handler.ts
 *
 * UniversalAuthHandler — standardized autonomous authentication & account creation engine.
 * Supports Workday, Taleo, iCIMS, SuccessFactors, and custom career portals.
 */

import { Page, Frame, Locator } from 'playwright';
import { BrowserSession } from '../browser-session';
import { ExecutionLogger } from '../execution-logger';
import { InterventionReason, WorkflowContext } from '../types';
import { InterventionError } from '../plugins/base-plugin';
import { RailwayAPIClient } from '../api-client';
import { EmailInterceptor } from '../email/email-interceptor';
import { replaceValue, replaceValueHumanized, waitForSensorSettling } from '../utils/form-commit';

export interface AuthHandlingResult {
  handled: boolean;
  action: 'signed_in' | 'account_created' | 'guest_continued' | 'none';
  requiresEmailVerification?: boolean;
}

export class UniversalAuthHandler {
  /**
   * Evaluates if the current view is an auth gate, and executes automated login / account creation.
   */
  static async handleAuthGateIfNeeded(
    browser: BrowserSession,
    context: WorkflowContext,
    logger: ExecutionLogger,
    apiClient?: RailwayAPIClient
  ): Promise<AuthHandlingResult> {
    const page = browser.page;
    const currentUrl = page.url() || '';

    // Check if page contains clear auth gate signatures
    const isAuthUrl = /login|signin|sign-in|create-account|register|candidate-experience|auth/i.test(currentUrl);

    // Look for login / registration forms across main frame and nested frames
    let targetContext: Page | Frame = page;
    let emailInput: Locator | null = null;
    let passwordInputs: Locator | null = null;

    const emailSelectors = [
      'input[type="email"]',
      'input[name*="email" i]',
      'input[id*="email" i]',
      '[data-automation-id*="email" i]',
      '[data-automation-id="username"]',
      'input[name*="username" i]',
      'input[name*="user" i]',
    ];

    const passwordSelectors = [
      'input[type="password"]',
      '[data-automation-id*="password" i]',
      'input[name*="password" i]',
    ];

    // Search main page first
    for (const sel of emailSelectors) {
      const loc = page.locator(sel).first();
      if ((await loc.count().catch(() => 0)) > 0 && (await loc.isVisible().catch(() => false))) {
        emailInput = loc;
        break;
      }
    }

    for (const sel of passwordSelectors) {
      const loc = page.locator(sel).first();
      if ((await loc.count().catch(() => 0)) > 0 && (await loc.isVisible().catch(() => false))) {
        passwordInputs = loc;
        break;
      }
    }

    // Search iframes if not found in main page
    if (!emailInput && !passwordInputs) {
      for (const frame of page.frames()) {
        if (frame === page.mainFrame()) continue;
        for (const sel of emailSelectors) {
          const loc = frame.locator(sel).first();
          if ((await loc.count().catch(() => 0)) > 0 && (await loc.isVisible().catch(() => false))) {
            emailInput = loc;
            targetContext = frame;
            break;
          }
        }
        if (emailInput) {
          for (const sel of passwordSelectors) {
            const loc = frame.locator(sel).first();
            if ((await loc.count().catch(() => 0)) > 0 && (await loc.isVisible().catch(() => false))) {
              passwordInputs = loc;
              break;
            }
          }
          break;
        }
      }
    }

    const hasAuthElements = Boolean(emailInput || passwordInputs);
    if (!isAuthUrl && !hasAuthElements) {
      return { handled: false, action: 'none' };
    }

    const profile = context.userProfile;
    const emailToUse = profile.accountEmail || profile.email;
    const passwordToUse = profile.accountPassword;
    const authMode = profile.accountAuthMode || 'sign_in';

    // If credentials are NOT provided in profile, trigger structured intervention
    if (!passwordToUse || !emailToUse) {
      await logger.warn('auth_gate_credentials_missing', `Candidate account credentials needed (${authMode})`);
      throw new InterventionError(
        InterventionReason.JOB_BOARD_AUTH_REQUIRED,
        'This application requires candidate account authentication. Please connect your credentials or sign in via the live browser stream.',
        currentUrl
      );
    }

    await logger.info('auth_gate_detected', `Candidate auth gate detected. Mode: ${authMode}, Email: ${emailToUse}`);

    // Switch tabs if necessary (Sign In vs Create Account) — strictly target switch links, avoiding submit buttons
    if (authMode === 'create_account') {
      const hasVerifyPass = (await targetContext.locator('input[data-automation-id="verifyPassword"], input[data-automation-id="confirmPassword"], input[name*="verify" i], input[name*="confirm" i]').count().catch(() => 0)) > 0;
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
          const tabEl = targetContext.locator(sel).first();
          if ((await tabEl.count().catch(() => 0)) > 0 && (await tabEl.isVisible().catch(() => false))) {
            await tabEl.scrollIntoViewIfNeeded().catch(() => {});
            await tabEl.click({ force: true }).catch(() => {});
            await page.waitForTimeout(1500);
            break;
          }
        }
      }
    } else {
      const hasVerifyPass = (await targetContext.locator('input[data-automation-id="verifyPassword"], input[data-automation-id="confirmPassword"], input[name*="verify" i], input[name*="confirm" i]').count().catch(() => 0)) > 0;
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
          const tabEl = targetContext.locator(sel).first();
          if ((await tabEl.count().catch(() => 0)) > 0 && (await tabEl.isVisible().catch(() => false))) {
            await tabEl.scrollIntoViewIfNeeded().catch(() => {});
            await tabEl.click({ force: true }).catch(() => {});
            await page.waitForTimeout(1500);
            break;
          }
        }
      }
    }

    // Helper to fill input using humanized typing and commit React/SPA state events
    const fillAndCommit = async (loc: Locator, val: string) => {
      await loc.scrollIntoViewIfNeeded().catch(() => {});
      await loc.click({ force: true }).catch(() => {});
      try {
        await replaceValueHumanized(loc, val);
      } catch {
        await replaceValue(loc, val).catch(() => {});
      }
      await loc.dispatchEvent('blur').catch(() => {});
    };

    // Re-locate email & password inputs
    const freshEmail = targetContext.locator('input[data-automation-id="email"], input[data-automation-id="userName"], input[data-automation-id="username"], input[type="email"], input[name*="email" i], input[id*="email" i], input[name*="user" i]').first();
    let freshPass = targetContext.locator('input[data-automation-id="password"], input[type="password"], input[name*="password" i]').first();

    if ((await freshEmail.count().catch(() => 0)) > 0 && emailToUse) {
      await fillAndCommit(freshEmail, emailToUse);
      await logger.info('auth_email_entered', `Filled candidate email`);
      await waitForSensorSettling(page, 800);

      // If password field is not yet present, check for continue/next button in split-step form
      if ((await freshPass.count().catch(() => 0)) === 0) {
        const continueBtn = targetContext.locator('button:has-text("Continue with email"), button:has-text("Continue with Email"), button:has-text("Continue"), button:has-text("Next"), button[type="submit"]').first();
        if ((await continueBtn.count().catch(() => 0)) > 0 && (await continueBtn.isVisible().catch(() => false))) {
          await continueBtn.click({ force: true }).catch(() => {});
          await page.waitForTimeout(1500);
        }
      }
    }

    // Re-evaluate password input after possible step transition
    freshPass = targetContext.locator('input[data-automation-id="password"], input[type="password"], input[name*="password" i]').first();

    if ((await freshPass.count().catch(() => 0)) > 0 && passwordToUse) {
      await fillAndCommit(freshPass, passwordToUse);
      await logger.info('auth_password_entered', `Filled candidate password field`);
    }

    // Handle verify password and consent checkboxes if creating account
    if (authMode === 'create_account') {
      const verifyInput = targetContext.locator('input[data-automation-id="verifyPassword"], input[data-automation-id="confirmPassword"], input[name*="verify" i], input[name*="confirm" i]').first();
      if ((await verifyInput.count().catch(() => 0)) > 0 && (await verifyInput.isVisible().catch(() => false))) {
        await fillAndCommit(verifyInput, passwordToUse);
      }

      const consentCheckboxes = targetContext.locator('input[data-automation-id="createAccountCheckbox"], div[data-automation-id="createAccountCheckbox"] input, input[type="checkbox"], [role="checkbox"]');
      const cbCount = await consentCheckboxes.count().catch(() => 0);
      for (let i = 0; i < cbCount; i++) {
        const cb = consentCheckboxes.nth(i);
        const isChecked = await cb.isChecked().catch(() => false);
        if (!isChecked && (await cb.isVisible().catch(() => false))) {
          await cb.check({ force: true }).catch(async () => {
            await cb.click({ force: true }).catch(() => {});
          });
          break;
        }
      }
    }

    // Submit Auth Form
    let submitAuthBtn: Locator | null = null;
    if (authMode === 'create_account') {
      const createSubmitLocators = [
        targetContext.locator('button[data-automation-id="createAccountSubmitButton"]').first(),
        targetContext.locator('[data-automation-id="createAccountSubmitButton"]').first(),
        targetContext.locator('button[data-automation-id="createAccount"]').first(),
        targetContext.locator('button[type="submit"]:has-text("Create Account")').first(),
        targetContext.locator('button[type="submit"]:has-text("Register")').first(),
        targetContext.locator('button[type="submit"]:has-text("Sign Up")').first(),
        targetContext.locator('button:has-text("Create Account")').first(),
        targetContext.locator('button:has-text("Register")').first(),
        targetContext.locator('button:has-text("Sign Up")').first(),
        targetContext.locator('button[type="submit"]').first(),
      ];
      for (const loc of createSubmitLocators) {
        if ((await loc.count().catch(() => 0)) > 0 && (await loc.isVisible().catch(() => false))) {
          submitAuthBtn = loc;
          break;
        }
      }
    } else {
      const signInSubmitLocators = [
        targetContext.locator('button[data-automation-id="signInSubmitButton"]').first(),
        targetContext.locator('[data-automation-id="signInSubmitButton"]').first(),
        targetContext.locator('button[data-automation-id="signInButton"]').first(),
        targetContext.locator('button[type="submit"]:has-text("Sign In")').first(),
        targetContext.locator('button[type="submit"]:has-text("Log In")').first(),
        targetContext.locator('button:has-text("Sign In")').first(),
        targetContext.locator('button:has-text("Log In")').first(),
        targetContext.locator('button[type="submit"]').first(),
      ];
      for (const loc of signInSubmitLocators) {
        if ((await loc.count().catch(() => 0)) > 0 && (await loc.isVisible().catch(() => false))) {
          submitAuthBtn = loc;
          break;
        }
      }
    }

    if (submitAuthBtn) {
      await submitAuthBtn.scrollIntoViewIfNeeded().catch(() => {});
      await submitAuthBtn.click({ force: true }).catch(() => {});
      await logger.info('auth_submitted', `Submitted ${authMode} credentials`);
      await page.waitForTimeout(3000);
    }

    // Check for Email Verification requirement
    const pageText = await page.innerText('body').catch(() => '');
    const isEmailVerifyGate = /verify your email|verification email sent|check your inbox|activation link|enter the code/i.test(pageText);

    if (isEmailVerifyGate && apiClient && context.sessionId) {
      await logger.info('auth_email_verification_detected', 'Verification email gate detected — initiating automated interception');

      const resolved = await EmailInterceptor.resolveVerificationGate(
        browser,
        apiClient,
        context.sessionId,
        logger,
        60000 // 60s
      );

      if (resolved.success) {
        await logger.info('auth_email_verification_success', `Email verification resolved via ${resolved.type}`);
        return { handled: true, action: authMode === 'create_account' ? 'account_created' : 'signed_in' };
      }

      // If automated interception times out, trigger structured intervention
      throw new InterventionError(
        InterventionReason.LOGIN_REQUIRED,
        'A verification link or OTP was sent to your email. Please click the link or enter the OTP in the drawer to resume.',
        currentUrl
      );
    }

    return {
      handled: true,
      action: authMode === 'create_account' ? 'account_created' : 'signed_in',
    };
  }
}
