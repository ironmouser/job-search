/**
 * worker/test/generic-agent.test.ts
 *
 * Comprehensive tests for the Generic Application Agent, Page Analyzer,
 * UI Obstruction Recovery in Generic Flow, Destination Convergence,
 * Security Boundary Enforcement, and ATS Plugin Selection.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { chromium, Browser, Page } from 'playwright';
import { pluginRegistry } from '../src/registry';
import { ATSPlatform, InterventionReason } from '../src/types';
import { GenericPageAnalyzer } from '../src/generic-agent/page-analyzer';
import { PageClassification } from '../src/generic-agent/types';
import { GenericApplicationAgent } from '../src/generic-agent/generic-application-agent';
import { BrowserSession } from '../src/browser-session';
import { ExecutionLogger } from '../src/execution-logger';
import { InterventionError } from '../src/plugins/base-plugin';
import { normalizeUrl } from '../src/utils/destination-validator';

describe('Generic Application Agent & Unknown ATS Automation Tests', () => {
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

  // ─── Test 1: Known ATS Selection ──────────────────────────────────────────
  it('Test 1 — Known ATS: Specialized plugin selected for known ATS platforms', async () => {
    const greenhouseHtml = '<div id="grnhse_app"><form></form></div>';
    const matchGreenhouse = pluginRegistry.detect('https://boards.greenhouse.io/acme/jobs/123', greenhouseHtml, []);
    assert.ok(matchGreenhouse);
    assert.strictEqual(matchGreenhouse.plugin.platform, ATSPlatform.GREENHOUSE);
    assert.ok(matchGreenhouse.result.confidence >= 80);

    const workdayHtml = '<div data-automation-id="workdayApplication"></div>';
    const matchWorkday = pluginRegistry.detect('https://acme.myworkdayjobs.com/en-US/careers/job/123', workdayHtml, []);
    assert.ok(matchWorkday);
    assert.strictEqual(matchWorkday.plugin.platform, ATSPlatform.WORKDAY);
  });

  // ─── Test 2: Unknown ATS with Apply Button ─────────────────────────────────
  it('Test 2 — Unknown ATS: Generic agent identifies job page and Apply button', async () => {
    const page = await browser.newPage();
    try {
      await page.setContent(`
        <!DOCTYPE html>
        <html>
        <head><title>Senior Frontend Engineer - Custom Corp</title></head>
        <body>
          <header><h1>Senior Frontend Engineer</h1><p>Location: New York, NY</p></header>
          <div class="job-description">
            <p>We are seeking a talented frontend engineer to join our team.</p>
          </div>
          <div class="actions">
            <button id="apply-button" class="btn-primary" onclick="window.location.href='#apply-form'">Apply for this job</button>
          </div>
        </body>
        </html>
      `);

      const analysis = await GenericPageAnalyzer.analyze(page);
      assert.strictEqual(analysis.classification, PageClassification.JOB_DETAIL_PAGE);
      assert.ok(analysis.candidates.length > 0);

      const best = analysis.bestControl;
      assert.ok(best);
      assert.ok(best.confidence >= 75);
      assert.strictEqual(best.confidenceTier, 'HIGH');
      assert.strictEqual(best.text, 'Apply for this job');
    } finally {
      await page.close();
    }
  });

  // ─── Test 3: Negative Control Filtering ────────────────────────────────────
  it('Test 3 — Control Ranking: Discards non-application controls ("Apply filters", "Apply promo")', async () => {
    const page = await browser.newPage();
    try {
      await page.setContent(`
        <!DOCTYPE html>
        <html>
        <head><title>Job Search Results</title></head>
        <body>
          <div class="sidebar">
            <button id="filter-btn">Apply filters</button>
            <button id="promo-btn">Apply coupon</button>
          </div>
          <div class="job-item">
            <h2>Product Manager</h2>
            <a href="/jobs/123/apply" class="apply-link">Apply Now</a>
          </div>
        </body>
        </html>
      `);

      const analysis = await GenericPageAnalyzer.analyze(page);
      assert.ok(analysis.candidates.length > 0);

      const texts = analysis.candidates.map(c => c.text);
      assert.ok(texts.includes('Apply Now'));
      assert.strictEqual(texts.includes('Apply filters'), false);
      assert.strictEqual(texts.includes('Apply coupon'), false);
    } finally {
      await page.close();
    }
  });

  // ─── Test 4: Unknown ATS with Marketing Modal Obstruction ─────────────────
  it('Test 4 — UI Obstruction: Safely dismisses marketing modal and initiates apply', async () => {
    const page = await browser.newPage();
    try {
      await page.setContent(`
        <!DOCTYPE html>
        <html>
        <head><title>Software Engineer - Innovate</title></head>
        <body>
          <h1>Software Engineer</h1>
          <button id="apply-btn" onclick="window.applyClicked = true; document.body.innerHTML = '<h1>Apply</h1><form><input name=email /><input type=file name=resume /><button type=submit>Submit</button></form>';">Apply Now</button>

          <!-- Marketing newsletter overlay blocking the apply button -->
          <div id="newsletter-modal" role="dialog" aria-modal="true" style="position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 9999; display: flex; align-items: center; justify-content: center;">
            <div style="background: white; padding: 20px;">
              <h2>Subscribe to our newsletter!</h2>
              <p>Get the latest updates and news.</p>
              <button id="close-modal-btn" onclick="document.getElementById('newsletter-modal').remove()">Dismiss</button>
            </div>
          </div>
        </body>
        </html>
      `);

      const mockSession: any = {
        _page: page,
        page,
        navigate: async () => {},
        findFormFrame: async () => page,
        getHtml: async () => page.content(),
        getRedirectChain: async () => [page.url()],
      };

      const mockLogger: any = {
        info: async () => {},
        warn: async () => {},
        error: async () => {},
      };

      const agent = new GenericApplicationAgent();
      const result = await agent.initiateApplication(mockSession, {
        sessionId: 'test-session',
        userId: 'u1',
        jobId: 'j1',
        jobUrl: 'http://localhost/job',
        resumeMarkdown: '# Resume',
        coverLetterMarkdown: '# Cover Letter',
        userProfile: { name: 'Alex Doe', email: 'alex@example.com' },
        simulationMode: true,
      }, mockLogger);

      const isClicked = await page.evaluate(() => (window as any).applyClicked);
      assert.strictEqual(isClicked, true);
      assert.strictEqual(result.success, true);
    } finally {
      await page.close();
    }
  });

  // ─── Test 5: Unknown ATS with Cookie Banner ───────────────────────────────
  it('Test 5 — Cookie Banner: Safely resolves cookie banner obstruction', async () => {
    const page = await browser.newPage();
    try {
      await page.setContent(`
        <!DOCTYPE html>
        <html>
        <head><title>Backend Engineer</title></head>
        <body>
          <h1>Backend Engineer</h1>
          <button id="apply-btn" onclick="window.applied = true; document.body.innerHTML = '<h1>Apply</h1><form><input name=email /><input type=file name=resume /><button type=submit>Submit</button></form>';">Apply</button>

          <div id="cookie-banner" role="dialog" style="position: fixed; bottom: 0; left: 0; right: 0; height: 100px; background: #eee; z-index: 1000; padding: 10px;">
            <p>We use cookies to improve your experience.</p>
            <button id="accept-cookies" onclick="document.getElementById('cookie-banner').remove()">Accept All Cookies</button>
          </div>
        </body>
        </html>
      `);

      const mockSession: any = {
        _page: page,
        page,
        findFormFrame: async () => page,
      };

      const mockLogger: any = {
        info: async () => {},
        warn: async () => {},
        error: async () => {},
      };

      const agent = new GenericApplicationAgent();
      await agent.initiateApplication(mockSession, {
        sessionId: 'test-session',
        userId: 'u1',
        jobId: 'j1',
        jobUrl: 'http://localhost/job',
        resumeMarkdown: '# Resume',
        coverLetterMarkdown: '',
        userProfile: { name: 'Alex Doe', email: 'alex@example.com' },
        simulationMode: true,
      }, mockLogger);

      const isApplied = await page.evaluate(() => (window as any).applied);
      assert.strictEqual(isApplied, true);
      assert.strictEqual(isApplied, true);
    } finally {
      await page.close();
    }
  });

  // ─── Test 6: Security Boundary — CAPTCHA Challenge ────────────────────────
  it('Test 6 — Security Boundary: CAPTCHA detected -> stops and throws APPLICATION_BLOCKED_BY_CAPTCHA', async () => {
    const page = await browser.newPage();
    try {
      await page.setContent(`
        <!DOCTYPE html>
        <html>
        <head><title>Security Verification</title></head>
        <body>
          <h1>Security Verification</h1>
          <div class="g-recaptcha" data-sitekey="6Le-wvkSAAAAAPBMRTvw0Q4Muexq9bi0DJwx_mJ-"></div>
          <p>Please complete the security check to continue.</p>
        </body>
        </html>
      `);

      const mockSession: any = { _page: page, page };
      const mockLogger: any = { info: async () => {}, warn: async () => {}, error: async () => {} };
      const agent = new GenericApplicationAgent();

      await assert.rejects(
        async () => {
          await agent.initiateApplication(mockSession, {
            sessionId: 'test-session',
            userId: 'u1',
            jobId: 'j1',
            jobUrl: 'http://localhost/captcha-job',
            resumeMarkdown: '# Resume',
            coverLetterMarkdown: '',
            userProfile: { name: 'Alex Doe', email: 'alex@example.com' },
            simulationMode: true,
          }, mockLogger);
        },
        (err: any) => {
          assert.ok(err instanceof InterventionError);
          assert.strictEqual(err.reason, InterventionReason.APPLICATION_BLOCKED_BY_CAPTCHA);
          return true;
        }
      );
    } finally {
      await page.close();
    }
  });

  // ─── Test 7: Security Boundary — Mandatory Login Wall ─────────────────────
  it('Test 7 — Authentication Boundary: Login required without guest option -> throws APPLICATION_BLOCKED_BY_LOGIN', async () => {
    const page = await browser.newPage();
    try {
      await page.setContent(`
        <!DOCTYPE html>
        <html>
        <head><title>Sign In to Apply</title></head>
        <body>
          <h1>Sign in to apply</h1>
          <form action="/login" method="post">
            <input type="email" name="user_email" placeholder="Email" />
            <input type="password" name="user_password" placeholder="Password" />
            <button type="submit">Sign In</button>
          </form>
        </body>
        </html>
      `);

      const mockSession: any = { _page: page, page };
      const mockLogger: any = { info: async () => {}, warn: async () => {}, error: async () => {} };
      const agent = new GenericApplicationAgent();

      await assert.rejects(
        async () => {
          await agent.initiateApplication(mockSession, {
            sessionId: 'test-session',
            userId: 'u1',
            jobId: 'j1',
            jobUrl: 'http://localhost/login-job',
            resumeMarkdown: '# Resume',
            coverLetterMarkdown: '',
            userProfile: { name: 'Alex Doe', email: 'alex@example.com' },
            simulationMode: true,
          }, mockLogger);
        },
        (err: any) => {
          assert.ok(err instanceof InterventionError);
          assert.strictEqual(err.reason, InterventionReason.APPLICATION_BLOCKED_BY_LOGIN);
          return true;
        }
      );
    } finally {
      await page.close();
    }
  });

  // ─── Test 8: No Credible Application Controls ─────────────────────────────
  it('Test 8 — No Controls: Page with no application controls -> throws APPLICATION_NOT_FOUND', async () => {
    const page = await browser.newPage();
    try {
      await page.setContent(`
        <!DOCTYPE html>
        <html>
        <head><title>Company Blog</title></head>
        <body>
          <h1>Our Latest News</h1>
          <p>Read about our company milestones.</p>
          <a href="/about">About Us</a>
        </body>
        </html>
      `);

      const mockSession: any = { _page: page, page };
      const mockLogger: any = { info: async () => {}, warn: async () => {}, error: async () => {} };
      const agent = new GenericApplicationAgent();

      await assert.rejects(
        async () => {
          await agent.initiateApplication(mockSession, {
            sessionId: 'test-session',
            userId: 'u1',
            jobId: 'j1',
            jobUrl: 'http://localhost/blog',
            resumeMarkdown: '# Resume',
            coverLetterMarkdown: '',
            userProfile: { name: 'Alex Doe', email: 'alex@example.com' },
            simulationMode: true,
          }, mockLogger);
        },
        (err: any) => {
          assert.ok(err instanceof InterventionError);
          assert.strictEqual(err.reason, InterventionReason.APPLICATION_NOT_FOUND);
          return true;
        }
      );
    } finally {
      await page.close();
    }
  });

  // ─── Test 9: Same JSON-LD Destination URL Convergence ─────────────────────
  it('Test 9 — Destination Convergence: normalizeUrl recognizes identical destination', () => {
    const url1 = 'https://www.capitalonecareers.com/job/mclean/product-manager/1732/98139927056/';
    const url2 = 'https://capitalonecareers.com/job/mclean/product-manager/1732/98139927056?utm_source=builtin';

    const norm1 = normalizeUrl(url1);
    const norm2 = normalizeUrl(url2);

    assert.strictEqual(norm1, norm2);
    assert.strictEqual(norm1, 'https://capitalonecareers.com/job/mclean/product-manager/1732/98139927056');
  });

  // ─── Test 10: SPA Application Progress Detection ──────────────────────────
  it('Test 10 — SPA Application: Form already present or rendered dynamically -> detected as APPLICATION_FORM', async () => {
    const page = await browser.newPage();
    try {
      await page.setContent(`
        <!DOCTYPE html>
        <html>
        <head><title>Job Application Form</title></head>
        <body>
          <h1>Apply for Software Engineer</h1>
          <form id="app-form">
            <input type="text" name="firstName" placeholder="First Name" />
            <input type="text" name="lastName" placeholder="Last Name" />
            <input type="email" name="email" placeholder="Email" />
            <input type="tel" name="phone" placeholder="Phone" />
            <input type="file" name="resume" accept=".pdf,.doc" />
            <button type="submit">Submit Application</button>
          </form>
        </body>
        </html>
      `);

      const analysis = await GenericPageAnalyzer.analyze(page);
      assert.strictEqual(analysis.classification, PageClassification.APPLICATION_FORM);
      assert.strictEqual(analysis.formPresence.hasResumeUpload, true);
      assert.strictEqual(analysis.formPresence.hasEmailInput, true);
      assert.strictEqual(analysis.formPresence.hasSubmitButton, true);
    } finally {
      await page.close();
    }
  });
});
