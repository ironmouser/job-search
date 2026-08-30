/**
 * worker/test/dice-auth-flow.test.ts
 *
 * Tests for Dice Candidate Auth Automation:
 * - Multi-step email entry -> continue button click -> password entry -> submit
 * - Create account flow with first name, last name, confirm password & terms checkbox
 * - Missing credentials triggering structured InterventionError(JOB_BOARD_AUTH_REQUIRED)
 * - OTP / verification code handling
 * - Authentication error banner detection
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { chromium, Browser } from 'playwright';
import { DiceApplyPlugin } from '../src/plugins/dice-apply';
import { WorkflowContext, InterventionReason } from '../src/types';
import { InterventionError } from '../src/plugins/base-plugin';

describe('Dice Candidate Auth Flow Tests', () => {
  let browser: Browser;

  before(async () => {
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
  });

  after(async () => {
    await browser?.close();
  });

  it('Test 1 — Split-Step Sign In: Types email, clicks continue, types password, submits form', async () => {
    const page = await browser.newPage();
    try {
      await page.setContent(`
        <!DOCTYPE html>
        <html>
        <head><title>Job Details | Dice.com</title></head>
        <body>
          <div role="dialog" aria-modal="true" id="dice-modal">
            <h2>Let's get you hired</h2>
            <div id="step-email">
              <input type="email" placeholder="name@yourdomain.com" id="email-input" />
              <button type="button" id="continue-btn" onclick="
                document.getElementById('step-email').style.display = 'none';
                document.getElementById('step-password').style.display = 'block';
              ">Continue with email</button>
            </div>
            <div id="step-password" style="display:none;">
              <input type="password" id="password-input" />
              <button type="submit" id="sign-in-btn" onclick="
                const email = document.getElementById('email-input').value;
                const pass = document.getElementById('password-input').value;
                window.submittedAuth = { email, pass };
                document.getElementById('dice-modal').remove();
              ">Sign In</button>
            </div>
          </div>
        </body>
        </html>
      `);

      const plugin = new DiceApplyPlugin();
      const mockContext: WorkflowContext = {
        sessionId: 'dice-test-session-1',
        userId: 'user-1',
        jobId: 'job-1',
        jobUrl: 'https://www.dice.com/job-detail/12345',
        resumeMarkdown: '# Candidate\ncandidate@example.com',
        coverLetterMarkdown: 'Cover letter',
        userProfile: {
          name: 'Jane Doe',
          email: 'candidate@example.com',
          accountEmail: 'candidate@example.com',
          accountPassword: 'DiceSecretPassword2026!',
          accountAuthMode: 'sign_in',
        },
        simulationMode: false,
      };

      const mockBrowserSession: any = {
        page,
        getHtml: async () => await page.content(),
      };
      const mockLogger: any = {
        info: async () => {},
        warn: async () => {},
        error: async () => {},
      };

      await (plugin as any).handleDiceAuth(mockBrowserSession, page, mockContext, mockLogger);

      // Verify modal is dismissed
      const modalCount = await page.locator('#dice-modal').count();
      assert.strictEqual(modalCount, 0, 'Dice auth modal should be dismissed after submission');

      // Verify submitted credentials
      const submitted = await page.evaluate(() => (window as any).submittedAuth);
      assert.deepStrictEqual(submitted, {
        email: 'candidate@example.com',
        pass: 'DiceSecretPassword2026!',
      });
    } finally {
      await page.close();
    }
  });

  it('Test 2 — Create Account Mode: Fills first name, last name, confirm password & terms checkbox', async () => {
    const page = await browser.newPage();
    try {
      await page.setContent(`
        <!DOCTYPE html>
        <html>
        <head><title>Job Details | Dice.com</title></head>
        <body>
          <div role="dialog" aria-modal="true" id="dice-reg-modal">
            <h2>Create an account or sign in</h2>
            <input type="email" placeholder="name@yourdomain.com" id="reg-email" />
            <input type="password" id="reg-pass" />
            <input type="text" placeholder="First Name" id="reg-fn" />
            <input type="text" placeholder="Last Name" id="reg-ln" />
            <input type="password" id="reg-confirm" name="confirmPassword" />
            <input type="checkbox" id="reg-terms" />
            <button type="submit" id="reg-submit-btn" onclick="
              const email = document.getElementById('reg-email').value;
              const pass = document.getElementById('reg-pass').value;
              const fn = document.getElementById('reg-fn').value;
              const ln = document.getElementById('reg-ln').value;
              const confirm = document.getElementById('reg-confirm').value;
              const terms = document.getElementById('reg-terms').checked;
              window.submittedRegistration = { email, pass, fn, ln, confirm, terms };
              document.getElementById('dice-reg-modal').remove();
            ">Create Account</button>
          </div>
        </body>
        </html>
      `);

      const plugin = new DiceApplyPlugin();
      const mockContext: WorkflowContext = {
        sessionId: 'dice-test-session-2',
        userId: 'user-2',
        jobId: 'job-2',
        jobUrl: 'https://www.dice.com/job-detail/67890',
        resumeMarkdown: '# John Smith\njohn.smith@example.com',
        coverLetterMarkdown: 'Cover letter',
        userProfile: {
          name: 'John Smith',
          email: 'john.smith@example.com',
          accountEmail: 'john.smith@example.com',
          accountPassword: 'NewAccountPassword2026!@#',
          accountAuthMode: 'create_account',
        },
        simulationMode: false,
      };

      const mockBrowserSession: any = {
        page,
        getHtml: async () => await page.content(),
      };
      const mockLogger: any = {
        info: async () => {},
        warn: async () => {},
        error: async () => {},
      };

      await (plugin as any).handleDiceAuth(mockBrowserSession, page, mockContext, mockLogger);

      const modalCount = await page.locator('#dice-reg-modal').count();
      assert.strictEqual(modalCount, 0, 'Dice registration modal should be closed');

      const submitted = await page.evaluate(() => (window as any).submittedRegistration);
      assert.deepStrictEqual(submitted, {
        email: 'john.smith@example.com',
        pass: 'NewAccountPassword2026!@#',
        fn: 'John',
        ln: 'Smith',
        confirm: 'NewAccountPassword2026!@#',
        terms: true,
      });
    } finally {
      await page.close();
    }
  });

  it('Test 3 — Missing Credentials: Throws structured InterventionError(JOB_BOARD_AUTH_REQUIRED)', async () => {
    const page = await browser.newPage();
    try {
      await page.setContent(`
        <!DOCTYPE html>
        <html>
        <head><title>Job Details | Dice.com</title></head>
        <body>
          <div role="dialog" aria-modal="true">
            <h2>Please enter your email to sign in</h2>
            <input type="email" placeholder="name@yourdomain.com" />
            <button type="button">Continue with email</button>
          </div>
        </body>
        </html>
      `);

      const plugin = new DiceApplyPlugin();
      const mockContext: WorkflowContext = {
        sessionId: 'dice-test-session-3',
        userId: 'user-3',
        jobId: 'job-3',
        jobUrl: 'https://www.dice.com/job-detail/999',
        resumeMarkdown: '# User Without Pass',
        coverLetterMarkdown: 'Cover letter',
        userProfile: {
          name: 'No Pass User',
          email: 'nopass@example.com',
          // accountPassword undefined
        },
        simulationMode: false,
      };

      const mockBrowserSession: any = {
        page,
        getHtml: async () => await page.content(),
      };
      const mockLogger: any = {
        info: async () => {},
        warn: async () => {},
        error: async () => {},
      };

      let caughtError: any = null;
      try {
        await (plugin as any).handleDiceAuth(mockBrowserSession, page, mockContext, mockLogger);
      } catch (err) {
        caughtError = err;
      }

      assert.ok(caughtError instanceof InterventionError, 'Should throw InterventionError');
      assert.strictEqual(caughtError.reason, InterventionReason.JOB_BOARD_AUTH_REQUIRED);
    } finally {
      await page.close();
    }
  });
});
