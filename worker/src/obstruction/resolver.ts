/**
 * worker/src/obstruction/resolver.ts
 *
 * UI Obstruction Resolver — executes a bounded, safe, user-equivalent
 * recovery strategy (Escape -> Close button -> Backdrop click) to dismiss
 * non-critical modals and restore actionability to target controls.
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
    // Frame.page() is a method; Page is already the page itself.
    const page =
      typeof (pageOrFrame as any).page === 'function'
        ? (pageOrFrame as any).page()
        : pageOrFrame;
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
          `Recovery Attempt ${attempts}: Searching for explicit Close/Dismiss/Accept controls inside obstruction...`,
          { action: 'CLOSE_BUTTON' }
        );
      }

      const closeControlClicked = await this.findAndClickCloseControl(pageOrFrame, obstruction);

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
   * Searches for and clicks the most appropriate close control.
   */
  private static async findAndClickCloseControl(
    pageOrFrame: PageOrFrame,
    obstruction: ObstructionDetectionResult
  ): Promise<boolean> {
    const isCookie = obstruction.classification.type === ObstructionType.COOKIE_BANNER;

    const closeSelectors = isCookie
      ? [
          '#onetrust-accept-btn-handler',
          'button:has-text("Accept all")',
          'button:has-text("Accept All Cookies")',
          'button:has-text("Accept Cookies")',
          'button:has-text("Accept all cookies")',
          'button:has-text("Accept")',
          'button:has-text("I agree")',
          'button:has-text("Got it")',
          'button:has-text("Allow all")',
          'button[id*="accept" i]',
          'button[class*="accept" i]',
          '[aria-label*="accept" i]',
          '[aria-label="Close"]',
          '[aria-label="Dismiss"]',
        ]
      : [
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

    for (const selector of closeSelectors) {
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
