/**
 * worker/src/obstruction/safe-interact.ts
 *
 * safeInteract / safeClick — high-level interaction wrapper that validates
 * target actionability, performs scroll recovery, handles obstruction detection
 * and safe modal recovery, and respects security/CAPTCHA/login boundaries.
 */

import { Locator, Page } from 'playwright';
import {
  InteractTarget,
  ObstructionDismissalAction,
  ObstructionType,
  PageOrFrame,
  RecoveryResult,
  SafeInteractOptions,
  SafeInteractResult,
} from './types';
import { UIObstructionDetector } from './detector';
import { UIObstructionResolver } from './resolver';
import { ExecutionLogger } from '../execution-logger';

export async function safeClick(
  pageOrFrame: PageOrFrame,
  target: InteractTarget,
  options?: SafeInteractOptions,
  logger?: ExecutionLogger
): Promise<SafeInteractResult> {
  return safeInteract(
    pageOrFrame,
    target,
    async (loc) => {
      await loc.click({ timeout: options?.timeoutMs ?? 4000 });
    },
    { actionName: 'click', ...options },
    logger
  );
}

export async function safeInteract(
  pageOrFrame: PageOrFrame,
  target: InteractTarget,
  action: (locator: Locator) => Promise<void>,
  options?: SafeInteractOptions,
  logger?: ExecutionLogger
): Promise<SafeInteractResult> {
  const actionName = options?.actionName || 'interact';
  const timeoutMs = options?.timeoutMs || 4000;
  const maxAttempts = options?.maxRecoveryAttempts || 3;
  const allowForce = options?.allowForceFallback ?? false;

  // Resolve locator
  const locator: Locator =
    typeof target === 'string' ? pageOrFrame.locator(target).first() : target.first();

  // ─── Phase 1: Fast Path ───────────────────────────────────────────────────
  try {
    const initialCheck = await UIObstructionDetector.checkActionability(pageOrFrame, locator);
    if (initialCheck.exists && initialCheck.visible && initialCheck.enabled && !initialCheck.isObstructed) {
      await action(locator);
      return {
        success: true,
        actionPerformed: actionName,
        recoveryPerformed: false,
        obstructionType: ObstructionType.NONE,
        recoveryAction: ObstructionDismissalAction.NONE,
        forcedUsed: false,
      };
    }
  } catch {
    // Fast path action failed — escalate to obstruction detection & recovery
  }

  // ─── Phase 2: Scroll Recovery ─────────────────────────────────────────────
  const isNowActionableAfterScroll = await UIObstructionResolver.recoverScrollPosition(
    pageOrFrame,
    locator,
    options?.scrollAttempts || 3
  );

  if (isNowActionableAfterScroll) {
    try {
      await action(locator);
      return {
        success: true,
        actionPerformed: actionName,
        recoveryPerformed: true,
        obstructionType: ObstructionType.NONE,
        recoveryAction: ObstructionDismissalAction.NONE,
        forcedUsed: false,
      };
    } catch {
      // Continue to full obstruction detection
    }
  }

  // ─── Phase 3: Obstruction Detection & Classification ──────────────────────
  const obstruction = await UIObstructionDetector.detectObstruction(pageOrFrame, locator);
  const type = obstruction.classification.type;

  // ─── Phase 4: Strict Security & Auth Boundaries (NEVER BYPASS) ────────────
  if (
    type === ObstructionType.CAPTCHA ||
    type === ObstructionType.BOT_CHALLENGE ||
    type === ObstructionType.SECURITY_CHALLENGE
  ) {
    const reasonCode =
      type === ObstructionType.CAPTCHA
        ? 'APPLICATION_BLOCKED_BY_CAPTCHA'
        : type === ObstructionType.BOT_CHALLENGE
        ? 'APPLICATION_BLOCKED_BY_BOT_CHALLENGE'
        : 'APPLICATION_BLOCKED_BY_SECURITY_CHALLENGE';

    if (logger) {
      await logger.warn(
        'security_challenge_detected',
        `Application interaction blocked by ${type}. Halting automation without attempting bypass.`,
        { obstructionType: type, reason: obstruction.classification.reason }
      );
    }

    return {
      success: false,
      actionPerformed: actionName,
      recoveryPerformed: false,
      obstructionType: type,
      recoveryAction: ObstructionDismissalAction.NONE,
      forcedUsed: false,
      failureReason: reasonCode,
      failureDetails: obstruction.classification.reason,
    };
  }

  if (type === ObstructionType.LOGIN_MODAL || type === ObstructionType.AUTHENTICATION_REQUIRED) {
    if (logger) {
      await logger.warn(
        'login_required_detected',
        `Application interaction blocked by candidate login/authentication wall.`,
        { obstructionType: type, reason: obstruction.classification.reason }
      );
    }

    return {
      success: false,
      actionPerformed: actionName,
      recoveryPerformed: false,
      obstructionType: type,
      recoveryAction: ObstructionDismissalAction.NONE,
      forcedUsed: false,
      failureReason: 'APPLICATION_BLOCKED_BY_LOGIN',
      failureDetails: obstruction.classification.reason,
    };
  }

  // ─── Phase 5: Safe Modal Recovery Execution ───────────────────────────────
  let recoveryResult: RecoveryResult = {
    success: false,
    actionTaken: ObstructionDismissalAction.NONE,
    attemptsCount: 0,
    obstructionType: type,
    finalActionable: false,
  };

  if (obstruction.detected && obstruction.classification.isSafeToDismiss) {
    recoveryResult = await UIObstructionResolver.resolveObstruction(
      pageOrFrame,
      locator,
      obstruction,
      logger,
      maxAttempts
    );
  }

  // ─── Phase 6: Post-Recovery Interaction ───────────────────────────────────
  if (recoveryResult.finalActionable) {
    try {
      await action(locator);
      return {
        success: true,
        actionPerformed: actionName,
        recoveryPerformed: true,
        obstructionType: type,
        recoveryAction: recoveryResult.actionTaken,
        forcedUsed: false,
      };
    } catch {
      // Continue to force fallback if configured
    }
  }

  // ─── Phase 7: Controlled Force Interaction Fallback ───────────────────────
  // Used only when target identity is high confidence, visible, no security blockers exist
  if (allowForce) {
    try {
      const isVisible = await locator.isVisible().catch(() => false);
      if (isVisible) {
        if (logger) {
          await logger.info('forced_interaction_fallback', 'Used forced interaction fallback after actionability failure.');
        }

        if (actionName === 'click') {
          await locator.click({ force: true, timeout: timeoutMs });
        } else {
          await action(locator);
        }

        return {
          success: true,
          actionPerformed: actionName,
          recoveryPerformed: recoveryResult.attemptsCount > 0,
          obstructionType: type,
          recoveryAction: ObstructionDismissalAction.FORCE_INTERACTION,
          forcedUsed: true,
        };
      }
    } catch (err: any) {
      if (logger) {
        await logger.warn('forced_interaction_failed', `Forced interaction failed: ${err.message}`);
      }
    }
  }

  // ─── Phase 8: Interaction Failure Reporting ───────────────────────────────
  const finalReason =
    type === ObstructionType.UNKNOWN_MODAL || type === ObstructionType.UNKNOWN_OVERLAY
      ? 'APPLICATION_BLOCKED_BY_UNKNOWN_UI'
      : type === ObstructionType.MARKETING_MODAL
      ? 'APPLICATION_BLOCKED_BY_MARKETING_MODAL'
      : type === ObstructionType.COOKIE_BANNER
      ? 'APPLICATION_BLOCKED_BY_COOKIE_BANNER'
      : type !== ObstructionType.NONE
      ? 'APPLICATION_BLOCKED_BY_MODAL'
      : 'APPLICATION_FOUND_BUT_NOT_ACTIONABLE';

  return {
    success: false,
    actionPerformed: actionName,
    recoveryPerformed: recoveryResult.attemptsCount > 0,
    obstructionType: type,
    recoveryAction: recoveryResult.actionTaken,
    forcedUsed: false,
    failureReason: finalReason,
    failureDetails: `Control could not be interacted with (${finalReason}).`,
  };
}
