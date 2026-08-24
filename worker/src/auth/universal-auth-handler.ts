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
      const el = page.locator(sel).first();
      if ((await el.count().catch(() => 0)) > 0 && (await el.isVisible().catch(() => false))) {
        emailInput = el;
        break;
      }
    }

    if (emailInput) {
      for (const sel of passwordSelectors) {
        const els = page.locator(sel);
        if ((await els.count().catch(() => 0)) > 0 && (await els.first().isVisible().catch(() => false))) {
          passwordInputs = els;
          break;
        }
      }
    }

    // Search child frames if not found on main frame
    if (!emailInput || !passwordInputs) {
      for (const frame of page.frames()) {
        if (frame === page.mainFrame()) continue;
        for (const sel of emailSelectors) {
          const el = frame.locator(sel).first();
          if ((await el.count().catch(() => 0)) > 0 && (await el.isVisible().catch(() => false))) {
            emailInput = el;
            targetContext = frame;
            break;
          }
        }
        if (emailInput) {
          for (const sel of passwordSelectors) {
            const els = frame.locator(sel);
            if ((await els.count().catch(() => 0)) > 0 && (await els.first().isVisible().catch(() => false))) {
              passwordInputs = els;
              break;
            }
          }
          if (passwordInputs) break;
        }
      }
    }

    // Check for "Apply as Guest" option if present
    const guestBtn = targetContext.locator('button, a, [role="button"]').filter({
      hasText: /apply as guest|continue as guest|apply without account|quick apply/i,
    }).first();

    if ((await guestBtn.count().catch(() => 0)) > 0 && (await guestBtn.isVisible().catch(() => false))) {
      await logger.info('auth_guest_option', 'Found "Apply as Guest" option — selecting guest flow');
      await guestBtn.click().catch(() => {});
      await page.waitForTimeout(2000);
      return { handled: true, action: 'guest_continued' };
    }

    // If no email/password inputs and not an explicit auth URL, not an auth gate
    if (!emailInput || !passwordInputs) {
      if (!isAuthUrl) return { handled: false, action: 'none' };

      // Look for "Sign In" or "Create Account" launch buttons
      const launchBtn = targetContext.locator('button, a, [role="button"]').filter({
        hasText: /sign in to apply|create account to apply|apply manually|autofill with resume/i,
      }).first();

      if ((await launchBtn.count().catch(() => 0)) > 0 && (await launchBtn.isVisible().catch(() => false))) {
        await launchBtn.click().catch(() => {});
        await page.waitForTimeout(2000);
        return this.handleAuthGateIfNeeded(browser, context, logger, apiClient);
      }

      return { handled: false, action: 'none' };
    }

    // Determine target mode (sign_in vs create_account)
    const profile = context.userProfile;
    const authMode = profile.accountAuthMode || 'create_account';
    const emailToUse = profile.accountEmail || profile.email;
    const passwordToUse = profile.accountPassword || 'TempPass2026!@#';

    await logger.info('auth_gate_detected', `Candidate auth gate detected. Mode: ${authMode}, Email: ${emailToUse}`);

    // Switch tabs if necessary (Sign In vs Create Account)
    if (authMode === 'create_account') {
      const createAccountTab = targetContext.locator('button, a, [role="tab"]').filter({
        hasText: /create account|sign up|register|new user|don't have an account/i,
      }).first();

      if ((await createAccountTab.count().catch(() => 0)) > 0 && (await createAccountTab.isVisible().catch(() => false))) {
        await createAccountTab.click().catch(() => {});
        await page.waitForTimeout(1500);
      }
    } else {
      const signInTab = targetContext.locator('button, a, [role="tab"]').filter({
        hasText: /sign in|log in|already have an account/i,
      }).first();

      if ((await signInTab.count().catch(() => 0)) > 0 && (await signInTab.isVisible().catch(() => false))) {
        await signInTab.click().catch(() => {});
        await page.waitForTimeout(1500);
      }
    }

    // Fill Email
    if (emailInput && emailToUse) {
      await emailInput.fill(emailToUse);
      await logger.info('auth_email_entered', `Filled candidate email`);
    }

    // Fill Password(s)
    const passCount = await passwordInputs.count();
    for (let i = 0; i < passCount; i++) {
      const passField = passwordInputs.nth(i);
      if (await passField.isVisible().catch(() => false)) {
        await passField.fill(passwordToUse);
      }
    }
    await logger.info('auth_password_entered', `Filled candidate password field(s)`);

    // Handle required consent/terms checkboxes if creating account
    const consentCheckboxes = targetContext.locator('input[type="checkbox"], [role="checkbox"]');
    const cbCount = await consentCheckboxes.count().catch(() => 0);
    for (let i = 0; i < cbCount; i++) {
      const cb = consentCheckboxes.nth(i);
      const isChecked = await cb.isChecked().catch(() => false);
      if (!isChecked && (await cb.isVisible().catch(() => false))) {
        await cb.check().catch(async () => {
          await cb.click({ force: true }).catch(() => {});
        });
      }
    }

    // Submit Auth Form
    const submitAuthBtn = targetContext.locator('button[type="submit"], input[type="submit"], button, a').filter({
      hasText: authMode === 'create_account' ? /create account|sign up|register|continue/i : /sign in|log in|continue/i,
    }).first();

    if ((await submitAuthBtn.count().catch(() => 0)) > 0) {
      await submitAuthBtn.click().catch(() => {});
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
