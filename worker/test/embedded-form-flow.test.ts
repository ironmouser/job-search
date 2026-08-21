/**
 * worker/test/embedded-form-flow.test.ts
 *
 * Tests for embedded career forms, in-page form detection,
 * bypassing aggregator link hunting on direct forms, and plugin resilience.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { chromium, Browser } from 'playwright';
import { GenericPageAnalyzer } from '../src/generic-agent/page-analyzer';
import { AggregatorHandler } from '../src/plugins/aggregator-handler';
import { ExecutionLogger } from '../src/execution-logger';
import { GreenhousePlugin } from '../src/plugins/greenhouse';
import { BrowserSession } from '../src/browser-session';
import { WorkflowContext } from '../src/types';

describe('Embedded and Custom Career Form Flow Tests', () => {
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

  it('Test 1 — In-page Form Presence: Detects application form with resume and contact inputs', async () => {
    const page = await browser.newPage();
    try {
      await page.setContent(`
        <!DOCTYPE html>
        <html>
        <head><title>Product Manager - Hex</title></head>
        <body>
          <main>
            <h1>Product Manager (NYC)</h1>
            <div class="job-content">Join our team building data tools.</div>
            <form class="custom-application-form" id="career-apply-form">
              <input type="text" name="firstName" placeholder="First Name" />
              <input type="text" name="lastName" placeholder="Last Name" />
              <input type="email" name="email" placeholder="Email" />
              <input type="tel" name="phone" placeholder="Phone" />
              <input type="file" name="resumeFile" accept=".pdf,.doc,.docx" />
              <button type="submit">Submit Application</button>
            </form>
          </main>
        </body>
        </html>
      `);

      const formPresence = await GenericPageAnalyzer.inspectFormPresence(page);
      assert.strictEqual(formPresence.hasForm, true);
      assert.strictEqual(formPresence.hasResumeUpload, true);
      assert.strictEqual(formPresence.hasEmailInput, true);
      assert.strictEqual(formPresence.hasNameInput, true);
      assert.strictEqual(formPresence.hasSubmitButton, true);
      assert.ok(formPresence.inputCount >= 5);
    } finally {
      await page.close();
    }
  });

  it('Test 2 — AggregatorHandler: Bypasses link discovery when form is already present on page', async () => {
    const page = await browser.newPage();
    try {
      await page.setContent(`
        <!DOCTYPE html>
        <html>
        <head><title>Senior Product Manager - Hex</title></head>
        <body>
          <nav>
            <a href="/blog">Blog</a>
            <a href="/pricing">Pricing</a>
            <a href="/customers">Customers</a>
          </nav>
          <h1>Senior Product Manager</h1>
          <form id="apply-job-form">
            <input type="text" name="first_name" />
            <input type="text" name="last_name" />
            <input type="email" name="email" />
            <input type="file" name="resume" />
            <button type="submit">Apply</button>
          </form>
        </body>
        </html>
      `);

      const logger = new ExecutionLogger();
      const mockBrowserSession = {
        page,
        getHtml: async () => page.content(),
        getRedirectChain: async () => [page.url()],
      } as unknown as BrowserSession;

      const clickResult = await AggregatorHandler.attemptClickThrough(
        mockBrowserSession,
        logger,
        'test-session-123'
      );

      // Should recognize the in-page form and NOT attempt to navigate away
      assert.strictEqual(clickResult.navigated, false);
      assert.strictEqual(clickResult.candidateReports.length, 0);
    } finally {
      await page.close();
    }
  });

  it('Test 3 — GreenhousePlugin: Prepares successfully on custom embedded form container', async () => {
    const page = await browser.newPage();
    try {
      await page.setContent(`
        <!DOCTYPE html>
        <html>
        <head><title>Product Manager - Hex</title></head>
        <body>
          <div class="application-form-container">
            <form action="https://api.greenhouse.io/v1/applications" method="POST">
              <input type="text" name="firstName" id="first_name_custom" />
              <input type="text" name="lastName" id="last_name_custom" />
              <input type="email" name="email" id="email_custom" />
              <input type="file" name="resume" accept="application/pdf" />
              <button type="submit">Submit Application</button>
            </form>
          </div>
        </body>
        </html>
      `);

      const plugin = new GreenhousePlugin();
      const logger = new ExecutionLogger();
      const mockBrowserSession = {
        page,
        navigate: async () => {},
      } as unknown as BrowserSession;

      const context: WorkflowContext = {
        sessionId: 'test-session-456',
        jobId: 'job-123',
        jobUrl: page.url() || 'https://hex.tech/careers/product-manager',
        userProfile: {
          name: 'Jane Doe',
          email: 'jane.doe@example.com',
          phone: '+15551234567',
        },
        resumeMarkdown: '# Jane Doe\nProduct Manager',
        coverLetterMarkdown: null,
      };

      // prepare should succeed without throwing UNEXPECTED_PAGE
      await assert.doesNotReject(async () => {
        await plugin.prepare(mockBrowserSession, context, logger);
      });
    } finally {
      await page.close();
    }
  });

  it('Test 4 — Aggregator Domain: Does NOT bypass link discovery on aggregator domains (e.g. builtin.com) with promotional resume widget', async () => {
    const page = await browser.newPage();
    try {
      await page.goto('about:blank');
      // Mock page on builtin.com domain with promotional resume upload widget and apply button
      await page.setContent(`
        <!DOCTYPE html>
        <html>
        <head><title>Product Manager at Hex | Built In</title></head>
        <body>
          <div class="job-insights-widget">
            <p>Get Personalized Job Insights</p>
            <input type="file" name="resume-widget" />
          </div>
          <a href="https://hex.tech/careers/5983041004" class="btn apply-button">Apply</a>
        </body>
        </html>
      `);

      const logger = new ExecutionLogger();
      const mockBrowserSession = {
        page: {
          ...page,
          url: () => 'https://builtin.com/job/senior-product-manager/9172682',
          content: () => page.content(),
          evaluate: (...args: any[]) => (page.evaluate as any)(...args),
          $$eval: (...args: any[]) => (page.$$eval as any)(...args),
          locator: (...args: any[]) => page.locator(...args),
          frames: () => [page.mainFrame()],
        },
        getHtml: async () => page.content(),
        getRedirectChain: async () => ['https://builtin.com/job/senior-product-manager/9172682'],
      } as unknown as BrowserSession;

      const clickResult = await AggregatorHandler.attemptClickThrough(
        mockBrowserSession,
        logger,
        'test-session-789'
      );

      // On an aggregator domain, it should NOT return navigated: false immediately from form detection
      // It should evaluate candidates / find the destination URL
      assert.ok(clickResult.candidateReports.length > 0 || clickResult.navigated);
    } finally {
      await page.close();
    }
  });
});
