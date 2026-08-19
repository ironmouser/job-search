import { BrowserSession } from '../browser-session';
import { ExecutionLogger } from '../execution-logger';
import { detectJobClosed } from '../utils/job-status-detector';
import { InterventionError, ATSPlugin } from './base-plugin';
import { InterventionReason, ATSDetectionResult, ATSPlatform } from '../types';
import { pluginRegistry } from '../registry';
import { uploadBrowserScreenshot } from '../s3';
import {
  CandidateClassification,
  classifyCandidate,
  isLegitimateApplicationDestination,
  extractApplicationUrlFromJson,
  CandidateInfo,
  ClassificationResult,
} from '../utils/destination-validator';

export interface CandidateReport {
  index: number;
  text: string;
  href: string;
  resolvedHref: string;
  ariaLabel: string;
  classification: CandidateClassification;
  accepted: boolean;
  reason: string;
}

interface ClickThroughResult {
  navigated: boolean;
  candidateReports: CandidateReport[];
}

/**
 * AggregatorHandler
 *
 * Inspects pages when the initial job URL is an aggregator (LinkedIn, Indeed, ZipRecruiter,
 * BuiltIn, etc.) or a custom company careers portal.
 *
 * Features:
 *  1. Candidate classification — every link/button is classified before following.
 *  2. Destination validation — validates the URL before handing off to ATS detection.
 *  3. Network response interception — catches dynamically generated apply URLs from XHR/fetch.
 *  4. Proper modal wait strategy — waits for modal to render rather than using fixed timeouts.
 *  5. Multi-step modal handling — dismisses auth gates and re-scans.
 *  6. Redirect URL extraction — resolves ?url= / ?redirect_url= params in tracking links.
 *  7. Structured diagnostics logging — every candidate logged with acceptance verdict.
 *  8. Failure-only screenshots — captures modal state only when no accepted candidate found.
 *  9. Embedded iframe inspection — Greenhouse, Lever, Ashby, etc.
 */
export class AggregatorHandler {
  /**
   * Scans all child iframes on the current page for embedded ATS forms.
   */
  static async detectIframeATS(
    browser: BrowserSession,
    logger: ExecutionLogger
  ): Promise<{ plugin: ATSPlugin; result: ATSDetectionResult } | null> {
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
   * Returns a ClickThroughResult with navigation status and per-candidate diagnostic reports.
   */
  static async attemptClickThrough(
    browser: BrowserSession,
    logger: ExecutionLogger,
    sessionId?: string
  ): Promise<ClickThroughResult> {
    const page = browser.page;
    const currentUrl = page.url();
    const allCandidateReports: CandidateReport[] = [];

    // ── Job closed check ──────────────────────────────────────────────────────
    const closedCheck = await detectJobClosed(browser, logger);
    if (closedCheck.isClosed) {
      throw new InterventionError(
        InterventionReason.JOB_CLOSED,
        closedCheck.reason || 'This position is no longer accepting applications or has been closed by the employer.',
        currentUrl
      );
    }

    const bodyLen = await page.evaluate(() => (document.body?.innerText ?? '').length).catch(() => 0);
    if (bodyLen < 300) {
      await logger.warn('aggregator_handler', `Page body too short (${bodyLen} chars) — may be bot-blocked. Proceeding with available content.`);
    }

    await logger.info('aggregator_handler', `Scanning page for Apply actions at ${page.url()}...`);

    // ── Pre-click: Neutralize invisible backdrop overlays ─────────────────────
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

    // ─── 1. Check JSON-LD directApply URL ──────────────────────────────────
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
        if (!rawUrl || (!rawUrl.startsWith('http://') && !rawUrl.startsWith('https://'))) continue;
        const validation = isLegitimateApplicationDestination(rawUrl, currentUrl);
        if (validation.valid) {
          await logger.info('aggregator_handler', `Found valid application URL in JSON-LD metadata: ${rawUrl} (${validation.reason})`);
          await page.goto(rawUrl, { waitUntil: 'domcontentloaded', timeout: 25000 });
          return { navigated: true, candidateReports: [] };
        } else {
          await logger.info('aggregator_handler', `JSON-LD URL rejected: ${rawUrl} — ${validation.reason}`);
        }
      }
    } catch {}

    // ─── 2. Scan pre-click DOM candidates ──────────────────────────────────
    const preClickResult = await AggregatorHandler._scanDomCandidates(browser, logger, currentUrl, allCandidateReports);
    if (preClickResult) {
      return { navigated: true, candidateReports: allCandidateReports };
    }

    // ─── 3. Find best Apply button to click ────────────────────────────────
    const APPLY_TEXT_REGEX = /\b(apply|apply now|apply for this job|apply on company (website|site)|apply on (employer|company) site|apply externally|start application|submit application|easy apply|quick apply|apply with resume|apply online)\b/i;
    const BUTTON_BLOCKLIST_REGEX = /\b(next|back|previous|save|cancel|skip|draft|login|sign in|create alert|share|report|follow|bookmark|return to search|back to search)\b/i;

    const candidateSelector = 'a, button, [role="button"], [role="link"], input[type="button"], input[type="submit"], [data-automation-id*="apply" i], [data-tracking-control-name*="apply" i], [id*="apply" i], [class*="apply" i]';
    const candidates = await page.$$(candidateSelector).catch(() => []);

    let bestClickTarget: any = null;
    let inPageAnchorTarget: any = null;

    for (const el of candidates) {
      try {
        const isVisible = await el.isVisible().catch(() => false);
        if (!isVisible) continue;

        const text = ((await el.textContent().catch(() => null)) ?? '').trim();
        const ariaLabel = (await el.getAttribute('aria-label').catch(() => null)) ?? '';
        const href = (await el.getAttribute('href').catch(() => null)) ?? '';
        const id = (await el.getAttribute('id').catch(() => null)) ?? '';
        const className = (await el.getAttribute('class').catch(() => null)) ?? '';

        if (BUTTON_BLOCKLIST_REGEX.test(text) && !APPLY_TEXT_REGEX.test(text)) continue;

        // In-page anchor
        if (href && (href.startsWith('#') || href.includes('#apply') || href.includes('#grnhse') || href.includes('#application'))) {
          inPageAnchorTarget = el;
          continue;
        }

        const hasApplyText = APPLY_TEXT_REGEX.test(text) || APPLY_TEXT_REGEX.test(ariaLabel);
        const hasApplyAttr = /apply/i.test(`${id} ${className}`);
        if ((hasApplyText || hasApplyAttr) && !bestClickTarget) {
          bestClickTarget = el;
        }
      } catch {}
    }

    // ─── 4. In-page anchor scroll ──────────────────────────────────────────
    if (inPageAnchorTarget) {
      try {
        await logger.info('aggregator_handler', 'Clicking in-page Apply anchor...');
        await inPageAnchorTarget.scrollIntoViewIfNeeded().catch(() => {});
        await inPageAnchorTarget.click().catch(() => inPageAnchorTarget.evaluate((n: HTMLElement) => n.click()));
        await page.waitForTimeout(1500);
        return { navigated: true, candidateReports: allCandidateReports };
      } catch {}
    }

    // ─── 5. Click Apply button + capture network responses + modal scan ────
    if (bestClickTarget) {
      try {
        await logger.info('aggregator_handler', 'Clicking candidate Apply button...');
        await bestClickTarget.scrollIntoViewIfNeeded().catch(() => {});

        const context = page.context();

        // ── Network interception: capture XHR/fetch responses for apply URLs ──
        let networkApplyUrl: string | null = null;
        const responseHandler = async (response: any) => {
          try {
            if (networkApplyUrl) return;
            const ct = response.headers()['content-type'] ?? '';
            if (!ct.includes('application/json')) return;
            const url = response.url() as string;
            // Only inspect API responses, not static assets
            if (!url.includes('/api/') && !url.includes('/graphql') && !url.includes('/jobs/') && !url.includes('/apply')) return;
            const body = await response.text().catch(() => '');
            const extracted = extractApplicationUrlFromJson(body);
            if (extracted) {
              const validation = isLegitimateApplicationDestination(extracted, currentUrl);
              if (validation.valid) {
                networkApplyUrl = extracted;
                await logger.info('aggregator_handler', `Network interception: captured application URL from API response: ${extracted}`);
              }
            }
          } catch {}
        };
        page.on('response', responseHandler);

        // Click helper: normal → force → DOM eval
        const performClick = async (target: any) => {
          try {
            await target.click({ timeout: 3000 });
          } catch {
            await logger.info('aggregator_handler', 'Standard click blocked. Retrying with force click...');
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

        const pagePromise = context.waitForEvent('page', { timeout: 10000 }).catch(() => null);
        const navPromise = page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 10000 }).catch(() => null);

        await performClick(bestClickTarget);

        // Check for new tab
        let newPage = await Promise.race([pagePromise, navPromise.then(() => null)]);
        if (!newPage) {
          const allPages = context.pages();
          if (allPages.length > 1) {
            const candidatePage = allPages[allPages.length - 1];
            if (candidatePage !== page) newPage = candidatePage;
          }
        }

        // Tear down network listener
        page.off('response', responseHandler);

        if (newPage) {
          await logger.info('aggregator_handler', 'Apply button opened a new tab. Switching to new tab...');
          await newPage.waitForLoadState('domcontentloaded').catch(() => {});
          (browser as any)._page = newPage;
          await page.close().catch(() => {});
          return { navigated: true, candidateReports: allCandidateReports };
        }

        // Network-intercepted URL takes priority
        if (networkApplyUrl) {
          await logger.info('aggregator_handler', `Navigating to network-intercepted application URL: ${networkApplyUrl}`);
          await page.goto(networkApplyUrl, { waitUntil: 'domcontentloaded', timeout: 25000 });
          return { navigated: true, candidateReports: allCandidateReports };
        }

        // ── Modal scan: wait for modal to appear (replaces fixed waitForTimeout) ──
        const modalAppeared = await Promise.race([
          page.waitForSelector('[role="dialog"], [aria-modal="true"], .modal, .sign-up-modal, [class*="modal"]', { timeout: 5000 }).then(() => true),
          // Also resolve quickly if URL already changed (direct navigation)
          page.waitForFunction((initial: string) => window.location.href !== initial, currentUrl, { timeout: 1000 }).then(() => false).catch(() => false),
        ]).catch(() => false);

        if (modalAppeared) {
          const modalResult = await AggregatorHandler._scanModalCandidates(
            browser, logger, currentUrl, allCandidateReports, false
          );
          if (modalResult) return { navigated: true, candidateReports: allCandidateReports };

          // Multi-step modal: if only auth/signup links found, try dismissing and re-scanning
          const onlyAuthCandidates = allCandidateReports.length > 0 &&
            allCandidateReports.every(r => !r.accepted && (r.classification === CandidateClassification.AUTH_LINK || r.classification === CandidateClassification.NAV_LINK));

          if (onlyAuthCandidates) {
            await logger.info('aggregator_handler', 'Modal appears to be an auth gate. Attempting to dismiss and re-scan...');
            await AggregatorHandler._dismissModal(page);
            // Brief stabilization wait after dismiss
            await page.waitForTimeout(800);
            const secondModalAppeared = await page.waitForSelector(
              '[role="dialog"], [aria-modal="true"], .modal, [class*="modal"]',
              { timeout: 3000 }
            ).then(() => true).catch(() => false);

            if (secondModalAppeared) {
              const secondModalResult = await AggregatorHandler._scanModalCandidates(
                browser, logger, currentUrl, allCandidateReports, true
              );
              if (secondModalResult) return { navigated: true, candidateReports: allCandidateReports };
            }
          }
        }

        // Check if URL changed (non-modal navigation)
        const newUrl = browser.page.url();
        if (newUrl !== currentUrl) {
          await logger.info('aggregator_handler', `Navigation complete. Current URL: ${newUrl}`);
          return { navigated: true, candidateReports: allCandidateReports };
        }

      } catch (err: any) {
        page.off('response', () => {}); // ensure cleanup
        await logger.warn('aggregator_handler', `Failed to click Apply button: ${err.message}`);
      }
    }

    // ─── 6. No navigation succeeded — capture failure screenshot ───────────
    if (sessionId) {
      try {
        const screenshotKey = `screenshots/diagnostics/${sessionId}_modal_failure.png`;
        const url = await uploadBrowserScreenshot(browser, screenshotKey);
        if (url) {
          await logger.info('aggregator_handler', `Diagnostic screenshot captured (no accepted candidates): ${url}`, { screenshotUrl: url });
        }
      } catch {
        // Non-fatal, best effort
      }
    }

    await logger.warn('aggregator_handler', 'No valid application destination found on this page.');
    return { navigated: false, candidateReports: allCandidateReports };
  }

  // ─── Private Helpers ──────────────────────────────────────────────────────

  /**
   * Scans DOM links (pre-click) for direct ATS or redirect URLs.
   * Returns true if navigation was triggered.
   */
  private static async _scanDomCandidates(
    browser: BrowserSession,
    logger: ExecutionLogger,
    sourceBoardUrl: string,
    reports: CandidateReport[]
  ): Promise<boolean> {
    const page = browser.page;
    const KNOWN_ATS_REGEX = /(greenhouse\.io|lever\.co|ashbyhq\.com|myworkdayjobs\.com|workday\.com|workable\.com|smartrecruiters\.com|icims\.com|taleo\.net|recruitee\.com|bamboohr\.com)/i;
    const AGGREGATOR_REDIRECT_REGEX = /(externalApply|\/apply-redirect|\/rc\/clk|\/job\/apply|\/apply\?|apply-link-offsite)/i;

    const allLinks = await page.$$('a[href]').catch(() => []);
    let directAtsLink: string | null = null;
    let redirectLink: string | null = null;
    let candidateIndex = 0;

    for (const el of allLinks) {
      try {
        const isVisible = await el.isVisible().catch(() => false);
        if (!isVisible) continue;

        const href = (await el.getAttribute('href').catch(() => null)) ?? '';
        if (!href || href.startsWith('#')) continue;

        const text = ((await el.textContent().catch(() => null)) ?? '').trim();
        const ariaLabel = (await el.getAttribute('aria-label').catch(() => null)) ?? '';
        const title = (await el.getAttribute('title').catch(() => null)) ?? '';
        const dataTracking = (await el.getAttribute('data-tracking-control-name').catch(() => null)) ?? '';
        const id = (await el.getAttribute('id').catch(() => null)) ?? '';
        const className = (await el.getAttribute('class').catch(() => null)) ?? '';

        let absoluteHref = href;
        try { absoluteHref = new URL(href, page.url()).href; } catch {}

        const result = classifyCandidate({
          text, href: absoluteHref, ariaLabel, title, dataTracking, id, className, tagName: 'a', role: ''
        }, sourceBoardUrl);

        reports.push({
          index: ++candidateIndex,
          text: text.slice(0, 80),
          href: absoluteHref,
          resolvedHref: result.resolvedHref,
          ariaLabel: ariaLabel.slice(0, 80),
          classification: result.classification,
          accepted: result.accepted,
          reason: result.reason,
        });

        if (result.accepted && result.resolvedHref) {
          if (result.classification === CandidateClassification.DIRECT_ATS_LINK || KNOWN_ATS_REGEX.test(result.resolvedHref)) {
            directAtsLink = result.resolvedHref;
            break;
          }
          if (!redirectLink && (result.classification === CandidateClassification.AGGREGATOR_REDIRECT || AGGREGATOR_REDIRECT_REGEX.test(result.resolvedHref))) {
            redirectLink = result.resolvedHref;
          }
        }
      } catch {}
    }

    // Log all candidates
    await AggregatorHandler._logCandidateReports(logger, reports, 'pre_click_dom_scan');

    if (directAtsLink) {
      await logger.info('aggregator_handler', `Navigating directly to ATS URL: ${directAtsLink}`);
      await page.goto(directAtsLink, { waitUntil: 'domcontentloaded', timeout: 25000 });
      return true;
    }

    if (redirectLink) {
      await logger.info('aggregator_handler', `Following aggregator redirect URL: ${redirectLink}`);
      try {
        await page.goto(redirectLink, { waitUntil: 'domcontentloaded', timeout: 25000 });
        return true;
      } catch (err: any) {
        await logger.warn('aggregator_handler', `Redirect navigation failed: ${err.message}`);
      }
    }

    return false;
  }

  /**
   * Scans modal dialog elements for application links and buttons.
   * Returns true if navigation was triggered.
   */
  private static async _scanModalCandidates(
    browser: BrowserSession,
    logger: ExecutionLogger,
    sourceBoardUrl: string,
    reports: CandidateReport[],
    isSecondPass: boolean
  ): Promise<boolean> {
    const page = browser.page;
    const passLabel = isSecondPass ? 'modal_scan_pass_2' : 'modal_scan_pass_1';
    const modalReports: CandidateReport[] = [];

    await logger.info('aggregator_handler', `${passLabel}: Scanning modal for application links and buttons...`);

    const modalSelector = 'div[role="dialog"], [aria-modal="true"], .sign-up-modal, [class*="modal"], .popup, [class*="dialog"]';
    const modalElements = await page.$$(modalSelector).catch(() => []);

    // Collect all links and buttons inside modals
    const elementsToCheck: any[] = [];
    for (const modal of modalElements) {
      const links = await modal.$$('a[href], button, [role="button"]').catch(() => []);
      elementsToCheck.push(...links);
    }

    // Also check tracking-attribute links outside modals (LinkedIn pattern)
    const trackingLinks = await page.$$('a[data-tracking-control-name*="apply"], a[data-tracking-control-name*="offsite"]').catch(() => []);
    elementsToCheck.push(...trackingLinks);

    let candidateIndex = reports.length;
    let targetUrl: string | null = null;
    let targetButton: any = null;

    for (const el of elementsToCheck) {
      try {
        const isVisible = await el.isVisible().catch(() => false);
        if (!isVisible) continue;

        const text = ((await el.textContent().catch(() => null)) ?? '').trim();
        const href = (await el.getAttribute('href').catch(() => null)) ?? '';
        const ariaLabel = (await el.getAttribute('aria-label').catch(() => null)) ?? '';
        const title = (await el.getAttribute('title').catch(() => null)) ?? '';
        const dataTracking = (await el.getAttribute('data-tracking-control-name').catch(() => null)) ?? '';
        const id = (await el.getAttribute('id').catch(() => null)) ?? '';
        const className = (await el.getAttribute('class').catch(() => null)) ?? '';
        const tagName = (await el.evaluate((n: Element) => n.tagName.toLowerCase()).catch(() => '')) as string;

        let absoluteHref = href;
        if (href && !href.startsWith('#')) {
          try { absoluteHref = new URL(href, page.url()).href; } catch {}
        }

        const result = classifyCandidate({
          text, href: absoluteHref, ariaLabel, title, dataTracking, id, className, tagName, role: ''
        }, sourceBoardUrl);

        const report: CandidateReport = {
          index: ++candidateIndex,
          text: text.slice(0, 80),
          href: absoluteHref,
          resolvedHref: result.resolvedHref,
          ariaLabel: ariaLabel.slice(0, 80),
          classification: result.classification,
          accepted: result.accepted,
          reason: result.reason,
        };
        modalReports.push(report);
        reports.push(report);

        if (result.accepted) {
          if (result.resolvedHref && result.resolvedHref.startsWith('http')) {
            const validation = isLegitimateApplicationDestination(result.resolvedHref, sourceBoardUrl);
            if (validation.valid && !targetUrl) {
              // Prioritize direct ATS links
              if (result.classification === CandidateClassification.DIRECT_ATS_LINK) {
                targetUrl = result.resolvedHref;
                break;
              }
              if (!targetUrl) targetUrl = result.resolvedHref;
            }
          } else if (tagName === 'button' || !result.resolvedHref) {
            // Button that triggers navigation — capture for click
            if (!targetButton) targetButton = el;
          }
        }
      } catch {}
    }

    await AggregatorHandler._logCandidateReports(logger, modalReports, passLabel);

    // Navigate to URL if found
    if (targetUrl) {
      await logger.info('aggregator_handler', `${passLabel}: Found valid application link in modal: ${targetUrl}`);
      await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 25000 });
      return true;
    }

    // Click button if found (e.g. "Apply on company site" button with no href)
    if (targetButton) {
      await logger.info('aggregator_handler', `${passLabel}: Clicking application action button in modal...`);
      const ctx = page.context();
      const tabPromise = ctx.waitForEvent('page', { timeout: 8000 }).catch(() => null);
      const navPromise = page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 8000 }).catch(() => null);
      await targetButton.click({ timeout: 3000 }).catch(() => targetButton.evaluate((n: HTMLElement) => n.click()));
      let newTab = await Promise.race([tabPromise, navPromise.then(() => null)]);

      if (!newTab) {
        const allPages = ctx.pages();
        if (allPages.length > 1 && allPages[allPages.length - 1] !== page) {
          newTab = allPages[allPages.length - 1];
        }
      }

      if (newTab) {
        await newTab.waitForLoadState('domcontentloaded').catch(() => {});
        (browser as any)._page = newTab;
        await page.close().catch(() => {});
        return true;
      }
      await page.waitForTimeout(1000);
      const newUrl = browser.page.url();
      if (newUrl !== sourceBoardUrl) return true;
    }

    return false;
  }

  /**
   * Attempts to dismiss an active modal (close button → Escape → backdrop click).
   */
  private static async _dismissModal(page: any): Promise<void> {
    // Try close button
    const closeSelectors = [
      '[aria-label="Dismiss"]', '[aria-label="Close"]', '[aria-label="close"]',
      'button.close', 'button[class*="close"]', 'button[class*="dismiss"]',
      '[data-test="modal-close"]', '.modal__close',
    ];
    for (const sel of closeSelectors) {
      const btn = await page.$(sel).catch(() => null);
      if (btn) {
        const isVisible = await btn.isVisible().catch(() => false);
        if (isVisible) {
          await btn.click({ timeout: 2000 }).catch(() => {});
          return;
        }
      }
    }
    // Try Escape key
    await page.keyboard.press('Escape').catch(() => {});
  }

  /**
   * Emits structured diagnostics log entries for a set of candidate reports.
   */
  private static async _logCandidateReports(
    logger: ExecutionLogger,
    reports: CandidateReport[],
    step: string
  ): Promise<void> {
    if (reports.length === 0) return;

    const lines: string[] = [`${step}: ${reports.length} candidate(s) evaluated`];
    for (const r of reports) {
      const verdict = r.accepted ? 'ACCEPTED' : 'REJECTED';
      lines.push(
        `  Candidate #${r.index}: [${verdict}] [${r.classification}]`,
        `    text: "${r.text || '(none)'}"`,
        `    href: ${r.href || '(none)'}`,
        r.resolvedHref !== r.href ? `    resolved: ${r.resolvedHref}` : '',
        `    reason: ${r.reason}`,
      );
    }

    await logger.info(step, lines.filter(Boolean).join('\n'), {
      totalCandidates: reports.length,
      accepted: reports.filter(r => r.accepted).length,
      rejected: reports.filter(r => !r.accepted).length,
    });
  }
}
