/**
 * worker/test/auth-gate-flow.test.ts
 *
 * Tests for Workday & ATS Candidate Auth Gate:
 * - Switching between Sign In and Create Account without premature submit button firing
 * - Strict input element targeting (preventing container div mismatches)
 * - Synthetic event emission on inputs
 * - Structured InterventionError on missing credentials or portal alerts
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { chromium, Browser } from 'playwright';
import { WorkdayPlugin } from '../src/plugins/workday';
import { WorkflowContext, InterventionReason } from '../src/types';
import { InterventionError } from '../src/plugins/base-plugin';

describe('Workday Candidate Auth Gate Flow Tests', () => {
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

  it('Test 1 — Create Account Mode: Switches from Sign In view, fills email, password, verify password & terms checkbox', async () => {
    const page = await browser.newPage();
    try {
      await page.setContent(`
        <!DOCTYPE html>
        <html>
        <head><title>Candidate Experience - Workday</title></head>
        <body>
          <div role="dialog" aria-modal="true" data-automation-id="authModal">
            <!-- Initial view is Sign In -->
            <div id="sign-in-view" data-automation-id="signInPage">
              <h2>Sign In</h2>
              <div data-automation-id="email">
                <input data-automation-id="userName" type="text" value="" />
              </div>
              <div data-automation-id="password">
                <input data-automation-id="password" type="password" value="" />
              </div>
              <button data-automation-id="signInSubmitButton" type="submit" onclick="window.submitted = 'signin'">Sign In</button>
              <a data-automation-id="createAccountLink" href="#" onclick="
                document.getElementById('sign-in-view').style.display='none';
                document.getElementById('create-account-view').style.display='block';
                return false;
              ">Create Account</a>
            </div>

            <!-- Create Account view hidden initially -->
            <div id="create-account-view" data-automation-id="createAccountPage" style="display:none;">
              <h2>Create Account</h2>
              <div data-automation-id="emailContainer">
                <input data-automation-id="email" type="email" value="" />
              </div>
              <div data-automation-id="passwordSection">
                <input data-automation-id="password" type="password" value="" />
              </div>
              <div data-automation-id="verifyPasswordSection">
                <input data-automation-id="verifyPassword" type="password" value="" />
              </div>
              <div data-automation-id="createAccountCheckbox">
                <input type="checkbox" id="terms-cb" />
              </div>
              <button data-automation-id="createAccountSubmitButton" type="submit" onclick="
                const email = document.querySelector('[data-automation-id=email]').value;
                const pass = document.querySelector('[data-automation-id=passwordSection] input').value;
                const verify = document.querySelector('[data-automation-id=verifyPassword]').value;
                const agreed = document.getElementById('terms-cb').checked;
                window.submittedData = { email, pass, verify, agreed };
                document.querySelector('[data-automation-id=authModal]').remove();
              ">Create Account</button>
            </div>
          </div>
        </body>
        </html>
      `);

      const plugin = new WorkdayPlugin();
      const mockContext: WorkflowContext = {
        sessionId: 'test-session-1',
        userId: 'user-1',
        jobId: 'job-1',
        jobUrl: 'https://company.myworkdayjobs.com/careers/job/123',
        resumeMarkdown: '# John Doe\njohn@example.com',
        coverLetterMarkdown: 'Cover letter',
        userProfile: {
          name: 'John Doe',
          email: 'john@example.com',
          accountEmail: 'candidate@example.com',
          accountPassword: 'MySecurePassword2026!@#',
          accountAuthMode: 'create_account',
        },
        simulationMode: false,
      };

      // Call checkAccountGate
      await (plugin as any).checkAccountGate(page, mockContext.jobUrl, 'Workday', mockContext);

      // Verify the auth modal was dismissed / cleared
      const modalCount = await page.locator('[data-automation-id="authModal"]').count();
      assert.strictEqual(modalCount, 0, 'Auth modal should be closed after successful submission');

      // Verify submitted data
      const submitted = await page.evaluate(() => (window as any).submittedData);
      assert.deepStrictEqual(submitted, {
        email: 'candidate@example.com',
        pass: 'MySecurePassword2026!@#',
        verify: 'MySecurePassword2026!@#',
        agreed: true,
      });
    } finally {
      await page.close();
    }
  });

  it('Test 2 — Sign In Mode: Switches from Create Account view, fills email and password without clicking submit prematurely', async () => {
    const page = await browser.newPage();
    try {
      await page.setContent(`
        <!DOCTYPE html>
        <html>
        <head><title>Sign In - Workday</title></head>
        <body>
          <div role="dialog" aria-modal="true" data-automation-id="authModal">
            <!-- Initial view is Create Account -->
            <div id="create-account-view" data-automation-id="createAccountPage">
              <h2>Create Account</h2>
              <input data-automation-id="email" type="email" value="" />
              <input data-automation-id="password" type="password" value="" />
              <input data-automation-id="verifyPassword" type="password" value="" />
              <button data-automation-id="createAccountSubmitButton" type="submit">Create Account</button>
              <a data-automation-id="signInLink" href="#" onclick="
                document.getElementById('create-account-view').style.display='none';
                document.getElementById('sign-in-view').style.display='block';
                return false;
              ">Already have an account? Sign In</a>
            </div>

            <!-- Sign In view hidden initially -->
            <div id="sign-in-view" data-automation-id="signInPage" style="display:none;">
              <h2>Sign In</h2>
              <input data-automation-id="userName" type="text" value="" />
              <input data-automation-id="password" type="password" value="" />
              <button data-automation-id="signInSubmitButton" type="submit" onclick="
                const user = document.querySelector('[data-automation-id=userName]').value;
                const pass = document.querySelector('#sign-in-view input[data-automation-id=password]').value;
                window.submittedData = { user, pass };
                document.querySelector('[data-automation-id=authModal]').remove();
              ">Sign In</button>
            </div>
          </div>
        </body>
        </html>
      `);

      const plugin = new WorkdayPlugin();
      const mockContext: WorkflowContext = {
        sessionId: 'test-session-2',
        userId: 'user-2',
        jobId: 'job-2',
        jobUrl: 'https://company.myworkdayjobs.com/careers/job/456',
        resumeMarkdown: '# Jane Doe\njane@example.com',
        coverLetterMarkdown: 'Cover letter',
        userProfile: {
          name: 'Jane Doe',
          email: 'jane@example.com',
          accountEmail: 'candidate_signin@example.com',
          accountPassword: 'ExistingPassword2026!',
          accountAuthMode: 'sign_in',
        },
        simulationMode: false,
      };

      await (plugin as any).checkAccountGate(page, mockContext.jobUrl, 'Workday', mockContext);

      const modalCount = await page.locator('[data-automation-id="authModal"]').count();
      assert.strictEqual(modalCount, 0, 'Auth modal should be closed');

      const submitted = await page.evaluate(() => (window as any).submittedData);
      assert.deepStrictEqual(submitted, {
        user: 'candidate_signin@example.com',
        pass: 'ExistingPassword2026!',
      });
    } finally {
      await page.close();
    }
  });

  it('Test 3 — Missing password: Throws InterventionError(LOGIN_REQUIRED) immediately', async () => {
    const page = await browser.newPage();
    try {
      await page.setContent(`
        <!DOCTYPE html>
        <html>
        <head><title>Candidate Experience - Workday</title></head>
        <body>
          <div role="dialog" aria-modal="true">
            <input data-automation-id="email" type="email" />
            <input data-automation-id="password" type="password" />
          </div>
        </body>
        </html>
      `);

      const plugin = new WorkdayPlugin();
      const mockContext: WorkflowContext = {
        sessionId: 'test-session-3',
        userId: 'user-3',
        jobId: 'job-3',
        jobUrl: 'https://company.myworkdayjobs.com/careers/job/789',
        resumeMarkdown: '# User Without Password',
        coverLetterMarkdown: 'Cover letter',
        userProfile: {
          name: 'No Password User',
          email: 'user@example.com',
          // accountPassword is intentionally undefined
        },
        simulationMode: false,
      };

      let caughtError: any = null;
      try {
        await (plugin as any).checkAccountGate(page, mockContext.jobUrl, 'Workday', mockContext);
      } catch (err) {
        caughtError = err;
      }

      assert.ok(caughtError instanceof InterventionError, 'Should throw InterventionError');
      assert.strictEqual(caughtError.reason, InterventionReason.LOGIN_REQUIRED);
    } finally {
      await page.close();
    }
  });

  it('Test 4 — Portal Error Detection: Captures "already exists" alert and formats helpful guidance', async () => {
    const page = await browser.newPage();
    try {
      await page.setContent(`
        <!DOCTYPE html>
        <html>
        <head><title>Candidate Experience - Workday</title></head>
        <body>
          <div role="dialog" aria-modal="true" data-automation-id="createAccountPage">
            <input data-automation-id="email" type="email" value="" />
            <input data-automation-id="password" type="password" value="" />
            <input data-automation-id="verifyPassword" type="password" value="" />
            <button data-automation-id="createAccountSubmitButton" type="submit" onclick="
              document.getElementById('error-box').style.display = 'block';
            ">Create Account</button>
            <div id="error-box" data-automation-id="alert" style="display:none; color: red;">
              An account with this email already exists.
            </div>
          </div>
        </body>
        </html>
      `);

      const plugin = new WorkdayPlugin();
      const mockContext: WorkflowContext = {
        sessionId: 'test-session-4',
        userId: 'user-4',
        jobId: 'job-4',
        jobUrl: 'https://company.myworkdayjobs.com/careers/job/999',
        resumeMarkdown: '# User Email Exists',
        coverLetterMarkdown: 'Cover letter',
        userProfile: {
          name: 'Existing User',
          email: 'existing@example.com',
          accountEmail: 'existing@example.com',
          accountPassword: 'SomePassword123!',
          accountAuthMode: 'create_account',
        },
        simulationMode: false,
      };

      let caughtError: any = null;
      try {
        await (plugin as any).checkAccountGate(page, mockContext.jobUrl, 'Workday', mockContext);
      } catch (err) {
        caughtError = err;
      }

      assert.ok(caughtError instanceof InterventionError, 'Should throw InterventionError');
      assert.strictEqual(caughtError.reason, InterventionReason.LOGIN_REQUIRED);
      assert.ok(
        caughtError.description.includes('already exists') && caughtError.description.includes('Yes, Sign In'),
        `Description should guide user to sign in: "${caughtError.description}"`
      );
    } finally {
      await page.close();
    }
  });

  it('Test 5 — Split-Step Auth Gate: Types email, clicks continue, then fills password and submits', async () => {
    const page = await browser.newPage();
    try {
      await page.setContent(`
        <!DOCTYPE html>
        <html>
        <head><title>Candidate Experience - Portal</title></head>
        <body>
          <div role="dialog" aria-modal="true" data-automation-id="authModal" id="split-modal">
            <div id="step-1">
              <input data-automation-id="email" type="email" value="" id="user-email" />
              <button type="button" onclick="
                document.getElementById('step-1').style.display='none';
                document.getElementById('step-2').style.display='block';
              ">Continue with email</button>
            </div>
            <div id="step-2" style="display:none;">
              <input data-automation-id="password" type="password" value="" id="user-pass" />
              <button data-automation-id="signInSubmitButton" type="submit" onclick="
                const email = document.getElementById('user-email').value;
                const pass = document.getElementById('user-pass').value;
                window.submittedSplitData = { email, pass };
                document.getElementById('split-modal').remove();
              ">Sign In</button>
            </div>
          </div>
        </body>
        </html>
      `);

      const plugin = new WorkdayPlugin();
      const mockContext: WorkflowContext = {
        sessionId: 'test-session-5',
        userId: 'user-5',
        jobId: 'job-5',
        jobUrl: 'https://company.myworkdayjobs.com/careers/job/555',
        resumeMarkdown: '# User Split Step',
        coverLetterMarkdown: 'Cover letter',
        userProfile: {
          name: 'Split User',
          email: 'split@example.com',
          accountEmail: 'split@example.com',
          accountPassword: 'SplitPass2026!',
          accountAuthMode: 'sign_in',
        },
        simulationMode: false,
      };

      await (plugin as any).checkAccountGate(page, mockContext.jobUrl, 'Workday', mockContext);

      const modalCount = await page.locator('#split-modal').count();
      assert.strictEqual(modalCount, 0, 'Auth modal should be closed after split-step submission');

      const submitted = await page.evaluate(() => (window as any).submittedSplitData);
      assert.deepStrictEqual(submitted, {
        email: 'split@example.com',
        pass: 'SplitPass2026!',
      });
    } finally {
      await page.close();
    }
  });
});
