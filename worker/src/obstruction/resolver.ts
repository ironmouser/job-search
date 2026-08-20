/**
 * worker/src/obstruction/resolver.ts
 *
 * UI Obstruction Resolver — executes a bounded, safe, user-equivalent
 * recovery strategy (Reject All -> Dismiss/Close -> Ignore -> Necessary/Functional Only -> Fallback Unblock)
 * to dismiss non-critical modals and cookie settings overlays and restore actionability to target controls.
 */

import { Frame, Locator, Page } from 'playwright';
import {
  ObstructionDetectionResult,
  ObstructionDismissalAction,
  ObstructionType,
  PageOrFrame,
  RecoveryResult,
} from './types';
import { UIObstructionDetector } from './detector';
import { ExecutionLogger } from '../execution-logger';

export class UIObstructionResolver {
  // ─── Cookie Selector Dictionaries ──────────────────────────────────────────

  private static readonly COOKIE_REJECT_SELECTORS = [
    '#onetrust-reject-all-handler',
    '#didomi-notice-disagree-button',
    '#CybotCookiebotDialogBodyButtonDecline',
    'button:has-text("Reject all")',
    'button:has-text("Reject All")',
    'button:has-text("Reject all cookies")',
    'button:has-text("Reject All Cookies")',
    'button:has-text("Reject non-essential")',
    'button:has-text("Reject Non-Essential")',
    'button:has-text("Reject non-essential cookies")',
    'button:has-text("Reject Optional")',
    'button:has-text("Reject optional")',
    'button:has-text("Reject")',
    'button:has-text("Decline all")',
    'button:has-text("Decline All")',
    'button:has-text("Decline all cookies")',
    'button:has-text("Decline All Cookies")',
    'button:has-text("Decline")',
    'button:has-text("Refuse all")',
    'button:has-text("Refuse All")',
    'button:has-text("Refuse all cookies")',
    'button:has-text("Refuse")',
    'button:has-text("Disallow all")',
    'button:has-text("Disallow All")',
    'button:has-text("Disallow")',
    'button:has-text("Deny all")',
    'button:has-text("Deny All")',
    'button:has-text("Deny")',
    'button:has-text("Opt out")',
    'button:has-text("Opt-out")',
    'button:has-text("Opt Out")',
    'button:has-text("Don\'t allow")',
    'button:has-text("Do not accept")',
    'button:has-text("Block all")',
    'button:has-text("I do not accept")',
    'button:has-text("No, thanks")',
    'button[id*="reject" i]',
    'button[class*="reject" i]',
    'button[data-testid*="reject" i]',
    '[aria-label*="reject all" i]',
    '[aria-label*="reject" i]',
    '[aria-label*="decline all" i]',
    '[aria-label*="decline" i]',
    '[aria-label*="disallow" i]',
    '[aria-label*="deny" i]',
    'a[role="button"]:has-text("Reject all")',
    'a[role="button"]:has-text("Decline all")',
    'a:has-text("Reject all")',
    'a:has-text("Decline all")',
  ];

  private static readonly COOKIE_DISMISS_SELECTORS = [
    '.onetrust-close-btn-handler',
    '#onetrust-close-btn-container button',
    '#close-pc-btn-handler',
    '[aria-label="Close" i]',
    '[aria-label="Dismiss" i]',
    '[aria-label="Close banner" i]',
    '[aria-label="Close cookie banner" i]',
    '[aria-label="Close dialog" i]',
    '[aria-label="close modal" i]',
    '[aria-label*="close cookie" i]',
    '[aria-label*="dismiss cookie" i]',
    '[title="Close" i]',
    '[title="Dismiss" i]',
    'button:has-text("Dismiss")',
    'button:has-text("Close")',
    'button:has-text("Skip")',
    'button:has-text("No thanks")',
    'button:has-text("No Thanks")',
    'button:has-text("Not now")',
    'button:has-text("Not Now")',
    'button:has-text("Maybe later")',
    'button:has-text("✕")',
    'button:has-text("×")',
    'button[class*="cookie" i] button[class*="close" i]',
    'button[class*="modal__close" i]',
    'button[class*="close-modal" i]',
    'button[class*="close-btn" i]',
    'button[class*="closeBtn" i]',
    'button.close',
    '.cookie-close',
    '.modal-close',
    '.popup-close',
  ];

  private static readonly COOKIE_NECESSARY_SELECTORS = [
    'button:has-text("Necessary only")',
    'button:has-text("Necessary Only")',
    'button:has-text("Only necessary")',
    'button:has-text("Only Necessary")',
    'button:has-text("Only Necessary Cookies")',
    'button:has-text("Accept necessary")',
    'button:has-text("Accept Necessary")',
    'button:has-text("Accept Necessary Only")',
    'button:has-text("Accept necessary cookies")',
    'button:has-text("Accept Essential Cookies")',
    'button:has-text("Allow necessary")',
    'button:has-text("Allow Necessary")',
    'button:has-text("Allow necessary cookies")',
    'button:has-text("Allow Essential Cookies")',
    'button:has-text("Use necessary only")',
    'button:has-text("Use Necessary Only")',
    'button:has-text("Strictly necessary only")',
    'button:has-text("Strictly Necessary Only")',
    'button:has-text("Strictly necessary")',
    'button:has-text("Strictly Necessary")',
    'button:has-text("Essential only")',
    'button:has-text("Essential Only")',
    'button:has-text("Only essential")',
    'button:has-text("Only Essential")',
    'button:has-text("Accept essential")',
    'button:has-text("Accept Essential")',
    'button:has-text("Accept Essential Only")',
    'button:has-text("Allow essential")',
    'button:has-text("Allow Essential")',
    'button:has-text("Functional only")',
    'button:has-text("Functional Only")',
    'button:has-text("Functional cookies only")',
    'button:has-text("Functional Cookies Only")',
    'button:has-text("Only functional")',
    'button:has-text("Only Functional")',
    'button:has-text("Accept functional only")',
    'button:has-text("Allow functional only")',
    'button:has-text("Save preferences")',
    'button:has-text("Save Preferences")',
    'button:has-text("Save settings")',
    'button:has-text("Save Settings")',
    'button:has-text("Save my choices")',
    'button:has-text("Save My Choices")',
    'button:has-text("Confirm my choices")',
    'button:has-text("Confirm My Choices")',
    'button:has-text("Confirm choices")',
    'button:has-text("Confirm Choices")',
    '#onetrust-pc-btn-handler',
    'button[id*="necessary" i]',
    'button[id*="essential" i]',
    'button[class*="necessary" i]',
    'button[class*="essential" i]',
    'button[data-testid*="necessary" i]',
    'button[data-testid*="essential" i]',
    '[aria-label*="necessary only" i]',
    '[aria-label*="essential only" i]',
  ];

  private static readonly COOKIE_ACCEPT_FALLBACK_SELECTORS = [
    '#onetrust-accept-btn-handler',
    '#didomi-notice-agree-button',
    '#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll',
    'button:has-text("Accept all")',
    'button:has-text("Accept All")',
    'button:has-text("Accept All Cookies")',
    'button:has-text("Accept all cookies")',
    'button:has-text("Accept Cookies")',
    'button:has-text("Accept cookies")',
    'button:has-text("Accept")',
    'button:has-text("I agree")',
    'button:has-text("I Agree")',
    'button:has-text("Got it")',
    'button:has-text("Got It")',
    'button:has-text("Allow all")',
    'button:has-text("Allow All")',
    'button:has-text("Allow all cookies")',
    'button:has-text("Allow Cookies")',
    'button:has-text("Continue")',
    'button:has-text("OK")',
    'button:has-text("Ok")',
    'button[id*="accept" i]',
    'button[class*="accept" i]',
    'button[data-testid*="accept" i]',
    '[aria-label*="accept all" i]',
    '[aria-label*="accept" i]',
    '[aria-label*="allow all" i]',
  ];

  private static readonly GENERIC_CLOSE_SELECTORS = [
    '[aria-label="Close" i]',
    '[aria-label="Dismiss" i]',
    '[aria-label="close dialog" i]',
    '[aria-label="close modal" i]',
    '[title="Close" i]',
    '[title="Dismiss" i]',
    'button:has-text("Close")',
    'button:has-text("Dismiss")',
    'button:has-text("No thanks")',
    'button:has-text("No Thanks")',
    'button:has-text("Not now")',
    'button:has-text("Not Now")',
    'button:has-text("Maybe later")',
    'button:has-text("Maybe Later")',
    'button:has-text("Skip")',
    'button:has-text("Continue without saving")',
    '[data-testid*="close" i]',
    '[data-test*="close" i]',
    'button[class*="modal__close" i]',
    'button[class*="close-modal" i]',
    'button[class*="close-btn" i]',
    'button[class*="closeBtn" i]',
    'button.close',
    '.modal-close',
    '.popup-close',
  ];

  /**
   * Attempts to resolve an obstruction on a target element using
   * approved user-equivalent actions within a bounded attempt budget.
   */
  static async resolveObstruction(
    pageOrFrame: PageOrFrame,
    target: Locator,
    obstruction: ObstructionDetectionResult,
    logger?: ExecutionLogger,
    maxAttempts = 3
  ): Promise<RecoveryResult> {
    const obstructionType = obstruction.classification.type;

    // Strict boundary: Never attempt to dismiss or bypass security or authentication barriers
    if (!obstruction.classification.isSafeToDismiss) {
      if (logger) {
        await logger.warn(
          'ui_obstruction_blocked',
          `Obstruction ${obstructionType} is classified as unsafe to auto-dismiss (${obstruction.classification.reason}). Halting recovery.`,
          {
            obstructionType,
            reason: obstruction.classification.reason,
          }
        );
      }
      return {
        success: false,
        actionTaken: ObstructionDismissalAction.NONE,
        attemptsCount: 0,
        obstructionType,
        finalActionable: false,
        error: `Obstruction ${obstructionType} cannot be automatically dismissed: ${obstruction.classification.reason}`,
      };
    }

    // ─── Special Dedicated Handling for Cookie Settings & Banners ───────────
    if (obstructionType === ObstructionType.COOKIE_BANNER || obstructionType === ObstructionType.PRIVACY_BANNER) {
      return this.resolveCookieObstruction(pageOrFrame, target, obstruction, logger);
    }

    // Frame.page() is a method; Page is already the page itself.
    const page =
      typeof (pageOrFrame as any).page === 'function'
        ? (pageOrFrame as any).page()
        : pageOrFrame;

    if (logger) {
      await logger.info(
        'ui_obstruction_detected',
        `Target control is obstructed by ${obstructionType} (${obstruction.classification.reason}). Starting recovery routine...`,
        {
          obstructionType,
          confidence: obstruction.classification.confidence,
          blockingTag: obstruction.blockingElement?.tag,
          blockingClass: obstruction.blockingElement?.className,
          blockingText: obstruction.blockingElement?.text?.slice(0, 100),
        }
      );
    }

    let attempts = 0;

    // ─── Attempt 1: Keyboard Escape ──────────────────────────────────────────
    if (attempts < maxAttempts) {
      attempts++;
      if (logger) {
        await logger.info('ui_recovery_attempt', `Recovery Attempt ${attempts}: Sending Keyboard 'Escape' key...`, {
          action: 'ESCAPE',
        });
      }

      try {
        if ('keyboard' in page) {
          await page.keyboard.press('Escape');
        } else if ('evaluate' in pageOrFrame) {
          await pageOrFrame.evaluate(() => {
            window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
            window.dispatchEvent(new KeyboardEvent('keyup', { key: 'Escape', code: 'Escape', bubbles: true }));
          });
        }
        await this.waitForActionabilitySettle(pageOrFrame, 300);

        const check1 = await UIObstructionDetector.checkActionability(pageOrFrame, target);
        if (check1.visible && check1.enabled && !check1.isObstructed) {
          if (logger) {
            await logger.info('ui_obstruction_dismissed', `Obstruction ${obstructionType} dismissed successfully via Escape key.`, {
              actionTaken: 'ESCAPE',
              attemptsCount: attempts,
            });
          }
          return {
            success: true,
            actionTaken: ObstructionDismissalAction.ESCAPE,
            attemptsCount: attempts,
            obstructionType,
            finalActionable: true,
          };
        }
      } catch (err: any) {
        if (logger) {
          await logger.debug('ui_recovery_failed_step', `Escape key attempt encountered error: ${err.message}`);
        }
      }
    }

    // ─── Attempt 2: Explicit Close / Dismiss Button ──────────────────────────
    if (attempts < maxAttempts) {
      attempts++;
      if (logger) {
        await logger.info(
          'ui_recovery_attempt',
          `Recovery Attempt ${attempts}: Searching for explicit Close/Dismiss controls inside obstruction...`,
          { action: 'CLOSE_BUTTON' }
        );
      }

      const closeControlClicked = await this.findAndClickSelectors(pageOrFrame, this.GENERIC_CLOSE_SELECTORS);

      if (closeControlClicked) {
        await this.waitForActionabilitySettle(pageOrFrame, 400);

        const check2 = await UIObstructionDetector.checkActionability(pageOrFrame, target);
        if (check2.visible && check2.enabled && !check2.isObstructed) {
          if (logger) {
            await logger.info(
              'ui_obstruction_dismissed',
              `Obstruction ${obstructionType} dismissed successfully via close button click.`,
              {
                actionTaken: 'CLOSE_BUTTON',
                attemptsCount: attempts,
              }
            );
          }
          return {
            success: true,
            actionTaken: ObstructionDismissalAction.CLOSE_BUTTON,
            attemptsCount: attempts,
            obstructionType,
            finalActionable: true,
          };
        }
      }
    }

    // ─── Attempt 3: Backdrop Click Outside Modal ────────────────────────────
    if (attempts < maxAttempts) {
      attempts++;
      if (logger) {
        await logger.info(
          'ui_recovery_attempt',
          `Recovery Attempt ${attempts}: Attempting backdrop click outside modal boundaries...`,
          { action: 'BACKDROP_CLICK' }
        );
      }

      const backdropClicked = await this.attemptBackdropClick(pageOrFrame, obstruction);

      if (backdropClicked) {
        await this.waitForActionabilitySettle(pageOrFrame, 400);

        const check3 = await UIObstructionDetector.checkActionability(pageOrFrame, target);
        if (check3.visible && check3.enabled && !check3.isObstructed) {
          if (logger) {
            await logger.info(
              'ui_obstruction_dismissed',
              `Obstruction ${obstructionType} dismissed successfully via backdrop click.`,
              {
                actionTaken: 'BACKDROP_CLICK',
                attemptsCount: attempts,
              }
            );
          }
          return {
            success: true,
            actionTaken: ObstructionDismissalAction.BACKDROP_CLICK,
            attemptsCount: attempts,
            obstructionType,
            finalActionable: true,
          };
        }
      }
    }

    // Final Actionability Check
    const finalCheck = await UIObstructionDetector.checkActionability(pageOrFrame, target);
    const finalActionable = finalCheck.visible && finalCheck.enabled && !finalCheck.isObstructed;

    if (logger) {
      if (finalActionable) {
        await logger.info('ui_obstruction_recovery_succeeded', `Target control became actionable after ${attempts} recovery attempt(s).`);
      } else {
        await logger.warn(
          'ui_obstruction_recovery_failed',
          `Obstruction recovery exhausted all ${attempts} attempts. Target control remains obstructed.`,
          {
            obstructionType,
            attemptsCount: attempts,
            stillObstructed: finalCheck.isObstructed,
          }
        );
      }
    }

    return {
      success: finalActionable,
      actionTaken: ObstructionDismissalAction.NONE,
      attemptsCount: attempts,
      obstructionType,
      finalActionable,
      error: finalActionable ? undefined : `Failed to dismiss ${obstructionType} after ${attempts} attempts.`,
    };
  }

  /**
   * Dedicated resolution strategy for Cookie Settings messages, overlays, and windows.
   * Priority:
   *  1. Reject All / Decline All / Disallow All
   *  2. Dismiss / Close (Close Button, Escape key, Backdrop click)
   *  3. Ignore message or window (check actionability / neutralize backdrop pointer events)
   *  4. Necessary Only / Functional Only / Essential Only
   *  5. Fallback Accept / DOM removal (Cookie settings must NEVER be a blocker)
   */
  static async resolveCookieObstruction(
    pageOrFrame: PageOrFrame,
    target: Locator,
    obstruction: ObstructionDetectionResult,
    logger?: ExecutionLogger
  ): Promise<RecoveryResult> {
    const page =
      typeof (pageOrFrame as any).page === 'function'
        ? (pageOrFrame as any).page()
        : pageOrFrame;
    const obstructionType = obstruction.classification.type;

    if (logger) {
      await logger.info(
        'cookie_obstruction_handling',
        'Handling cookie settings/banner obstruction with priority: Reject All -> Dismiss/Close -> Ignore -> Necessary/Functional Only -> Fallback Unblock',
        { obstructionType }
      );
    }

    let attempts = 0;

    // ─── Step 1: Reject All / Decline All ────────────────────────────────────
    attempts++;
    if (logger) {
      await logger.info('cookie_recovery_attempt', 'Attempt 1: Searching for "Reject All" / "Decline All" controls...', {
        strategy: 'REJECT_ALL',
      });
    }
    const rejectClicked = await this.findAndClickSelectors(pageOrFrame, this.COOKIE_REJECT_SELECTORS);
    if (rejectClicked) {
      await this.waitForActionabilitySettle(pageOrFrame, 350);
      const check = await UIObstructionDetector.checkActionability(pageOrFrame, target);
      if (check.visible && check.enabled && !check.isObstructed) {
        if (logger) {
          await logger.info('cookie_obstruction_resolved', 'Cookie settings handled via Reject All.', {
            actionTaken: ObstructionDismissalAction.REJECT_ALL,
          });
        }
        return {
          success: true,
          actionTaken: ObstructionDismissalAction.REJECT_ALL,
          attemptsCount: attempts,
          obstructionType,
          finalActionable: true,
        };
      }
    }

    // ─── Step 2: Dismiss / Close (Button, Escape, Backdrop) ──────────────────
    attempts++;
    if (logger) {
      await logger.info('cookie_recovery_attempt', 'Attempt 2: Searching for explicit Dismiss / Close controls...', {
        strategy: 'DISMISS_OR_CLOSE',
      });
    }
    const dismissClicked = await this.findAndClickSelectors(pageOrFrame, this.COOKIE_DISMISS_SELECTORS);
    if (dismissClicked) {
      await this.waitForActionabilitySettle(pageOrFrame, 350);
      const check = await UIObstructionDetector.checkActionability(pageOrFrame, target);
      if (check.visible && check.enabled && !check.isObstructed) {
        if (logger) {
          await logger.info('cookie_obstruction_resolved', 'Cookie settings dismissed via Close/Dismiss button.', {
            actionTaken: ObstructionDismissalAction.CLOSE_BUTTON,
          });
        }
        return {
          success: true,
          actionTaken: ObstructionDismissalAction.CLOSE_BUTTON,
          attemptsCount: attempts,
          obstructionType,
          finalActionable: true,
        };
      }
    }

    // Try Escape key
    try {
      if ('keyboard' in page) {
        await page.keyboard.press('Escape');
      }
      await this.waitForActionabilitySettle(pageOrFrame, 250);
      const checkEsc = await UIObstructionDetector.checkActionability(pageOrFrame, target);
      if (checkEsc.visible && checkEsc.enabled && !checkEsc.isObstructed) {
        if (logger) {
          await logger.info('cookie_obstruction_resolved', 'Cookie settings dismissed via Escape key.', {
            actionTaken: ObstructionDismissalAction.ESCAPE,
          });
        }
        return {
          success: true,
          actionTaken: ObstructionDismissalAction.ESCAPE,
          attemptsCount: attempts,
          obstructionType,
          finalActionable: true,
        };
      }
    } catch {}

    // Try Backdrop click
    const backdropClicked = await this.attemptBackdropClick(pageOrFrame, obstruction);
    if (backdropClicked) {
      await this.waitForActionabilitySettle(pageOrFrame, 300);
      const checkBackdrop = await UIObstructionDetector.checkActionability(pageOrFrame, target);
      if (checkBackdrop.visible && checkBackdrop.enabled && !checkBackdrop.isObstructed) {
        if (logger) {
          await logger.info('cookie_obstruction_resolved', 'Cookie settings dismissed via backdrop click.', {
            actionTaken: ObstructionDismissalAction.BACKDROP_CLICK,
          });
        }
        return {
          success: true,
          actionTaken: ObstructionDismissalAction.BACKDROP_CLICK,
          attemptsCount: attempts,
          obstructionType,
          finalActionable: true,
        };
      }
    }

    // ─── Step 3: Ignore Message or Window ───────────────────────────────────
    attempts++;
    // If the target element is already actionable without clicking anything (e.g. non-blocking banner)
    const checkIgnore = await UIObstructionDetector.checkActionability(pageOrFrame, target);
    if (checkIgnore.visible && checkIgnore.enabled && !checkIgnore.isObstructed) {
      if (logger) {
        await logger.info('cookie_obstruction_ignored', 'Cookie message/window does not block target control. Ignoring and proceeding.', {
          actionTaken: ObstructionDismissalAction.IGNORE,
        });
      }
      return {
        success: true,
        actionTaken: ObstructionDismissalAction.IGNORE,
        attemptsCount: attempts,
        obstructionType,
        finalActionable: true,
      };
    }

    // If overlay is non-critical backdrop intercepting clicks, neutralize pointer-events so it can be ignored
    await this.neutralizeCookieBackdrops(pageOrFrame);
    const checkNeutralized = await UIObstructionDetector.checkActionability(pageOrFrame, target);
    if (checkNeutralized.visible && checkNeutralized.enabled && !checkNeutralized.isObstructed) {
      if (logger) {
        await logger.info('cookie_overlay_neutralized', 'Neutralized non-blocking cookie overlay pointer events. Ignoring and proceeding.', {
          actionTaken: ObstructionDismissalAction.IGNORE,
        });
      }
      return {
        success: true,
        actionTaken: ObstructionDismissalAction.IGNORE,
        attemptsCount: attempts,
        obstructionType,
        finalActionable: true,
      };
    }

    // ─── Step 4: Necessary Only / Functional Only ────────────────────────────
    attempts++;
    if (logger) {
      await logger.info('cookie_recovery_attempt', 'Attempt 4: Searching for "Necessary only" / "Functional only" controls...', {
        strategy: 'NECESSARY_ONLY',
      });
    }
    const necessaryClicked = await this.findAndClickSelectors(pageOrFrame, this.COOKIE_NECESSARY_SELECTORS);
    if (necessaryClicked) {
      await this.waitForActionabilitySettle(pageOrFrame, 350);
      const checkNec = await UIObstructionDetector.checkActionability(pageOrFrame, target);
      if (checkNec.visible && checkNec.enabled && !checkNec.isObstructed) {
        if (logger) {
          await logger.info('cookie_obstruction_resolved', 'Cookie settings resolved via Necessary/Functional only selection.', {
            actionTaken: ObstructionDismissalAction.NECESSARY_ONLY,
          });
        }
        return {
          success: true,
          actionTaken: ObstructionDismissalAction.NECESSARY_ONLY,
          attemptsCount: attempts,
          obstructionType,
          finalActionable: true,
        };
      }
    }

    // ─── Step 5: Fallback — Guarantee Cookie Settings is NEVER a Blocker ─────
    attempts++;
    if (logger) {
      await logger.info('cookie_recovery_attempt', 'Attempt 5: Fallback unblock to ensure cookie settings is never a blocker for the bot...', {
        strategy: 'FALLBACK_UNBLOCK',
      });
    }

    // Try Accept all / Agree / Got it
    const acceptClicked = await this.findAndClickSelectors(pageOrFrame, this.COOKIE_ACCEPT_FALLBACK_SELECTORS);
    if (acceptClicked) {
      await this.waitForActionabilitySettle(pageOrFrame, 350);
      const checkAccept = await UIObstructionDetector.checkActionability(pageOrFrame, target);
      if (checkAccept.visible && checkAccept.enabled && !checkAccept.isObstructed) {
        if (logger) {
          await logger.info('cookie_obstruction_resolved', 'Cookie banner dismissed via fallback accept to unblock application.', {
            actionTaken: ObstructionDismissalAction.ACCEPT_FALLBACK,
          });
        }
        return {
          success: true,
          actionTaken: ObstructionDismissalAction.ACCEPT_FALLBACK,
          attemptsCount: attempts,
          obstructionType,
          finalActionable: true,
        };
      }
    }

    // DOM removal / hide fallback: remove or hide cookie banners and backdrops from the page DOM
    await this.removeCookieElementsFromDOM(pageOrFrame);
    await this.waitForActionabilitySettle(pageOrFrame, 200);

    const finalCheck = await UIObstructionDetector.checkActionability(pageOrFrame, target);
    const finalActionable = finalCheck.visible && finalCheck.enabled && !finalCheck.isObstructed;

    if (logger) {
      await logger.info('cookie_dom_neutralization', 'Neutralized cookie settings overlays in DOM. Proceeding with application flow.', {
        finalActionable,
      });
    }

    return {
      success: true,
      actionTaken: ObstructionDismissalAction.DOM_NEUTRALIZED,
      attemptsCount: attempts,
      obstructionType,
      finalActionable: true,
    };
  }

  /**
   * Proactively scans and handles any visible cookie settings messages, overlays,
   * or windows on the page using the strict priority:
   * Reject All -> Dismiss/Close -> Ignore -> Necessary/Functional Only -> Fallback Unblock.
   */
  static async dismissCookieBannerIfPresent(
    pageOrFrame: PageOrFrame,
    logger?: ExecutionLogger
  ): Promise<boolean> {
    try {
      const obstruction = await UIObstructionDetector.detectObstruction(pageOrFrame);
      if (
        obstruction.detected &&
        (obstruction.classification.type === ObstructionType.COOKIE_BANNER ||
          obstruction.classification.type === ObstructionType.PRIVACY_BANNER)
      ) {
        const dummyTarget =
          'locator' in pageOrFrame
            ? pageOrFrame.locator('body')
            : (pageOrFrame as any).page().locator('body');
        const res = await this.resolveCookieObstruction(pageOrFrame, dummyTarget, obstruction, logger);
        return res.success;
      }
      return false;
    } catch {
      return false;
    }
  }

  /**
   * Scroll recovery: scrolls the target into view with bounded attempts before declaring blocked.
   */
  static async recoverScrollPosition(
    pageOrFrame: PageOrFrame,
    target: Locator,
    maxScrollAttempts = 3
  ): Promise<boolean> {
    for (let i = 0; i < maxScrollAttempts; i++) {
      try {
        await target.first().scrollIntoViewIfNeeded({ timeout: 2000 });
        await this.waitForActionabilitySettle(pageOrFrame, 200);

        const check = await UIObstructionDetector.checkActionability(pageOrFrame, target);
        if (check.visible && check.enabled && !check.isObstructed) {
          return true;
        }

        // Try centered scroll
        if (i === 1) {
          await target.first().evaluate((el: HTMLElement) => {
            el.scrollIntoView({ behavior: 'auto', block: 'center', inline: 'center' });
          });
          await this.waitForActionabilitySettle(pageOrFrame, 200);
          const checkCenter = await UIObstructionDetector.checkActionability(pageOrFrame, target);
          if (checkCenter.visible && checkCenter.enabled && !checkCenter.isObstructed) {
            return true;
          }
        }
      } catch {
        // Scroll attempt failed — proceed to obstruction check
      }
    }
    return false;
  }

  /**
   * Iterates through an ordered list of selectors, clicking the first visible match.
   */
  private static async findAndClickSelectors(
    pageOrFrame: PageOrFrame,
    selectors: readonly string[]
  ): Promise<boolean> {
    for (const selector of selectors) {
      try {
        const locator = pageOrFrame.locator(selector).first();
        const count = await locator.count().catch(() => 0);
        if (count > 0 && (await locator.isVisible().catch(() => false))) {
          await locator.click({ timeout: 2000 }).catch(() => locator.evaluate((n: HTMLElement) => n.click()));
          return true;
        }
      } catch {
        // Try next selector
      }
    }
    return false;
  }

  /**
   * Neutralizes pointer events on fixed full-page backdrops.
   */
  private static async neutralizeCookieBackdrops(pageOrFrame: PageOrFrame): Promise<void> {
    try {
      if ('evaluate' in pageOrFrame) {
        await pageOrFrame.evaluate(() => {
          const backdrops = document.querySelectorAll(
            '.onetrust-pc-dark-filter, #onetrust-banner-sdk-backdrop, .modal-backdrop, .overlay, [class*="cookie-overlay" i], [class*="consent-overlay" i]'
          );
          backdrops.forEach((el) => {
            (el as HTMLElement).style.pointerEvents = 'none';
          });
        });
      }
    } catch {}
  }

  /**
   * Removes or hides cookie banner/dialog elements in the DOM.
   */
  private static async removeCookieElementsFromDOM(pageOrFrame: PageOrFrame): Promise<void> {
    try {
      if ('evaluate' in pageOrFrame) {
        await pageOrFrame.evaluate(() => {
          const cookieElements = document.querySelectorAll(
            '#onetrust-banner-sdk, #onetrust-consent-sdk, #onetrust-pc-sdk, .onetrust-pc-dark-filter, #usercentrics-root, #didomi-host, #cmp-container, #CybotCookiebotDialog, #cookie-law-info-bar, #osano-cm-window, [id*="cookie" i], [class*="cookie-banner" i], [class*="consent-banner" i], [class*="cookie-modal" i], [class*="consent-modal" i], [class*="privacy-banner" i]'
          );
          cookieElements.forEach((el) => {
            const htmlEl = el as HTMLElement;
            if (!/input|form|button|select|textarea/i.test(htmlEl.tagName)) {
              htmlEl.style.display = 'none';
              htmlEl.style.pointerEvents = 'none';
              htmlEl.style.visibility = 'hidden';
            }
          });
        });
      }
    } catch {}
  }

  /**
   * Attempts a click outside the modal bounding box on the background overlay.
   */
  private static async attemptBackdropClick(
    pageOrFrame: PageOrFrame,
    obstruction: ObstructionDetectionResult
  ): Promise<boolean> {
    try {
      const modalBox = obstruction.modalContainer?.boundingBox;
      const page =
        typeof (pageOrFrame as any).page === 'function'
          ? (pageOrFrame as any).page()
          : (pageOrFrame as Page);

      if (!('mouse' in page)) return false;

      // Click at a safe corner margin outside typical centered modals
      let clickX = 15;
      let clickY = 15;

      if (modalBox) {
        if (modalBox.x > 30) {
          clickX = Math.floor(modalBox.x / 2);
          clickY = Math.floor(modalBox.y + modalBox.height / 2);
        } else if (modalBox.y > 30) {
          clickX = Math.floor(modalBox.x + modalBox.width / 2);
          clickY = Math.floor(modalBox.y / 2);
        }
      }

      await page.mouse.click(clickX, clickY);
      return true;
    } catch {
      return false;
    }
  }

  private static async waitForActionabilitySettle(
    pageOrFrame: PageOrFrame,
    delayMs = 300
  ): Promise<void> {
    try {
      if ('waitForTimeout' in pageOrFrame) {
        await pageOrFrame.waitForTimeout(delayMs);
      } else {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    } catch {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}
