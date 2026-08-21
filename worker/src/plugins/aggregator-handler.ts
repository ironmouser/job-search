import { BrowserSession } from '../browser-session';
import { ExecutionLogger } from '../execution-logger';
import { detectJobClosed } from '../utils/job-status-detector';
import { InterventionError, ATSPlugin } from './base-plugin';
import { InterventionReason, ATSDetectionResult, ATSPlatform } from '../types';
import { pluginRegistry } from '../registry';
import { uploadBrowserScreenshot } from '../s3';
import {
  safeClick,
  UIObstructionDetector,
  UIObstructionResolver,
  ObstructionType,
} from '../obstruction';
import {
  CandidateClassification,
  classifyCandidate,
  isLegitimateApplicationDestination,
  extractApplicationUrlFromJson,
  extractEmbeddedScriptUrls,
  normalizeUrl,
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

interface DomDiscoveryResult {
  directUrl: string | null;
  bestClickTarget: any | null;
  inPageAnchorTarget: any | null;
}

/**
 * AggregatorHandler
 *
 * Implements a deterministic 4-phase destination discovery and application navigation flow
 * when the initial job URL is an aggregator (LinkedIn, Indeed, ZipRecruiter, BuiltIn, etc.)
 * or a custom company careers portal.
 *
 * Phases:
 *  Phase 1 — Destination Discovery: Scans links, buttons with data-url, and metadata for candidates.
 *  Phase 2 — Destination Validation: Filters out non-application targets and validates external destinations.
 *  Phase 3 — Application Navigation:
 *            - Strategy A (Priority 1): Direct navigation via page.goto(url) if a validated destination URL exists.
 *            - Strategy B (Priority 2): Click + Observe fallback if candidate is a pure button with no extractable URL.
 *  Phase 4 — ATS Detection: Landed page inspection (handled by WorkflowEngine / Registry).
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
          await logger.info('ats_detection', `Detected embedded ATS in iframe: ${match.plugin.displayName} (${frameUrl})`);
          return match;
        }
      }
    } catch {
      // Ignore frame access errors
    }
    return null;
  }

  /**
   * Discovers and navigates to the application destination on the page.
   * Returns a ClickThroughResult with navigation status and per-candidate diagnostic reports.
   */
  static async attemptClickThrough(
    browser: BrowserSession,
    logger: ExecutionLogger,
    sessionId?: string,
    visitedUrls?: Set<string>
  ): Promise<ClickThroughResult> {
    const page = browser.page;
    const currentUrl = page.url();
    const normalizedCurrentUrl = normalizeUrl(currentUrl);
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
      await logger.warn('destination_discovery', `Page body too short (${bodyLen} chars) — may be bot-blocked. Proceeding with available content.`);
    }

    await logger.info('destination_discovery', `Phase 1: Scanning page for application destinations at ${page.url()}...`);

    // ── Check for page obstructions (e.g. marketing/newsletter/cookie modals) ─
    try {
      const pageObstruction = await UIObstructionDetector.detectObstruction(page);
      if (pageObstruction.detected) {
        const type = pageObstruction.classification.type;
        if (
          type === ObstructionType.CAPTCHA ||
          type === ObstructionType.BOT_CHALLENGE ||
          type === ObstructionType.SECURITY_CHALLENGE
        ) {
          throw new InterventionError(
            InterventionReason.APPLICATION_BLOCKED_BY_CAPTCHA,
            `Application page is blocked by security challenge (${pageObstruction.classification.reason}).`,
            currentUrl
          );
        }
        if (type === ObstructionType.LOGIN_MODAL || type === ObstructionType.AUTHENTICATION_REQUIRED) {
          throw new InterventionError(
            InterventionReason.APPLICATION_BLOCKED_BY_LOGIN,
            `Application page requires candidate login (${pageObstruction.classification.reason}).`,
            currentUrl
          );
        }
        if (pageObstruction.classification.isSafeToDismiss) {
          await logger.info(
            'destination_discovery',
            `Active non-critical obstruction detected on page: ${type}. Attempting safe recovery...`
          );
          await UIObstructionResolver.resolveObstruction(page, page.locator('body'), pageObstruction, logger);
        }
      }
    } catch (err: any) {
      if (err instanceof InterventionError) throw err;
    }

    // ── Neutralize invisible backdrop overlays ────────────────────────────────
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

    // ─── 1. Check JSON-LD and page script metadata for application URLs ───────
    try {
      const scriptContents: string[] = await page.$$eval('script', (scripts) => {
        const found: string[] = [];
        for (const s of scripts) {
          const content = s.textContent || s.innerHTML || '';
          if (content && (
            content.includes('howToApply') ||
            content.includes('how_to_apply') ||
            content.includes('applyUrl') ||
            content.includes('applicationUrl') ||
            content.includes('JobPosting') ||
            content.includes('jobPostInit') ||
            content.includes('directApply') ||
            content.includes('externalApplyUrl') ||
            s.type === 'application/ld+json' ||
            s.type === 'application/json'
          )) {
            found.push(content);
          }
        }
        return found;
      }).catch(() => []);

      const candidateUrls = extractEmbeddedScriptUrls(scriptContents);

      for (const rawUrl of candidateUrls) {
        if (!rawUrl || (!rawUrl.startsWith('http://') && !rawUrl.startsWith('https://'))) continue;
        const normalizedCandidateUrl = normalizeUrl(rawUrl);

        // Convergence check: if destination URL matches current URL, do not navigate again
        if (normalizedCandidateUrl === normalizedCurrentUrl) {
          await logger.info('destination_discovery', `Script metadata canonical destination matches current page (${rawUrl}) — destination convergence reached.`);
          continue;
        }

        // Loop prevention check: if already visited in hop chain
        if (visitedUrls && visitedUrls.has(normalizedCandidateUrl)) {
          await logger.info('destination_discovery', `Script metadata URL (${rawUrl}) was already visited in this session — skipping redundant navigation.`);
          continue;
        }

        const validation = isLegitimateApplicationDestination(rawUrl, currentUrl);
        if (validation.valid) {
          await logger.info('destination_discovery', `Found valid application destination in page script metadata: ${rawUrl} (${validation.reason})`);
          await logger.info('application_navigation', `Phase 3: Direct navigation to script metadata destination: ${rawUrl}`);
          visitedUrls?.add(normalizedCandidateUrl);
          await page.goto(rawUrl, { waitUntil: 'domcontentloaded', timeout: 25000 });
          return { navigated: true, candidateReports: [] };
        } else {
          await logger.info('destination_validation', `Script metadata URL rejected: ${rawUrl} — ${validation.reason}`);
        }
      }
    } catch (err: any) {
      await logger.warn('destination_discovery', `Error evaluating script metadata: ${err?.message}`);
    }

    // ─── 2. Phase 1 & 2: Discover and validate DOM candidates ─────────────────
    const discovery = await AggregatorHandler._discoverDomCandidates(browser, logger, currentUrl, allCandidateReports);

    // ─── 3. Phase 3 Strategy A: Direct Navigation (Priority 1) ────────────────
    if (discovery.directUrl) {
      const normalizedDirect = normalizeUrl(discovery.directUrl);
      if (normalizedDirect === normalizedCurrentUrl) {
        await logger.info('destination_discovery', `Direct candidate URL matches current page (${discovery.directUrl}) — destination convergence reached.`);
      } else if (visitedUrls && visitedUrls.has(normalizedDirect)) {
        await logger.info('destination_discovery', `Direct candidate URL (${discovery.directUrl}) was already visited — skipping redirect loop.`);
      } else {
        await logger.info('application_navigation', `Phase 3: Direct navigation to accepted destination URL: ${discovery.directUrl}`);
        try {
          visitedUrls?.add(normalizedDirect);
          await page.goto(discovery.directUrl, { waitUntil: 'domcontentloaded', timeout: 25000 });
          return { navigated: true, candidateReports: allCandidateReports };
        } catch (err: any) {
          await logger.warn('application_navigation', `Direct navigation failed: ${err.message}. Falling back to click/observe...`);
        }
      }
    }

    // ─── 4. In-page anchor scroll ──────────────────────────────────────────────
    if (discovery.inPageAnchorTarget) {
      try {
        await logger.info('application_navigation', 'Phase 3: Clicking in-page Apply anchor...');
        await discovery.inPageAnchorTarget.scrollIntoViewIfNeeded().catch(() => {});
        await discovery.inPageAnchorTarget.click().catch(() => discovery.inPageAnchorTarget.evaluate((n: HTMLElement) => n.click()));
        await page.waitForTimeout(1500);
        return { navigated: true, candidateReports: allCandidateReports };
      } catch {}
    }

    // ─── 5. Phase 3 Strategy B: Click + Observe Fallback (Priority 2) ──────────
    // Only used if no usable destination URL was extracted from any candidate element
    if (discovery.bestClickTarget) {
      try {
        await logger.info('application_navigation', 'Phase 3: No direct destination URL exposed. Executing Click + Observe fallback...');
        await discovery.bestClickTarget.scrollIntoViewIfNeeded().catch(() => {});

        const context = page.context();

        // Network interception: catch dynamically generated apply URLs from API responses
        let networkApplyUrl: string | null = null;
        const responseHandler = async (response: any) => {
          try {
            if (networkApplyUrl) return;
            const ct = response.headers()['content-type'] ?? '';
            if (!ct.includes('application/json')) return;
            const url = response.url() as string;
            if (!url.includes('/api/') && !url.includes('/graphql') && !url.includes('/jobs/') && !url.includes('/apply')) return;
            const body = await response.text().catch(() => '');
            const extracted = extractApplicationUrlFromJson(body);
            if (extracted) {
              const validation = isLegitimateApplicationDestination(extracted, currentUrl);
              if (validation.valid) {
                networkApplyUrl = extracted;
                await logger.info('destination_discovery', `Network interception: captured application destination URL: ${extracted}`);
              }
            }
          } catch {}
        };
        page.on('response', responseHandler);

        // Click helper: obstruction-aware safeClick → force fallback → native DOM eval
        const performClick = async (target: any) => {
          const res = await safeClick(
            page,
            target,
            {
              timeoutMs: 4000,
              allowForceFallback: true,
              maxRecoveryAttempts: 3,
              actionName: 'apply_candidate_click',
            },
            logger
          );

          if (!res.success) {
            await target
              .evaluate((node: HTMLElement) => {
                node.scrollIntoView({ block: 'center' });
                node.click();
              })
              .catch(() => {});
          }
        };

        const pagePromise = context.waitForEvent('page', { timeout: 10000 }).catch(() => null);
        const navPromise = page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 10000 }).catch(() => null);

        await performClick(discovery.bestClickTarget);

        // Check for new popup tab
        let newPage = await Promise.race([pagePromise, navPromise.then(() => null)]);
        if (!newPage) {
          const allPages = context.pages();
          if (allPages.length > 1) {
            const candidatePage = allPages[allPages.length - 1];
            if (candidatePage !== page) newPage = candidatePage;
          }
        }

        page.off('response', responseHandler);

        if (newPage) {
          await logger.info('application_navigation', 'Apply action opened a new browser tab. Switching to new tab...');
          await newPage.waitForLoadState('domcontentloaded').catch(() => {});
          (browser as any)._page = newPage;
          await page.close().catch(() => {});
          return { navigated: true, candidateReports: allCandidateReports };
        }

        if (networkApplyUrl) {
          await logger.info('application_navigation', `Phase 3: Direct navigation to network-intercepted URL: ${networkApplyUrl}`);
          await page.goto(networkApplyUrl, { waitUntil: 'domcontentloaded', timeout: 25000 });
          return { navigated: true, candidateReports: allCandidateReports };
        }

        // Modal scan: wait for modal dialog to render
        const modalAppeared = await Promise.race([
          page.waitForSelector('[role="dialog"], [aria-modal="true"], .modal, .sign-up-modal, [class*="modal"]', { timeout: 5000 }).then(() => true),
          page.waitForFunction((initial: string) => window.location.href !== initial, currentUrl, { timeout: 1000 }).then(() => false).catch(() => false),
        ]).catch(() => false);

        if (modalAppeared) {
          const modalResult = await AggregatorHandler._scanModalCandidates(
            browser, logger, currentUrl, allCandidateReports, false
          );
          if (modalResult) return { navigated: true, candidateReports: allCandidateReports };

          // Multi-step modal: if only auth gates encountered, dismiss and re-scan
          const onlyAuthCandidates = allCandidateReports.length > 0 &&
            allCandidateReports.every(r => !r.accepted && (r.classification === CandidateClassification.AUTH_LINK || r.classification === CandidateClassification.NAV_LINK));

          if (onlyAuthCandidates) {
            await logger.info('application_navigation', 'Modal appears to be an auth gate. Attempting dismiss and re-scan...');
            await AggregatorHandler._dismissModal(page);
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

        // Check if URL changed on current page
        const newUrl = browser.page.url();
        if (newUrl !== currentUrl) {
          await logger.info('application_navigation', `Navigation complete. Landed URL: ${newUrl}`);
          return { navigated: true, candidateReports: allCandidateReports };
        }

      } catch (err: any) {
        page.off('response', () => {});
        await logger.warn('application_navigation', `Click + Observe fallback encountered error: ${err.message}`);
      }
    }

    // ─── 6. No navigation succeeded — capture diagnostic screenshot ───────────
    if (sessionId) {
      try {
        const screenshotKey = `screenshots/diagnostics/${sessionId}_destination_failure.png`;
        const url = await uploadBrowserScreenshot(browser, screenshotKey);
        if (url) {
          await logger.info('aggregator_handler', `Diagnostic screenshot captured: ${url}`, { screenshotUrl: url });
        }
      } catch {}
    }

    await logger.warn('aggregator_handler', 'Phase 1 & 2: No valid application destination found on this page.');
    return { navigated: false, candidateReports: allCandidateReports };
  }

  // ─── Private Helpers ──────────────────────────────────────────────────────

  /**
   * Phase 1 & 2: Discovers and validates all DOM candidate links, buttons, and data-url attributes.
   * Resolves the best direct navigation destination or click target.
   */
  private static async _discoverDomCandidates(
    browser: BrowserSession,
    logger: ExecutionLogger,
    sourceBoardUrl: string,
    reports: CandidateReport[]
  ): Promise<DomDiscoveryResult> {
    const APPLY_TEXT_REGEX = /\b(apply|apply now|apply for this job|apply on company (website|site)|apply on (employer|company) site|apply externally|apply directly|start application|submit application|easy apply|quick apply|apply with resume|apply online|continue to application|sign in to (easy )?apply|log in to (easy )?apply|login to (easy )?apply|sign up to (easy )?apply|register to (easy )?apply|create account to (easy )?apply|join to (easy )?apply|join now to apply)\b/i;
    const BUTTON_BLOCKLIST_REGEX = /\b(next|back|previous|save|cancel|skip|draft|create alert|share|report|follow|bookmark|return to search|back to search)\b/i;

    const candidateSelector = 'a, button, [role="button"], [role="link"], input[type="button"], input[type="submit"], [data-automation-id*="apply" i], [data-tracking-control-name*="apply" i], [id*="apply" i], [class*="apply" i], [data-url], [data-href], [data-apply-url], [data-job-url]';
    const elements = await page.$$(candidateSelector).catch(() => []);

    let directUrl: string | null = null;
    let directUrlPriority = 0; // 3: DIRECT_ATS_LINK, 2: APPLICATION_LINK, 1: AGGREGATOR_REDIRECT
    let bestClickTarget: any = null;
    let inPageAnchorTarget: any = null;
    let candidateIndex = reports.length;

    for (const el of elements) {
      try {
        const isVisible = await el.isVisible().catch(() => false);
        if (!isVisible) continue;

        const text = ((await el.textContent().catch(() => null)) ?? '').trim();
        const ariaLabel = (await el.getAttribute('aria-label').catch(() => null)) ?? '';
        const title = (await el.getAttribute('title').catch(() => null)) ?? '';
        const href = (await el.getAttribute('href').catch(() => null)) ?? '';
        const dataUrlAttr = (await el.getAttribute('data-url').catch(() => null))
          || (await el.getAttribute('data-href').catch(() => null))
          || (await el.getAttribute('data-apply-url').catch(() => null))
          || (await el.getAttribute('data-job-url').catch(() => null))
          || (await el.getAttribute('data-target-url').catch(() => null))
          || (await el.getAttribute('data-target').catch(() => null))
          || '';
        const onclick = (await el.getAttribute('onclick').catch(() => null)) ?? '';
        const dataTracking = (await el.getAttribute('data-tracking-control-name').catch(() => null)) ?? '';
        const id = (await el.getAttribute('id').catch(() => null)) ?? '';
        const className = (await el.getAttribute('class').catch(() => null)) ?? '';
        const tagName = (await el.evaluate((n: Element) => n.tagName.toLowerCase()).catch(() => '')) as string;
        const role = (await el.getAttribute('role').catch(() => null)) ?? '';

        if (BUTTON_BLOCKLIST_REGEX.test(text) && !APPLY_TEXT_REGEX.test(text)) continue;

        // In-page anchor check
        if (href && (href.startsWith('#') || href.includes('#apply') || href.includes('#grnhse') || href.includes('#application'))) {
          if (!inPageAnchorTarget) inPageAnchorTarget = el;
          continue;
        }

        let absoluteHref = href;
        if (href && !href.startsWith('#') && !href.startsWith('javascript:')) {
          try { absoluteHref = new URL(href, page.url()).href; } catch {}
        }

        let absoluteDataUrl = dataUrlAttr;
        if (dataUrlAttr && !dataUrlAttr.startsWith('#') && !dataUrlAttr.startsWith('javascript:')) {
          try { absoluteDataUrl = new URL(dataUrlAttr, page.url()).href; } catch {}
        }

        const result = classifyCandidate({
          text,
          href: absoluteHref,
          ariaLabel,
          title,
          dataTracking,
          id,
          className,
          tagName,
          role,
          dataUrl: absoluteDataUrl,
          onclick,
        }, sourceBoardUrl);

        const report: CandidateReport = {
          index: ++candidateIndex,
          text: text.slice(0, 80),
          href: absoluteHref || absoluteDataUrl,
          resolvedHref: result.resolvedHref,
          ariaLabel: ariaLabel.slice(0, 80),
          classification: result.classification,
          accepted: result.accepted,
          reason: result.reason,
        };
        reports.push(report);

        if (result.accepted) {
          // If the candidate exposes a usable external destination URL
          if (result.resolvedHref && result.resolvedHref.startsWith('http')) {
            const validation = isLegitimateApplicationDestination(result.resolvedHref, sourceBoardUrl);
            if (validation.valid) {
              let priority = 1;
              if (result.classification === CandidateClassification.DIRECT_ATS_LINK) priority = 3;
              else if (result.classification === CandidateClassification.APPLICATION_LINK) priority = 2;

              if (priority > directUrlPriority) {
                directUrl = result.resolvedHref;
                directUrlPriority = priority;
              }
            }
          } else {
            // Candidate has no extractable URL — save for Click + Observe fallback
            const hasApplyText = APPLY_TEXT_REGEX.test(text) || APPLY_TEXT_REGEX.test(ariaLabel);
            const hasApplyAttr = /apply/i.test(`${id} ${className} ${dataTracking}`);
            if ((hasApplyText || hasApplyAttr) && !bestClickTarget) {
              bestClickTarget = el;
            }
          }
        }
      } catch {}
    }

    // Log all candidate evaluations in Phase 1 / Phase 2
    await AggregatorHandler._logCandidateReports(logger, reports, 'destination_discovery');

    return { directUrl, bestClickTarget, inPageAnchorTarget };
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

    await logger.info('destination_discovery', `${passLabel}: Scanning modal for application destinations...`);

    const modalSelector = 'div[role="dialog"], [aria-modal="true"], .sign-up-modal, [class*="modal"], .popup, [class*="dialog"]';
    const modalElements = await page.$$(modalSelector).catch(() => []);

    const elementsToCheck: any[] = [];
    for (const modal of modalElements) {
      const links = await modal.$$('a, button, [role="button"], [role="link"], input[type="button"], input[type="submit"]').catch(() => []);
      elementsToCheck.push(...links);
    }

    // Check tracking-attribute links (e.g. LinkedIn offsite apply buttons)
    const trackingLinks = await page.$$('a[data-tracking-control-name*="apply"], a[data-tracking-control-name*="offsite"]').catch(() => []);
    elementsToCheck.push(...trackingLinks);

    let candidateIndex = reports.length;
    let targetUrl: string | null = null;
    let targetUrlPriority = 0;
    let targetButton: any = null;

    for (const el of elementsToCheck) {
      try {
        const isVisible = await el.isVisible().catch(() => false);
        if (!isVisible) continue;

        const text = ((await el.textContent().catch(() => null)) ?? '').trim();
        const href = (await el.getAttribute('href').catch(() => null)) ?? '';
        const dataUrlAttr = (await el.getAttribute('data-url').catch(() => null))
          || (await el.getAttribute('data-href').catch(() => null))
          || (await el.getAttribute('data-apply-url').catch(() => null))
          || '';
        const onclick = (await el.getAttribute('onclick').catch(() => null)) ?? '';
        const ariaLabel = (await el.getAttribute('aria-label').catch(() => null)) ?? '';
        const title = (await el.getAttribute('title').catch(() => null)) ?? '';
        const dataTracking = (await el.getAttribute('data-tracking-control-name').catch(() => null)) ?? '';
        const id = (await el.getAttribute('id').catch(() => null)) ?? '';
        const className = (await el.getAttribute('class').catch(() => null)) ?? '';
        const tagName = (await el.evaluate((n: Element) => n.tagName.toLowerCase()).catch(() => '')) as string;
        const role = (await el.getAttribute('role').catch(() => null)) ?? '';

        let absoluteHref = href;
        if (href && !href.startsWith('#') && !href.startsWith('javascript:')) {
          try { absoluteHref = new URL(href, page.url()).href; } catch {}
        }

        let absoluteDataUrl = dataUrlAttr;
        if (dataUrlAttr && !dataUrlAttr.startsWith('#')) {
          try { absoluteDataUrl = new URL(dataUrlAttr, page.url()).href; } catch {}
        }

        const result = classifyCandidate({
          text,
          href: absoluteHref,
          ariaLabel,
          title,
          dataTracking,
          id,
          className,
          tagName,
          role,
          dataUrl: absoluteDataUrl,
          onclick,
        }, sourceBoardUrl);

        const report: CandidateReport = {
          index: ++candidateIndex,
          text: text.slice(0, 80),
          href: absoluteHref || absoluteDataUrl,
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
            if (validation.valid) {
              let priority = 1;
              if (result.classification === CandidateClassification.DIRECT_ATS_LINK) priority = 3;
              else if (result.classification === CandidateClassification.APPLICATION_LINK) priority = 2;

              if (priority > targetUrlPriority) {
                targetUrl = result.resolvedHref;
                targetUrlPriority = priority;
              }
            }
          } else if (tagName === 'button' || !result.resolvedHref) {
            if (!targetButton) targetButton = el;
          }
        }
      } catch {}
    }

    await AggregatorHandler._logCandidateReports(logger, modalReports, passLabel);

    // Direct Navigation from modal if destination URL found
    if (targetUrl) {
      await logger.info('application_navigation', `${passLabel}: Found valid destination link in modal. Navigating directly: ${targetUrl}`);
      await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 25000 });
      return true;
    }

    // Fallback: Click button in modal if no direct URL exists
    if (targetButton) {
      await logger.info('application_navigation', `${passLabel}: Clicking application action button in modal...`);
      const ctx = page.context();
      const tabPromise = ctx.waitForEvent('page', { timeout: 8000 }).catch(() => null);
      const navPromise = page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 8000 }).catch(() => null);
      await safeClick(
        page,
        targetButton,
        { timeoutMs: 3000, allowForceFallback: true, actionName: 'modal_apply_click' },
        logger
      ).catch(() => targetButton.evaluate((n: HTMLElement) => n.click()));
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
    await page.keyboard.press('Escape').catch(() => {});
  }

  /**
   * Emits structured diagnostics log entries for candidate reports.
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
        r.resolvedHref && r.resolvedHref !== r.href ? `    resolved: ${r.resolvedHref}` : '',
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
