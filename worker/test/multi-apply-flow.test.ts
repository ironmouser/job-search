/**
 * worker/test/multi-apply-flow.test.ts
 *
 * Unit and integration tests for multi-apply button navigation and
 * application element detection (resume upload, logins, first/last name fields).
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { chromium, Browser } from 'playwright';
import { GenericPageAnalyzer } from '../src/generic-agent/page-analyzer';
import { GenericApplicationAgent } from '../src/generic-agent/generic-application-agent';
import { PageClassification } from '../src/generic-agent/types';
import { BrowserSession } from '../src/browser-session';
import { ExecutionLogger } from '../src/execution-logger';
import { ATSPlatform, WorkflowContext, AutoApplyStatus } from '../src/types';
import { ATSPlugin } from '../src/plugins/base-plugin';

class TestPlugin extends ATSPlugin {
  readonly platform = ATSPlatform.UNKNOWN;
  readonly displayName = 'Test Multi-Apply Plugin';
  detect() { return { platform: ATSPlatform.UNKNOWN, confidence: 10, detectedFeatures: [], automationSupported: true }; }
  async prepare(browser: BrowserSession, context: WorkflowContext, logger: ExecutionLogger): Promise<void> {
    await this.ensureApplicationFormReached(browser, context, logger);
  }
  async apply() {}
  async validate() { return { valid: true, issues: [] }; }
  async finalize() {
    return {
      status: AutoApplyStatus.APPLIED,
      canComplete: true,
      platform: ATSPlatform.UNKNOWN,
      automationConfidence: 100,
      stepsCompleted: 1,
      stepsRemaining: 0,
      blockingIssue: null,
      estimatedSubmissionTime: null,
    };
  }

  public testHasElements(pageOrFrame: any) {
    return this.hasApplicationElements(pageOrFrame);
  }

  public testEnsureForm(browser: any, context: any, logger: any) {
    return this.ensureApplicationFormReached(browser, context, logger);
  }
}

describe('Multi-Apply Button Navigation & Application Element Detection Tests', () => {
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

  // ─── Test 1: Application Elements Detection ───────────────────────────────
  it('Test 1 — Accurately detects presence and absence of application elements', async () => {
    const page = await browser.newPage();
    try {
      // 1a. Empty / Overview page with no application elements
      await page.setContent(`
        <!DOCTYPE html>
        <html>
        <head><title>Job Overview</title></head>
        <body>
          <h1>Senior Software Engineer</h1>
          <p>Come join our innovative engineering team.</p>
          <div class="search-box">
            <input type="text" placeholder="Search other jobs" />
            <input type="text" placeholder="Location" />
          </div>
        </body>
        </html>
      `);

      const noElements = await GenericPageAnalyzer.hasApplicationElements(page);
      assert.strictEqual(noElements.hasElements, false);
      assert.strictEqual(noElements.hasResumeUpload, false);
      assert.strictEqual(noElements.hasLoginInput, false);
      assert.strictEqual(noElements.hasNameInput, false);

      // 1b. Page with Resume upload
      await page.setContent(`
        <!DOCTYPE html>
        <html>
        <body>
          <h2>Attach your documents</h2>
          <input type="file" name="resume_file" />
        </body>
        </html>
      `);
      const withResume = await GenericPageAnalyzer.hasApplicationElements(page);
      assert.strictEqual(withResume.hasElements, true);
      assert.strictEqual(withResume.hasResumeUpload, true);

      // 1c. Page with Candidate Login gate
      await page.setContent(`
        <!DOCTYPE html>
        <html>
        <body>
          <h2>Sign In to Apply</h2>
          <input type="email" name="user_email" />
          <input type="password" name="user_password" />
          <button type="submit">Log In</button>
        </body>
        </html>
      `);
      const withLogin = await GenericPageAnalyzer.hasApplicationElements(page);
      assert.strictEqual(withLogin.hasElements, true);
      assert.strictEqual(withLogin.hasLoginInput, true);

      // 1d. Page with First and Last Name form fields
      await page.setContent(`
        <!DOCTYPE html>
        <html>
        <body>
          <h2>Candidate Information</h2>
          <input type="text" name="firstName" placeholder="First Name" />
          <input type="text" name="lastName" placeholder="Last Name" />
          <input type="email" name="email" placeholder="Email Address" />
        </body>
        </html>
      `);
      const withName = await GenericPageAnalyzer.hasApplicationElements(page);
      assert.strictEqual(withName.hasElements, true);
      assert.strictEqual(withName.hasNameInput, true);
    } finally {
      await page.close();
    }
  });

  // ─── Test 2: Multi-Hop Apply Button Flow in Generic Agent ──────────────────
  it('Test 2 — Multi-Hop Flow: Bot clicks through multiple Apply buttons until application elements are found', async () => {
    const page = await browser.newPage();
    try {
      // Step 1: Initial job description page with "Apply for this job"
      await page.setContent(`
        <!DOCTYPE html>
        <html>
        <head><title>Job Posting - Acme Corp</title></head>
        <body>
          <h1>Staff Infrastructure Engineer</h1>
          <p>Detailed job description and requirements...</p>
          <div class="actions">
            <button id="apply-btn-1" onclick="document.body.innerHTML = document.getElementById('step-2-content').innerHTML">
              Apply for this job
            </button>
          </div>
          <template id="step-2-content">
            <div class="intermediate-gateway">
              <h2>Ready to start your application at Acme Corp?</h2>
              <p>You will now be directed to our candidate portal.</p>
              <button id="apply-btn-2" onclick="document.body.innerHTML = document.getElementById('step-3-content').innerHTML">
                Start Application
              </button>
            </div>
            <template id="step-3-content">
              <div class="application-form">
                <h2>Application Form</h2>
                <form id="acme-form">
                  <input type="text" name="first_name" placeholder="First Name" />
                  <input type="text" name="last_name" placeholder="Last Name" />
                  <input type="email" name="email" placeholder="Email" />
                  <input type="file" name="resume" />
                  <button type="submit">Submit Application</button>
                </form>
              </div>
            </template>
          </template>
        </body>
        </html>
      `);

      // Mock session & logger
      const browserSession = new BrowserSession();
      (browserSession as any)._page = page;
      const mockLogger = new ExecutionLogger('test-session-multi-apply', {
        log: async () => {},
        updateSession: async () => ({ session: {} as any }),
      } as any);

      const context: WorkflowContext = {
        sessionId: 'test-session-multi-apply',
        userId: 'user-1',
        jobId: 'job-1',
        jobUrl: 'https://example.com/jobs/staff-infra',
        resumeMarkdown: '# Test Resume',
        coverLetterMarkdown: '# Test Cover Letter',
        userProfile: {
          name: 'Jane Doe',
          email: 'jane@example.com',
          phone: '555-0199',
        } as any,
      };

      const agent = new GenericApplicationAgent();
      const result = await agent.initiateApplication(browserSession, context, mockLogger);

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.reachedForm, true);

      // Verify that we reached Step 3 (form is rendered on page)
      const formInputCount = await page.locator('input[name="first_name"], input[name="last_name"]').count();
      assert.strictEqual(formInputCount, 2);
    } finally {
      await page.close();
    }
  });

  // ─── Test 3: BasePlugin ensureApplicationFormReached ───────────────────────
  it('Test 3 — BasePlugin ensureApplicationFormReached clicks secondary Apply button when elements are absent', async () => {
    const page = await browser.newPage();
    try {
      await page.setContent(`
        <!DOCTYPE html>
        <html>
        <body>
          <h1>Company Career Gateway</h1>
          <div id="container">
            <button id="secondary-apply" onclick="document.getElementById('container').innerHTML = '<form><input name=\\'first_name\\'/><input name=\\'last_name\\'/><input type=\\'file\\'/></form>'">
              Apply on Company Site
            </button>
          </div>
        </body>
        </html>
      `);

      const browserSession = new BrowserSession();
      (browserSession as any)._page = page;
      const mockLogger = new ExecutionLogger('test-session-plugin', {
        log: async () => {},
        updateSession: async () => ({ session: {} as any }),
      } as any);

      const context: WorkflowContext = {
        sessionId: 'test-session-plugin',
        userId: 'user-1',
        jobId: 'job-1',
        jobUrl: 'https://example.com/careers/job',
        resumeMarkdown: '# Resume',
        coverLetterMarkdown: '# Cover',
        userProfile: { name: 'Alex Smith', email: 'alex@example.com' } as any,
      };

      const plugin = new TestPlugin();
      const reached = await plugin.testEnsureForm(browserSession, context, mockLogger);

      assert.strictEqual(reached, true);
      const hasInputs = await plugin.testHasElements(page);
      assert.strictEqual(hasInputs, true);
    } finally {
      await page.close();
    }
  });

  // ─── Test 4: Application Tab Clicking ──────────────────────────────────────
  it('Test 4 — Clicks Application Tab to reveal application form when initial tab only shows Job Details', async () => {
    const page = await browser.newPage();
    try {
      await page.setContent(`
        <!DOCTYPE html>
        <html>
        <head><title>Ashby Style Job Details</title></head>
        <body>
          <div class="nav-tabs" role="tablist">
            <button role="tab" id="tab-overview" class="active" aria-selected="true" onclick="showOverview()">Job Details</button>
            <button role="tab" id="tab-application" aria-selected="false" onclick="showApplication()">Application</button>
          </div>
          <div id="tab-content">
            <div id="overview-pane">
              <h1>Lead Systems Architect</h1>
              <p>Job description and requirements...</p>
            </div>
          </div>
          <script>
            function showOverview() {
              document.getElementById('tab-content').innerHTML = '<div id="overview-pane"><h1>Lead Systems Architect</h1></div>';
            }
            function showApplication() {
              document.getElementById('tab-content').innerHTML = '<form id="app-form"><input name="first_name" placeholder="First Name"/><input name="last_name" placeholder="Last Name"/><input type="file" name="resume"/></form>';
            }
          </script>
        </body>
        </html>
      `);

      const browserSession = new BrowserSession();
      browserSession.page = page;
      const mockLogger = new ExecutionLogger('test-session-tab', {
        log: async () => {},
        updateSession: async () => ({ session: {} as any }),
      } as any);

      const context: WorkflowContext = {
        sessionId: 'test-session-tab',
        userId: 'user-1',
        jobId: 'job-1',
        jobUrl: 'https://jobs.ashbyhq.com/example/job-1',
        resumeMarkdown: '# Resume',
        coverLetterMarkdown: '# Cover',
        userProfile: { name: 'Jordan Lee', email: 'jordan@example.com' } as any,
      };

      const agent = new GenericApplicationAgent();
      const result = await agent.initiateApplication(browserSession, context, mockLogger);

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.reachedForm, true);

      // Verify form elements are now visible
      const formInputs = await page.locator('input[name="first_name"], input[name="last_name"]').count();
      assert.strictEqual(formInputs, 2);
    } finally {
      await page.close();
    }
  });
});
