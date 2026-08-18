import { BrowserSession } from '../browser-session';
import { ExecutionLogger } from '../execution-logger';
import { detectJobClosed } from '../utils/job-status-detector';
import { InterventionError, ATSPlugin } from './base-plugin';
import { InterventionReason, ATSDetectionResult, ATSPlatform } from '../types';
import { pluginRegistry } from '../registry';

/**
 * AggregatorHandler
 * 
 * Inspects pages when the initial job URL is an aggregator (LinkedIn, Indeed, ZipRecruiter,
 * BuiltIn, etc.) or a custom company careers portal.
 * 
 * Features:
 *  1. Scans elements using text, aria-labels, titles, data-attributes, IDs, classes, and hrefs.
 *  2. Direct URL extraction (extracting known ATS hrefs or aggregator redirect URLs directly).
 *  3. Bypasses LinkedIn and job board sign-in modals and click traps.
 *  4. In-page anchor and scroll detection.
 *  5. Embedded iframe inspection for Greenhouse, Lever, Ashby, etc.
 */
export class AggregatorHandler {
  /**
   * Scans all child iframes on the current page for embedded ATS forms (Greenhouse, Lever, Ashby, etc.)
   */
  static async detectIframeATS(browser: BrowserSession, logger: ExecutionLogger): Promise<{ plugin: ATSPlugin; result: ATSDetectionResult } | null> {
    try {
      const frames = browser.page.frames();
      for (const frame of frames) {
        const frameUrl = frame.url();
        if (!frameUrl || frameUrl === 'about:blank') continue;

        const frameHtml = await frame.content().catch(() => '');
        const match = pluginRegistry.detect(frameUrl, frameHtml, []);
        if (match && match.plugin.platform !== ATSPlatform.UNKNOWN && match.result.confidence >= 50) {
          await logger.info('aggregator_handler', `Detected embedded ATS in iframe: ${match.plugin.displayName} (${frameUrl})`);
          return match;
        }
      }
    } catch {
      // Ignore frame access errors
    }
    return null;
  }

  /**
   * Attempts to find and follow the Apply button or link on the page.
   * Returns true if navigation, iframe detection, or in-page form focus was triggered.
   */
  static async attemptClickThrough(browser: BrowserSession, logger: ExecutionLogger): Promise<boolean> {
    const page = browser.page;
    const currentUrl = page.url();

    // Check first if the page explicitly states the job is closed
    const closedCheck = await detectJobClosed(browser, logger);
    if (closedCheck.isClosed) {
      throw new InterventionError(
        InterventionReason.JOB_CLOSED,
        closedCheck.reason || 'This position is no longer accepting applications or has been closed by the employer.',
        currentUrl
      );
    }

    await logger.info('aggregator_handler', `Scanning page for Apply actions at ${currentUrl}...`);

    // ─── Pre-click: Neutralize non-interactive backdrop overlays ──────────────
    await page.evaluate(() => {
      document.querySelectorAll('.modal__overlay, .top-level-modal-container').forEach((el) => {
        const style = window.getComputedStyle(el);
        if (
          el.classList.contains('invisible') ||
          el.classList.contains('opacity-0') ||
          style.opacity === '0' ||
          style.visibility === 'hidden'
        ) {
          (el as HTMLElement).style.pointerEvents = 'none';
        }
      });
    }).catch(() => {});

    // ─── 1. Check for JSON-LD directApply URL ──────────────────────────────────
    try {
      const jsonLdUrls: string[] = await page.$$eval('script[type="application/ld+json"]', (scripts) => {
        const found: string[] = [];
        for (const s of scripts) {
          try {
            const data = JSON.parse(s.textContent || '{}');
            if (data.directApply && data.url) found.push(data.url);
            if (data['@type'] === 'JobPosting' && data.url && !data.url.includes('linkedin.com')) {
              found.push(data.url);
            }
          } catch {}
        }
        return found;
      }).catch(() => []);

      for (const rawUrl of jsonLdUrls) {
        if (rawUrl && (rawUrl.startsWith('http://') || rawUrl.startsWith('https://'))) {
          await logger.info('aggregator_handler', `Found direct application URL in JSON-LD metadata: ${rawUrl}`);
          await page.goto(rawUrl, { waitUntil: 'domcontentloaded', timeout: 25000 });
          return true;
        }
      }
    } catch {}

    // ─── 2. Evaluate all candidate links and buttons across the DOM ────────────
    const KNOWN_ATS_REGEX = /(greenhouse\.io|lever\.co|ashbyhq\.com|myworkdayjobs\.com|workday\.com|workable\.com|smartrecruiters\.com|icims\.com|taleo\.net|recruitee\.com|bamboohr\.com)/i;
    const AGGREGATOR_REDIRECT_REGEX = /(externalApply|\/apply-redirect|\/rc\/clk|\/job\/apply|\/apply\?|apply-link-offsite)/i;
    const APPLY_TEXT_REGEX = /\b(apply|apply now|apply for this job|apply on company website|apply on company site|apply on employer site|apply on employer website|apply externally|start application|submit application|easy apply|quick apply|apply with resume|apply with linkedin|apply online)\b/i;
    const BLOCKLIST_REGEX = /\b(next|continue|back|previous|save|cancel|skip|draft|login|sign in|create alert|share|report|follow|bookmark|return to search|back to search)\b/i;

    const candidateSelector = 'a, button, [role="button"], [role="link"], input[type="button"], input[type="submit"], [data-automation-id*="apply" i], [data-tracking-control-name*="apply" i], [id*="apply" i], [class*="apply" i]';
    const candidates = await page.$$(candidateSelector).catch(() => []);

    let directAtsLink: string | null = null;
    let redirectLink: string | null = null;
    let bestClickTarget: any = null;
    let inPageAnchorTarget: any = null;

    for (const el of candidates) {
      try {
        const isVisible = await el.isVisible().catch(() => false);
        if (!isVisible) continue;

        const text = ((await el.textContent().catch(() => null)) ?? '').trim();
        const ariaLabel = (await el.getAttribute('aria-label').catch(() => null)) ?? '';
        const title = (await el.getAttribute('title').catch(() => null)) ?? '';
        let href = (await el.getAttribute('href').catch(() => null)) ?? '';
        const dataApplyUrl = (await el.getAttribute('data-apply-url').catch(() => null)) ?? 
                             (await el.getAttribute('data-job-apply-url').catch(() => null)) ??
                             (await el.getAttribute('data-url').catch(() => null)) ??
                             (await el.getAttribute('data-href').catch(() => null)) ?? '';
        const dataTracking = (await el.getAttribute('data-tracking-control-name').catch(() => null)) ?? 
                             (await el.getAttribute('data-automation-id').catch(() => null)) ?? '';
        const id = (await el.getAttribute('id').catch(() => null)) ?? '';
        const className = (await el.getAttribute('class').catch(() => null)) ?? '';

        if (!href) {
          href = await el.$eval('a[href]', (a: any) => a.getAttribute('href')).catch(() => '') || '';
        }

        const allAttributesText = `${ariaLabel} ${title} ${dataTracking} ${id} ${className}`;

        // Check if explicitly blocked
        if (BLOCKLIST_REGEX.test(text) && !APPLY_TEXT_REGEX.test(text)) {
          continue;
        }

        const effectiveUrl = dataApplyUrl || href;

        // Check 1: Direct link to known ATS
        if (effectiveUrl && KNOWN_ATS_REGEX.test(effectiveUrl)) {
          try {
            directAtsLink = new URL(effectiveUrl, page.url()).href;
            await logger.info('aggregator_handler', `Found direct link to ATS: ${directAtsLink}`);
            break;
          } catch {}
        }

        // Check 2: Aggregator external apply redirect link (e.g. LinkedIn /jobs/view/externalApply/...)
        if (effectiveUrl && AGGREGATOR_REDIRECT_REGEX.test(effectiveUrl)) {
          try {
            redirectLink = new URL(effectiveUrl, page.url()).href;
          } catch {}
        }

        // Check 3: In-page anchor (e.g. href="#application_form", href="#app", href="#apply")
        if (href && (href.startsWith('#') || href.includes('#apply') || href.includes('#grnhse') || href.includes('#application'))) {
          inPageAnchorTarget = el;
        }

        // Check 4: Apply Button / Link with matching text or attributes
        const hasApplyText = APPLY_TEXT_REGEX.test(text) || APPLY_TEXT_REGEX.test(ariaLabel) || APPLY_TEXT_REGEX.test(title);
        const hasApplyAttributes = /apply/i.test(allAttributesText);

        if ((hasApplyText || hasApplyAttributes) && !bestClickTarget) {
          bestClickTarget = el;
        }
      } catch {}
    }

    // ─── Direct Navigation if ATS URL found ─────────────────────────────────
    if (directAtsLink) {
      await logger.info('aggregator_handler', `Navigating directly to ATS URL: ${directAtsLink}`);
      await page.goto(directAtsLink, { waitUntil: 'domcontentloaded', timeout: 25000 });
      return true;
    }

    // ─── Direct Navigation to Aggregator Redirect URL ────────────────────────
    if (redirectLink) {
      await logger.info('aggregator_handler', `Following aggregator redirect URL directly: ${redirectLink}`);
      try {
        await page.goto(redirectLink, { waitUntil: 'domcontentloaded', timeout: 25000 });
        return true;
      } catch (err: any) {
        await logger.warn('aggregator_handler', `Direct redirect navigation failed, falling back to click: ${err.message}`);
      }
    }

    // ─── In-page Anchor Scroll ──────────────────────────────────────────────
    if (inPageAnchorTarget) {
      try {
        await logger.info('aggregator_handler', 'Clicking in-page Apply anchor...');
        await inPageAnchorTarget.scrollIntoViewIfNeeded().catch(() => {});
        await inPageAnchorTarget.click().catch(() => inPageAnchorTarget.evaluate((n: HTMLElement) => n.click()));
        await page.waitForTimeout(1500);
        return true;
      } catch {}
    }

    // ─── Click Candidate Button & Handle New Tabs / Modals ───────────────────
    if (bestClickTarget) {
      try {
        await logger.info('aggregator_handler', 'Clicking candidate Apply button...');
        await bestClickTarget.scrollIntoViewIfNeeded().catch(() => {});

        const context = page.context();

        // Helper to click resiliently (normal -> force -> DOM evaluate)
        const performClick = async (target: any) => {
          try {
            await target.click({ timeout: 3000 });
          } catch (clickErr: any) {
            await logger.info('aggregator_handler', `Standard click blocked or timed out. Retrying with force click...`);
            try {
              await target.click({ force: true, timeout: 3000 });
            } catch {
              await logger.info('aggregator_handler', 'Force click intercepted. Falling back to native DOM click...');
              await target.evaluate((node: HTMLElement) => {
                node.scrollIntoView({ block: 'center' });
                node.click();
              });
            }
          }
        };

        // Listen for new tab or top-level navigation while executing click
        const pagePromise = context.waitForEvent('page', { timeout: 10000 }).catch(() => null);
        const navPromise = page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 10000 }).catch(() => null);

        await performClick(bestClickTarget);

        let newPage = await Promise.race([pagePromise, navPromise.then(() => null)]);

        // Check if context has any new pages that were opened
        if (!newPage) {
          const allPages = context.pages();
          if (allPages.length > 1) {
            const candidateNewPage = allPages[allPages.length - 1];
            if (candidateNewPage !== page) {
              newPage = candidateNewPage;
            }
          }
        }

        if (newPage) {
          await logger.info('aggregator_handler', 'Apply button opened a new tab. Switching to new tab...');
          await newPage.waitForLoadState('domcontentloaded').catch(() => {});
          (browser as any)._page = newPage;
          await page.close().catch(() => {});
          return true;
        }

        // Check if an off-site modal opened (like LinkedIn sign-in / offsite modal)
        await page.waitForTimeout(1500);
        const modalOffsiteSelector = 'div[role="dialog"] a[href*="externalApply"], .sign-up-modal a[href*="externalApply"], a[data-tracking-control-name*="apply-link-offsite"], a[data-tracking-control-name*="apply"], .modal__dialog a[href], .sign-up-modal a[href]';
        const modalOffsiteLinks = await page.$$(modalOffsiteSelector).catch(() => []);

        for (const modalLink of modalOffsiteLinks) {
          const offsiteHref = await modalLink.getAttribute('href').catch(() => null);
          if (offsiteHref && (offsiteHref.includes('http') || offsiteHref.startsWith('/'))) {
            const absoluteOffsite = new URL(offsiteHref, page.url()).href;
            await logger.info('aggregator_handler', `Found offsite apply link inside modal: ${absoluteOffsite}`);
            await page.goto(absoluteOffsite, { waitUntil: 'domcontentloaded', timeout: 25000 });
            return true;
          }
        }

        const newUrl = browser.page.url();
        if (newUrl !== currentUrl) {
          await logger.info('aggregator_handler', `Navigation complete. Current URL: ${newUrl}`);
          return true;
        }
      } catch (err: any) {
        await logger.warn('aggregator_handler', `Failed to click Apply button: ${err.message}`);
      }
    }

    await logger.warn('aggregator_handler', 'No Apply button or direct link could be followed on this page.');
    return false;
  }
}
