/**
 * worker/src/obstruction/detector.ts
 *
 * UI Obstruction Detector — checks actionability of target controls,
 * performs browser-side hit testing via document.elementFromPoint,
 * detects intercepting overlays, dialogs, and focus-stealing elements.
 */

import { Frame, Locator, Page } from 'playwright';
import {
  ElementHitTestInfo,
  ObstructionDetectionResult,
  ObstructionType,
  PageOrFrame,
  TargetActionabilityResult,
} from './types';
import { UIObstructionClassifier } from './classifier';

export class UIObstructionDetector {
  /**
   * Evaluates whether a target element is genuinely actionable and unobstructed.
   * If obstructed, inspects the intercepting DOM element and modal container.
   */
  static async checkActionability(
    pageOrFrame: PageOrFrame,
    target: any
  ): Promise<TargetActionabilityResult> {
    try {
      const isLocator = typeof target?.count === 'function';
      const count = isLocator ? await target.count().catch(() => 0) : 1;
      if (count === 0) {
        return {
          exists: false,
          visible: false,
          enabled: false,
          inViewport: false,
          isObstructed: false,
        };
      }

      const firstTarget = typeof target?.first === 'function' ? target.first() : target;
      const isVisible = await firstTarget.isVisible().catch(() => false);
      const isEnabled = await firstTarget.isEnabled().catch(() => false);

      if (!isVisible) {
        return {
          exists: true,
          visible: false,
          enabled: isEnabled,
          inViewport: false,
          isObstructed: false,
        };
      }

      // Check bounding box
      const box = await firstTarget.boundingBox().catch(() => null);
      if (!box || box.width <= 0 || box.height <= 0) {
        return {
          exists: true,
          visible: false,
          enabled: isEnabled,
          inViewport: false,
          isObstructed: false,
        };
      }

      // Browser-side hit testing via elementFromPoint
      const hitTestEvaluation = await firstTarget.evaluate((element: HTMLElement) => {
        const rect = element.getBoundingClientRect();
        const isInViewport =
          rect.top < window.innerHeight &&
          rect.bottom > 0 &&
          rect.left < window.innerWidth &&
          rect.right > 0;

        if (!isInViewport) {
          return {
            inViewport: false,
            isObstructed: false,
            targetInfo: null,
            blockingElement: null,
            modalContainer: null,
          };
        }

        // Test center point and 4 inset points
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        const points = [
          { x: centerX, y: centerY },
          { x: rect.left + Math.min(5, rect.width / 4), y: rect.top + Math.min(5, rect.height / 4) },
          { x: rect.right - Math.min(5, rect.width / 4), y: rect.bottom - Math.min(5, rect.height / 4) },
        ];

        let hitElement: Element | null = null;
        for (const pt of points) {
          if (pt.x >= 0 && pt.x <= window.innerWidth && pt.y >= 0 && pt.y <= window.innerHeight) {
            const hit = document.elementFromPoint(pt.x, pt.y);
            if (hit) {
              hitElement = hit;
              break;
            }
          }
        }

        const extractInfo = (el: Element | null): any => {
          if (!el) return null;
          const htmlEl = el as HTMLElement;
          const style = window.getComputedStyle(htmlEl);
          const r = htmlEl.getBoundingClientRect();
          return {
            tag: htmlEl.tagName.toLowerCase(),
            role: htmlEl.getAttribute('role'),
            id: htmlEl.id || null,
            className: htmlEl.className && typeof htmlEl.className === 'string' ? htmlEl.className : null,
            text: (htmlEl.innerText || htmlEl.textContent || '').trim().slice(0, 300),
            zIndex: parseInt(style.zIndex, 10) || 0,
            position: style.position || 'static',
            opacity: parseFloat(style.opacity) || 1,
            pointerEvents: style.pointerEvents || 'auto',
            ariaModal: htmlEl.getAttribute('aria-modal') === 'true',
            isDialog: htmlEl.tagName.toLowerCase() === 'dialog' || htmlEl.getAttribute('role') === 'dialog',
            isInViewport: r.top < window.innerHeight && r.bottom > 0 && r.left < window.innerWidth && r.right > 0,
            boundingBox: { x: r.x, y: r.y, width: r.width, height: r.height },
          };
        };

        const targetInfo = extractInfo(element);

        // Check if hitElement is target itself, a descendant of target, or an ancestor containing target
        const isSelfOrDescendant = hitElement ? (hitElement === element || element.contains(hitElement)) : true;
        const isSelfOrAncestor = hitElement ? (hitElement.contains(element)) : true;
        const isDirectHit = isSelfOrDescendant || isSelfOrAncestor;

        if (!hitElement || isDirectHit) {
          return {
            inViewport: true,
            isObstructed: false,
            targetInfo,
            blockingElement: null,
            modalContainer: null,
          };
        }

        // Hit element is physically different! Identify blocking element & modal container
        const blockingInfo = extractInfo(hitElement);

        // Find closest modal/dialog container
        let modalEl: Element | null = hitElement.closest(
          '[role="dialog"], [aria-modal="true"], dialog, .modal, .modal-dialog, .popup, [class*="modal" i], [class*="dialog" i], [class*="overlay" i], [class*="backdrop" i], [id*="modal" i]'
        );

        // If no modal class, check for fixed full-screen backdrops
        if (!modalEl) {
          let curr: Element | null = hitElement;
          while (curr && curr !== document.body && curr !== document.documentElement) {
            const cs = window.getComputedStyle(curr);
            const z = parseInt(cs.zIndex, 10) || 0;
            if ((cs.position === 'fixed' || cs.position === 'absolute') && (z > 10 || cs.pointerEvents === 'all')) {
              modalEl = curr;
              break;
            }
            curr = curr.parentElement;
          }
        }

        const modalContainer = modalEl ? extractInfo(modalEl) : null;

        return {
          inViewport: true,
          isObstructed: true,
          targetInfo,
          blockingElement: blockingInfo,
          modalContainer,
        };
      });

      return {
        exists: true,
        visible: true,
        enabled: isEnabled,
        inViewport: hitTestEvaluation.inViewport,
        isObstructed: hitTestEvaluation.isObstructed,
        targetInfo: hitTestEvaluation.targetInfo,
        blockingElement: hitTestEvaluation.blockingElement,
        modalContainer: hitTestEvaluation.modalContainer,
      };
    } catch {
      return {
        exists: false,
        visible: false,
        enabled: false,
        inViewport: false,
        isObstructed: false,
      };
    }
  }

  /**
   * Comprehensive detection of obstruction on a target or across the current page.
   */
  static async detectObstruction(
    pageOrFrame: PageOrFrame,
    target?: Locator
  ): Promise<ObstructionDetectionResult> {
    let actionability: TargetActionabilityResult;

    if (target) {
      actionability = await this.checkActionability(pageOrFrame, target);
    } else {
      actionability = {
        exists: true,
        visible: true,
        enabled: true,
        inViewport: true,
        isObstructed: false,
      };
    }

    // Scan for any active modal dialogs, cookie banners, or security challenges on the page
    const pageScan = await this.scanPageModalElements(pageOrFrame);

    const hasObstruction = actionability.isObstructed || pageScan.hasActiveModal;
    const blockingElement = actionability.blockingElement || pageScan.activeElementInfo;
    const modalContainer = actionability.modalContainer || pageScan.activeModalInfo;

    const classification = UIObstructionClassifier.classify({
      blockingElement,
      modalContainer,
      pageText: pageScan.pageText,
      hasIframes: pageScan.hasIframes,
      iframeSources: pageScan.iframeSources,
    });

    return {
      detected: hasObstruction && classification.type !== ObstructionType.NONE,
      classification,
      targetActionability: actionability,
      blockingElement,
      modalContainer,
      closeControlFound: pageScan.hasCloseControl,
    };
  }

  /**
   * Scans DOM for visible active modal dialogs, banners, and security frames.
   */
  private static async scanPageModalElements(pageOrFrame: PageOrFrame): Promise<{
    hasActiveModal: boolean;
    activeModalInfo?: ElementHitTestInfo;
    activeElementInfo?: ElementHitTestInfo;
    hasCloseControl: boolean;
    pageText: string;
    hasIframes: boolean;
    iframeSources: string[];
  }> {
    try {
      const result = await pageOrFrame.evaluate(() => {
        const modalSelectors = [
          '[role="dialog"]:not([aria-hidden="true"])',
          '[aria-modal="true"]:not([aria-hidden="true"])',
          'dialog[open]',
          '.modal.show, .modal.in, .modal.open, .modal.is-active',
          '#onetrust-banner-sdk',
          '#onetrust-consent-sdk',
          '#onetrust-pc-sdk',
          '#usercentrics-root',
          '#didomi-host',
          '#cmp-container',
          '#CybotCookiebotDialog',
          '#cookie-law-info-bar',
          '#osano-cm-window',
          '[id*="cookie" i]:not([aria-hidden="true"])',
          '[id*="consent" i]:not([aria-hidden="true"])',
          '[class*="cookie" i]:not([aria-hidden="true"])',
          '[class*="consent" i]:not([aria-hidden="true"])',
          '[class*="privacy" i]:not([aria-hidden="true"])',
          '[id*="privacy" i]:not([aria-hidden="true"])',
          '[aria-label*="cookie" i]',
          '[aria-label*="consent" i]',
          '[aria-label*="privacy" i]',
          '[data-testid*="cookie" i]',
          '[data-testid*="consent" i]',
          '[data-testid*="privacy" i]',
          '[data-ui*="cookie" i]',
          '[data-ui*="consent" i]',
          '[data-ui*="privacy" i]',
          'div[class*="newsletter-modal" i]',
          'div[class*="signup-modal" i]',
          'div[class*="marketing-modal" i]',
          'div[class*="job-alert-modal" i]',
          'div[class*="sign-in-modal" i]',
          'div[class*="contextual-sign-in" i]',
          'div[class*="signin-modal" i]',
          '[data-tracking-control-name*="conversion-modal" i]',
          '[data-tracking-control-name*="sign-in" i]',
        ];

        let activeModalEl: Element | null = null;
        for (const sel of modalSelectors) {
          const els = document.querySelectorAll(sel);
          for (const el of Array.from(els)) {
            const htmlEl = el as HTMLElement;
            const style = window.getComputedStyle(htmlEl);
            if (
              style.display !== 'none' &&
              style.visibility !== 'hidden' &&
              style.opacity !== '0' &&
              htmlEl.offsetWidth > 0 &&
              htmlEl.offsetHeight > 0
            ) {
              activeModalEl = htmlEl;
              break;
            }
          }
          if (activeModalEl) break;
        }

        // Secondary fallback for privacy/cookie banners without standard modal class names
        if (!activeModalEl) {
          const candidates = Array.from(document.querySelectorAll('div, section, aside'));
          for (const el of candidates) {
            const htmlEl = el as HTMLElement;
            const style = window.getComputedStyle(htmlEl);
            const z = parseInt(style.zIndex, 10) || 0;
            const isOverlay = (style.position === 'fixed' || style.position === 'sticky' || style.position === 'absolute') && (z >= 1 || style.bottom === '0px' || style.top === '0px');
            if (isOverlay && style.display !== 'none' && style.visibility !== 'hidden' && htmlEl.offsetWidth > 100 && htmlEl.offsetHeight > 40) {
              const text = (htmlEl.innerText || '').toLowerCase();
              if (
                text.includes('privacy is important to us') ||
                text.includes('we use cookies') ||
                (text.includes('cookie settings') && (text.includes('reject all') || text.includes('accept all')))
              ) {
                activeModalEl = htmlEl;
                break;
              }
            }
          }
        }

        const extractInfo = (el: Element | null): any => {
          if (!el) return undefined;
          const htmlEl = el as HTMLElement;
          const style = window.getComputedStyle(htmlEl);
          const r = htmlEl.getBoundingClientRect();
          return {
            tag: htmlEl.tagName.toLowerCase(),
            role: htmlEl.getAttribute('role'),
            id: htmlEl.id || null,
            className: htmlEl.className && typeof htmlEl.className === 'string' ? htmlEl.className : null,
            text: (htmlEl.innerText || htmlEl.textContent || '').trim().slice(0, 400),
            zIndex: parseInt(style.zIndex, 10) || 0,
            position: style.position || 'static',
            opacity: parseFloat(style.opacity) || 1,
            pointerEvents: style.pointerEvents || 'auto',
            ariaModal: htmlEl.getAttribute('aria-modal') === 'true',
            isDialog: htmlEl.tagName.toLowerCase() === 'dialog' || htmlEl.getAttribute('role') === 'dialog',
            isInViewport: r.top < window.innerHeight && r.bottom > 0 && r.left < window.innerWidth && r.right > 0,
            boundingBox: { x: r.x, y: r.y, width: r.width, height: r.height },
          };
        };

        // Check for close/dismiss/reject buttons in active modal
        let hasClose = false;
        if (activeModalEl) {
          const closeBtns = activeModalEl.querySelectorAll(
            'button, [role="button"], a[role="button"], input[type="button"], input[type="submit"], [aria-label*="close" i], [aria-label*="dismiss" i], [aria-label*="reject" i], [aria-label*="decline" i], [aria-label*="accept" i]'
          );
          for (const btn of Array.from(closeBtns)) {
            const text = (btn.textContent || btn.getAttribute('aria-label') || '').toLowerCase();
            if (
              /close|dismiss|no thanks|not now|maybe later|cancel|reject|decline|necessary|functional|essential|save|confirm|accept|got it|agree|continue|allow|✕|×/i.test(
                text
              )
            ) {
              hasClose = true;
              break;
            }
          }
        }

        // Gather iframe sources
        const iframes = Array.from(document.querySelectorAll('iframe'));
        const iframeSources = iframes.map((f) => f.src || '').filter(Boolean);

        return {
          hasActiveModal: !!activeModalEl,
          activeModalInfo: extractInfo(activeModalEl),
          hasCloseControl: hasClose,
          pageText: document.body?.innerText?.slice(0, 2000) || '',
          hasIframes: iframes.length > 0,
          iframeSources,
        };
      });

      return {
        hasActiveModal: result.hasActiveModal,
        activeModalInfo: result.activeModalInfo,
        activeElementInfo: result.activeModalInfo,
        hasCloseControl: result.hasCloseControl,
        pageText: result.pageText,
        hasIframes: result.hasIframes,
        iframeSources: result.iframeSources,
      };
    } catch {
      return {
        hasActiveModal: false,
        hasCloseControl: false,
        pageText: '',
        hasIframes: false,
        iframeSources: [],
      };
    }
  }
}
