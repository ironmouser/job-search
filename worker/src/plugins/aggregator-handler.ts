import { BrowserSession } from '../browser-session';
import { ExecutionLogger } from '../execution-logger';

/**
 * AggregatorHandler
 * 
 * Runs when the initial job URL does not match any known ATS (e.g., it is a LinkedIn,
 * Indeed, or company career page). It scans the DOM for an "Apply" button, clicks it,
 * and handles redirects or new tabs to reach the actual ATS form.
 */
export class AggregatorHandler {
  /**
   * Attempts to find and click the initial "Apply" button.
   * Returns true if a navigation or new tab was successfully triggered.
   * Returns false if no apply button was found or navigation timed out.
   */
  static async attemptClickThrough(browser: BrowserSession, logger: ExecutionLogger): Promise<boolean> {
    const page = browser.page;
    
    // Words that indicate this is NOT the apply button
    const BLOCKLIST = /\b(next|continue|back|previous|save|cancel|skip|draft|login|sign in)\b/i;
    
    // Match exact or contains "apply"
    const APPLY_PATTERN = /\b(apply|apply now|apply for this job|apply online)\b/i;

    await logger.info('aggregator_handler', 'Scanning for Apply buttons on unknown platform...');

    // Find all links and buttons
    const candidates = await page.$$('a, button, [role="button"], [role="link"]').catch(() => []);
    
    let targetElement = null;

    for (const el of candidates) {
      const text = ((await el.textContent().catch(() => null)) ?? '').trim();
      if (APPLY_PATTERN.test(text) && !BLOCKLIST.test(text)) {
        // Also check if it's visible
        const isVisible = await el.isVisible().catch(() => false);
        if (isVisible) {
          targetElement = el;
          await logger.info('aggregator_handler', `Found candidate Apply button with text: "${text}"`);
          break;
        }
      }
    }

    if (!targetElement) {
      await logger.warn('aggregator_handler', 'No Apply button found on the page.');
      return false;
    }

    try {
      await logger.info('aggregator_handler', 'Clicking Apply button and waiting for navigation/new tab...');
      
      const context = page.context();
      
      // We must catch either a new page (target="_blank") or a top-level navigation
      const [newPage] = await Promise.all([
        Promise.race([
          context.waitForEvent('page', { timeout: 15000 }).catch(() => null),
          page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 }).then(() => null).catch(() => null)
        ]),
        targetElement.click({ timeout: 5000 })
      ]);

      if (newPage) {
        await logger.info('aggregator_handler', 'Apply button opened a new tab. Switching to new tab...');
        await newPage.waitForLoadState('domcontentloaded');
        
        // We need to replace the active page in the browser session.
        (browser as any)._page = newPage;
        await page.close().catch(() => {});
      } else {
        await logger.info('aggregator_handler', 'Apply button triggered current-tab navigation.');
        // Wait a bit just to be safe if it's a slow SPA transition
        await page.waitForTimeout(2000);
      }

      const currentUrl = browser.page.url();
      await logger.info('aggregator_handler', `Navigation complete. New URL: ${currentUrl}`);
      return true;

    } catch (err: any) {
      await logger.warn('aggregator_handler', `Failed to click Apply button or navigate: ${err.message}`);
      return false;
    }
  }
}
