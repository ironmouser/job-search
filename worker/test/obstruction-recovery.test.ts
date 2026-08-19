/**
 * worker/test/obstruction-recovery.test.ts
 *
 * Playwright integration tests for UI obstruction detection, classification,
 * safe modal recovery (Escape, Close button, Backdrop), security boundaries,
 * and safeInteract wrapper.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { chromium, Browser, Page } from 'playwright';
import { safeClick } from '../src/obstruction/safe-interact';
import { UIObstructionDetector } from '../src/obstruction/detector';
import { ObstructionType, ObstructionDismissalAction } from '../src/obstruction/types';

describe('UI Obstruction Detection & Modal Recovery Integration Tests', () => {
  let browser: Browser;
  let page: Page;

  before(async () => {
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
  });

  after(async () => {
    await browser?.close();
  });

  it('Test 1 — No obstruction: Apply button actionable -> direct click succeeds', async () => {
    page = await browser.newPage();
    try {
      await page.setContent(`
        <!DOCTYPE html>
        <html>
        <head><title>Direct Apply</title></head>
        <body>
          <h1>Software Engineer</h1>
          <button id="apply-btn" onclick="window.clicked = true">Apply Now</button>
        </body>
        </html>
      `);

      const target = page.locator('#apply-btn');
      const actionability = await UIObstructionDetector.checkActionability(page, target);
      assert.strictEqual(actionability.visible, true);
      assert.strictEqual(actionability.isObstructed, false);

      const result = await safeClick(page, target, { actionName: 'click_apply' });
      assert.strictEqual(result.success, true);
      assert.strictEqual(result.recoveryPerformed, false);
      assert.strictEqual(result.obstructionType, ObstructionType.NONE);

      const isClicked = await page.evaluate(() => (window as any).clicked);
      assert.strictEqual(isClicked, true);
    } finally {
      await page.close();
    }
  });

  it('Test 2 — Escape recovery: Marketing modal closes with Escape -> Apply succeeds', async () => {
    page = await browser.newPage();
    try {
      await page.setContent(`
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            .modal-overlay {
              position: fixed; inset: 0; background: rgba(0,0,0,0.5);
              display: flex; align-items: center; justify-content: center; z-index: 9999;
            }
            .modal-box { background: white; padding: 20px; border-radius: 8px; }
          </style>
        </head>
        <body>
          <button id="apply-btn" onclick="window.applied = true">Apply Now</button>

          <div id="marketing-modal" class="modal-overlay" role="dialog" aria-modal="true">
            <div class="modal-box">
              <h2>Join our talent community!</h2>
              <p>Stay up to date with the latest job openings.</p>
            </div>
          </div>

          <script>
            window.addEventListener('keydown', (e) => {
              if (e.key === 'Escape') {
                document.getElementById('marketing-modal').style.display = 'none';
              }
            });
          </script>
        </body>
        </html>
      `);

      const target = page.locator('#apply-btn');
      const initialCheck = await UIObstructionDetector.checkActionability(page, target);
      assert.strictEqual(initialCheck.isObstructed, true);
      assert.strictEqual(initialCheck.blockingElement?.tag, 'div');

      const result = await safeClick(page, target);
      assert.strictEqual(result.success, true);
      assert.strictEqual(result.recoveryPerformed, true);
      assert.strictEqual(result.recoveryAction, ObstructionDismissalAction.ESCAPE);

      const isApplied = await page.evaluate(() => (window as any).applied);
      assert.strictEqual(isApplied, true);
    } finally {
      await page.close();
    }
  });

  it('Test 3 — Close button recovery: Modal with Close button -> closes and clicks Apply', async () => {
    page = await browser.newPage();
    try {
      await page.setContent(`
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            .modal-overlay {
              position: fixed; inset: 0; background: rgba(0,0,0,0.5);
              display: flex; align-items: center; justify-content: center; z-index: 9999;
            }
            .modal-box { background: white; padding: 20px; }
          </style>
        </head>
        <body>
          <button id="apply-btn" onclick="window.applied = true">Apply</button>

          <div id="newsletter-modal" class="modal-overlay" role="dialog" aria-modal="true">
            <div class="modal-box">
              <h2>Subscribe to our newsletter</h2>
              <p>Get weekly updates delivered directly to your inbox.</p>
              <button id="close-modal-btn" aria-label="Close" onclick="document.getElementById('newsletter-modal').style.display = 'none'">No thanks</button>
            </div>
          </div>
        </body>
        </html>
      `);

      const target = page.locator('#apply-btn');
      const result = await safeClick(page, target);
      assert.strictEqual(result.success, true);
      assert.strictEqual(result.recoveryPerformed, true);
      assert.strictEqual(result.recoveryAction, ObstructionDismissalAction.CLOSE_BUTTON);

      const isApplied = await page.evaluate(() => (window as any).applied);
      assert.strictEqual(isApplied, true);
    } finally {
      await page.close();
    }
  });

  it('Test 4 — Backdrop recovery: Modal dismissible via Backdrop click -> closes and clicks Apply', async () => {
    page = await browser.newPage();
    try {
      await page.setContent(`
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            #backdrop {
              position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 9999;
            }
            #dialog-box {
              position: fixed; top: 150px; left: 150px; width: 300px; height: 200px;
              background: white; z-index: 10000;
            }
          </style>
        </head>
        <body>
          <button id="apply-btn" style="position: absolute; top: 50px; left: 50px;" onclick="window.applied = true">Apply</button>

          <div id="backdrop" role="dialog" aria-modal="true" onclick="this.style.display = 'none'; document.getElementById('dialog-box').style.display = 'none';">
          </div>
          <div id="dialog-box">
            <h3>Special Offer</h3>
            <p>Check out our careers portal.</p>
          </div>
        </body>
        </html>
      `);

      const target = page.locator('#apply-btn');
      const result = await safeClick(page, target);
      assert.strictEqual(result.success, true);
      assert.strictEqual(result.recoveryPerformed, true);

      const isApplied = await page.evaluate(() => (window as any).applied);
      assert.strictEqual(isApplied, true);
    } finally {
      await page.close();
    }
  });

  it('Test 5 — Cookie banner recovery: Accept button dismisses banner -> Apply succeeds', async () => {
    page = await browser.newPage();
    try {
      await page.setContent(`
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            #onetrust-banner-sdk {
              position: fixed; bottom: 0; left: 0; right: 0; height: 120px;
              background: #222; color: white; z-index: 99999; padding: 20px;
            }
          </style>
        </head>
        <body>
          <div style="position: fixed; bottom: 20px; left: 20px; z-index: 1;">
            <button id="apply-btn" onclick="window.applied = true">Apply on Company Site</button>
          </div>

          <div id="onetrust-banner-sdk" role="dialog" aria-modal="true">
            <p>We use cookies to improve your browsing experience.</p>
            <button id="onetrust-accept-btn-handler" onclick="document.getElementById('onetrust-banner-sdk').style.display = 'none'">Accept All Cookies</button>
          </div>
        </body>
        </html>
      `);

      const target = page.locator('#apply-btn');
      const result = await safeClick(page, target);
      assert.strictEqual(result.success, true);
      assert.strictEqual(result.recoveryPerformed, true);
      assert.strictEqual(result.obstructionType, ObstructionType.COOKIE_BANNER);

      const isApplied = await page.evaluate(() => (window as any).applied);
      assert.strictEqual(isApplied, true);
    } finally {
      await page.close();
    }
  });

  it('Test 6 — CAPTCHA / Bot challenge: NEVER attempts bypass -> returns blocked status', async () => {
    page = await browser.newPage();
    try {
      await page.setContent(`
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            #captcha-overlay {
              position: fixed; inset: 0; background: white; z-index: 99999;
              display: flex; flex-direction: column; align-items: center; justify-content: center;
            }
          </style>
        </head>
        <body>
          <button id="apply-btn" onclick="window.applied = true">Apply</button>

          <div id="captcha-overlay">
            <h2>Verifying you are human</h2>
            <p>Please complete security check. DDoS protection by Cloudflare.</p>
            <div id="cf-turnstile">Challenge Box</div>
          </div>
        </body>
        </html>
      `);

      const target = page.locator('#apply-btn');
      const result = await safeClick(page, target);

      assert.strictEqual(result.success, false);
      assert.strictEqual(result.recoveryPerformed, false);
      assert.ok(
        result.failureReason === 'APPLICATION_BLOCKED_BY_BOT_CHALLENGE' ||
          result.failureReason === 'APPLICATION_BLOCKED_BY_CAPTCHA'
      );

      // Verify DOM was not modified / bypassed
      const isApplied = await page.evaluate(() => (window as any).applied);
      assert.strictEqual(isApplied, undefined);
      const isOverlayPresent = await page.locator('#captcha-overlay').isVisible();
      assert.strictEqual(isOverlayPresent, true);
    } finally {
      await page.close();
    }
  });

  it('Test 7 — Login modal requirement: NEVER attempts bypass -> returns blocked by login', async () => {
    page = await browser.newPage();
    try {
      await page.setContent(`
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            #login-modal {
              position: fixed; inset: 0; background: rgba(0,0,0,0.7); z-index: 9999;
              display: flex; align-items: center; justify-content: center;
            }
            .box { background: white; padding: 30px; }
          </style>
        </head>
        <body>
          <button id="apply-btn" onclick="window.applied = true">Apply</button>

          <div id="login-modal" role="dialog" aria-modal="true">
            <div class="box">
              <h2>Sign in to continue</h2>
              <p>Enter your password or create an account to apply for this job.</p>
              <input type="password" placeholder="Password" />
              <button>Log In</button>
            </div>
          </div>
        </body>
        </html>
      `);

      const target = page.locator('#apply-btn');
      const result = await safeClick(page, target);

      assert.strictEqual(result.success, false);
      assert.strictEqual(result.failureReason, 'APPLICATION_BLOCKED_BY_LOGIN');
      assert.strictEqual(result.obstructionType, ObstructionType.LOGIN_MODAL);

      const isApplied = await page.evaluate(() => (window as any).applied);
      assert.strictEqual(isApplied, undefined);
    } finally {
      await page.close();
    }
  });

  it('Test 8 — Unknown overlay without dismiss control: Bounded attempts -> returns blocked', async () => {
    page = await browser.newPage();
    try {
      await page.setContent(`
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            #persistent-mask {
              position: fixed; inset: 0; background: rgba(0,0,0,0.6); z-index: 9999;
            }
          </style>
        </head>
        <body>
          <button id="apply-btn" onclick="window.applied = true">Apply</button>
          <div id="persistent-mask"></div>
        </body>
        </html>
      `);

      const target = page.locator('#apply-btn');
      const result = await safeClick(page, target, { maxRecoveryAttempts: 2 });

      assert.strictEqual(result.success, false);
      assert.strictEqual(result.failureReason, 'APPLICATION_BLOCKED_BY_UNKNOWN_UI');

      const isApplied = await page.evaluate(() => (window as any).applied);
      assert.strictEqual(isApplied, undefined);
    } finally {
      await page.close();
    }
  });

  it('Test 9 — Force click fallback: Used when enabled on unobstructed or transparent non-security overlay', async () => {
    page = await browser.newPage();
    try {
      await page.setContent(`
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            #transparent-click-interceptor {
              position: fixed; inset: 0; background: transparent; z-index: 100;
            }
          </style>
        </head>
        <body>
          <button id="apply-btn" onclick="window.applied = true">Apply</button>
          <div id="transparent-click-interceptor"></div>
        </body>
        </html>
      `);

      const target = page.locator('#apply-btn');
      const result = await safeClick(page, target, { allowForceFallback: true });

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.forcedUsed, true);

      const isApplied = await page.evaluate(() => (window as any).applied);
      assert.strictEqual(isApplied, true);
    } finally {
      await page.close();
    }
  });

  it('Test 10 — Idempotency: Calling detector on unobstructed page returns clean result', async () => {
    page = await browser.newPage();
    try {
      await page.setContent(`
        <!DOCTYPE html>
        <html>
        <body>
          <button id="apply-btn">Apply</button>
        </body>
        </html>
      `);

      const target = page.locator('#apply-btn');
      const check1 = await UIObstructionDetector.checkActionability(page, target);
      const check2 = await UIObstructionDetector.checkActionability(page, target);

      assert.strictEqual(check1.isObstructed, false);
      assert.strictEqual(check2.isObstructed, false);
      assert.strictEqual(check1.visible, true);
      assert.strictEqual(check2.visible, true);
    } finally {
      await page.close();
    }
  });
});
