/**
 * worker/src/email/email-interceptor.ts
 *
 * Awaits and resolves email verification links, activation URLs,
 * and OTP codes intercepted from ATS portals during account creation or login.
 */

import { Page } from 'playwright';
import { BrowserSession } from '../browser-session';
import { RailwayAPIClient } from '../api-client';
import { ExecutionLogger } from '../execution-logger';
import { replaceValue } from '../utils/form-commit';

export interface EmailVerificationResult {
  success: boolean;
  type?: 'link_navigated' | 'otp_entered' | 'manual_resolved';
  verificationUrl?: string;
  otpCode?: string;
  error?: string;
}

export class EmailInterceptor {
  private static readonly POLL_INTERVAL_MS = 3000;
  private static readonly DEFAULT_TIMEOUT_MS = 75000; // 75 seconds

  /**
   * Polls Railway API for an incoming verification link or OTP code for this session.
   */
  static async awaitVerificationToken(
    apiClient: RailwayAPIClient,
    sessionId: string,
    logger: ExecutionLogger,
    timeoutMs: number = this.DEFAULT_TIMEOUT_MS
  ): Promise<{ primaryUrl?: string | null; otp?: string | null; urls?: string[] } | null> {
    const deadline = Date.now() + timeoutMs;
    await logger.info('email_interceptor_waiting', `Awaiting automated email verification token for session ${sessionId}... (timeout: ${Math.round(timeoutMs / 1000)}s)`);

    while (Date.now() < deadline) {
      try {
        const response = await apiClient.checkEmailToken(sessionId);
        if (response.received && response.verificationData) {
          const data = response.verificationData;
          if (data.primaryUrl || data.otp) {
            await logger.info('email_interceptor_received', `Intercepted verification data: ${data.primaryUrl ? 'Activation link found' : ''} ${data.otp ? `OTP: ${data.otp}` : ''}`);
            return data;
          }
        }
      } catch (err: any) {
        await logger.debug('email_interceptor_poll_err', `Polling check failed: ${err.message}`);
      }

      await new Promise((r) => setTimeout(r, this.POLL_INTERVAL_MS));
    }

    await logger.warn('email_interceptor_timeout', 'Timed out waiting for automated email verification token');
    return null;
  }

  /**
   * Automatically attempts to resolve an email verification gate on the current page:
   * 1. If an OTP code was intercepted, finds OTP input and fills it.
   * 2. If an activation URL was intercepted, navigates to the URL or opens it to complete verification.
   */
  static async resolveVerificationGate(
    browser: BrowserSession,
    apiClient: RailwayAPIClient,
    sessionId: string,
    logger: ExecutionLogger,
    timeoutMs: number = this.DEFAULT_TIMEOUT_MS
  ): Promise<EmailVerificationResult> {
    const tokenData = await this.awaitVerificationToken(apiClient, sessionId, logger, timeoutMs);

    if (!tokenData) {
      return {
        success: false,
        error: 'Email verification token not received within timeout',
      };
    }

    const page = browser.page;

    // 1. If OTP code exists, try finding OTP input on page
    if (tokenData.otp) {
      const otpInputSelectors = [
        'input[autocomplete="one-time-code"]',
        'input[name*="otp" i]',
        'input[name*="code" i]',
        'input[id*="otp" i]',
        'input[id*="code" i]',
        'input[placeholder*="code" i]',
        'input[placeholder*="verification" i]',
        'input[data-automation-id*="code" i]',
        'input[type="tel"][maxlength="6"]',
        'input[type="text"][maxlength="6"]',
      ];

      for (const sel of otpInputSelectors) {
        const input = page.locator(sel).first();
        if ((await input.count().catch(() => 0)) > 0 && (await input.isVisible().catch(() => false))) {
          await replaceValue(input, tokenData.otp).catch(() => {});
          await logger.info('otp_filled', `Filled OTP verification code into ${sel}`);

          // Look for submit / verify button
          const verifyBtn = page.locator('button, input[type="submit"]').filter({ hasText: /verify|submit|continue|confirm|next/i }).first();
          if ((await verifyBtn.count().catch(() => 0)) > 0) {
            await verifyBtn.click().catch(() => {});
            await page.waitForTimeout(2500);
          }

          return {
            success: true,
            type: 'otp_entered',
            otpCode: tokenData.otp,
          };
        }
      }
    }

    // 2. If activation link exists, navigate to it
    if (tokenData.primaryUrl) {
      await logger.info('activation_link_navigating', `Navigating to intercepted activation URL: ${tokenData.primaryUrl}`);
      await browser.navigate(tokenData.primaryUrl);
      await page.waitForTimeout(3000);

      return {
        success: true,
        type: 'link_navigated',
        verificationUrl: tokenData.primaryUrl,
      };
    }

    return {
      success: false,
      error: 'Token data received but could not apply automatically',
    };
  }
}
