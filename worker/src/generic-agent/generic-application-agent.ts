/**
 * worker/src/generic-agent/generic-application-agent.ts
 *
 * GenericApplicationAgent — autonomous agent for unknown ATS platforms and custom employer portals.
 * Coordinates page analysis, control ranking, UI obstruction recovery, actionability validation,
 * security boundary enforcement, and application transition.
 */

import { Locator, Page } from 'playwright';
import { BrowserSession } from '../browser-session';
import { ExecutionLogger } from '../execution-logger';
import {
  ATSPlatform,
  InterventionReason,
  WorkflowContext,
import { InterventionError, ATSPlugin } from '../plugins/base-plugin';

class GenericAuthHelper extends ATSPlugin {
  readonly platform = ATSPlatform.UNKNOWN;
  readonly displayName = 'Employer Portal';
  detect() { return { platform: ATSPlatform.UNKNOWN, confidence: 0, detectedFeatures: [], automationSupported: true }; }
  async prepare() {}
  async apply() {}
  async validate() { return { valid: true, issues: [] }; }
  async finalize() { return { status: 'applied' as any }; }
}
import {
  ApplicationControlCandidate,
  PageAnalysisResult,
  PageClassification,
} from './types';
import { GenericPageAnalyzer } from './page-analyzer';
import {
  UIObstructionDetector,
  UIObstructionResolver,
  ObstructionType,
  safeClick,
} from '../obstruction';

export class GenericApplicationAgent {
  private readonly MAX_INTERACTION_HOPS = 4;

  /**
   * Analyzes the current page using deterministic multi-signal inspection.
   */
  async analyzePage(page: Page, logger?: ExecutionLogger): Promise<PageAnalysisResult> {
    return GenericPageAnalyzer.analyze(page, logger);
  }

  /**
   * Discovers and ranks application control candidates on the page.
   */
  async detectApplicationControls(
    page: Page,
    logger?: ExecutionLogger
  ): Promise<ApplicationControlCandidate[]> {
    const analysis = await GenericPageAnalyzer.analyze(page, logger);
    return analysis.candidates;
  }

  /**
   * Coordinates transitioning from a job posting or landing page into the active application form.
   */
  async initiateApplication(
    browser: BrowserSession,
    context: WorkflowContext,
    logger: ExecutionLogger
  ): Promise<{ success: boolean; reachedForm: boolean }> {
    let page = browser.page;
    let hop = 0;

    while (hop < this.MAX_INTERACTION_HOPS) {
      const currentUrl = page.url();
      await logger.info('agent_analysis', `Generic Application Agent inspecting page (Hop ${hop + 1}): ${currentUrl}`);

      // 1. Analyze page structure & security boundaries
      const analysis = await GenericPageAnalyzer.analyze(page, logger);

      await logger.info('page_classified', `Page classified as: ${analysis.classification} (Confidence: ${analysis.confidence}%)`, {
        classification: analysis.classification,
        confidence: analysis.confidence,
        reasons: analysis.reasons,
      });

      // 2. Security & Auth boundary checks — MUST NOT BYPASS
      if (analysis.securityBlocker) {
        const blocker = analysis.securityBlocker;
        if (blocker.type === 'CAPTCHA') {
          await logger.warn('security_challenge', `Security challenge detected: CAPTCHA (${blocker.reason})`);
          throw new InterventionError(
            InterventionReason.APPLICATION_BLOCKED_BY_CAPTCHA,
            `This application is blocked by a CAPTCHA security challenge (${blocker.reason}). Please solve the challenge in the browser window.`,
            currentUrl
          );
        }

        if (blocker.type === 'BOT_CHALLENGE') {
          await logger.warn('security_challenge', `Security challenge detected: Bot Protection (${blocker.reason})`);
          throw new InterventionError(
            InterventionReason.APPLICATION_BLOCKED_BY_BOT_CHALLENGE,
            `This portal is protected by a bot verification system (${blocker.reason}). Please complete verification manually.`,
            currentUrl
          );
        }

        if (blocker.type === 'AUTHENTICATION_REQUIRED') {
          const email = context?.userProfile?.accountEmail || context?.userProfile?.email;
          const password = context?.userProfile?.accountPassword;

          if (email && password) {
            await logger.info('login_attempt', 'Credentials available — attempting candidate account creation / sign in...');
            try {
              const helper = new GenericAuthHelper();
              await (helper as any).checkAccountGate(page, currentUrl, 'Employer Portal', context);
              await page.waitForTimeout(2000);
              hop++;
              continue;
            } catch (authErr) {
              if (authErr instanceof InterventionError) throw authErr;
            }
          }

          await logger.warn('login_required', `Authentication required: ${blocker.reason}`);
          throw new InterventionError(
            InterventionReason.APPLICATION_BLOCKED_BY_LOGIN,
            `This employer portal requires candidate sign in or account creation to apply (${blocker.reason}).`,
            currentUrl
          );
        }
      }

      // 3. Check if we have arrived at an active application form or wizard
      if (
        analysis.classification === PageClassification.APPLICATION_FORM ||
        analysis.classification === PageClassification.APPLICATION_CONTINUATION ||
        analysis.formPresence.hasForm ||
        (analysis.formPresence.hasResumeUpload && analysis.formPresence.inputCount >= 2)
      ) {
        await logger.info('application_form_ready', 'Active application form confirmed — handing off to form filler');
        return { success: true, reachedForm: true };
      }

      // 4. If no credible application controls found
      if (!analysis.bestControl || analysis.bestControl.confidence < 45) {
        await logger.warn('application_not_found', 'No actionable application controls detected on this page');
        throw new InterventionError(
          InterventionReason.APPLICATION_NOT_FOUND,
          'Auto Apply could not find a credible "Apply" button or application form on this employer page. Please apply manually using the link above.',
          currentUrl
        );
      }

      const best = analysis.bestControl;
      await logger.info('control_selected', `Selected application control: "${best.text}" (Confidence: ${best.confidence}%, Tier: ${best.confidenceTier})`, {
        text: best.text,
        confidence: best.confidence,
        signals: best.positiveSignals,
      });

      // 5. Locate target element
      const targetLocator = await this.locateTargetElement(page, best);
      if (!targetLocator) {
        await logger.warn('control_not_found', `Could not construct locator for control "${best.text}"`);
        throw new InterventionError(
          InterventionReason.APPLICATION_FOUND_BUT_NOT_ACTIONABLE,
          `Found candidate Apply button ("${best.text}"), but could not interact with it.`,
          currentUrl
        );
      }

      // 6. Actionability & UI obstruction handling
      await targetLocator.scrollIntoViewIfNeeded().catch(() => {});

      const actionability = await UIObstructionDetector.checkActionability(page, targetLocator);
      if (actionability.isObstructed) {
        await logger.info('obstruction_detected', 'Target application control is obstructed — evaluating obstruction...');

        const obstruction = await UIObstructionDetector.detectObstruction(page);
        if (obstruction.detected) {
          const obsType = obstruction.classification.type;

          if (
            obsType === ObstructionType.CAPTCHA ||
            obsType === ObstructionType.BOT_CHALLENGE ||
            obsType === ObstructionType.SECURITY_CHALLENGE
          ) {
            throw new InterventionError(
              InterventionReason.APPLICATION_BLOCKED_BY_CAPTCHA,
              `Application control is blocked by a security challenge (${obstruction.classification.reason}).`,
              currentUrl
            );
          }

          if (obsType === ObstructionType.LOGIN_MODAL || obsType === ObstructionType.AUTHENTICATION_REQUIRED) {
            throw new InterventionError(
              InterventionReason.APPLICATION_BLOCKED_BY_LOGIN,
              `Application control is blocked by candidate login requirement (${obstruction.classification.reason}).`,
              currentUrl
            );
          }

          if (obstruction.classification.isSafeToDismiss) {
            await logger.info('obstruction_recovery', `Obstruction classified as ${obsType} (Safe to dismiss). Attempting recovery...`);
            const recovery = await UIObstructionResolver.resolveObstruction(page, targetLocator, obstruction, logger);
            if (!recovery.success) {
              await logger.warn('obstruction_recovery_failed', `Could not safely dismiss ${obsType}`);
            }
          }
        }
      }

      // 7. Interact with target control (tracking new tab or SPA navigation)
      const browserContext = page.context();
      const pagePromise = browserContext.waitForEvent('page', { timeout: 1500 }).catch(() => null);
      const navPromise = page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 2000 }).catch(() => null);

      await logger.info('initiating_application', `Clicking application control: "${best.text}"`);
      const clickResult = await safeClick(
        page,
        targetLocator,
        {
          actionName: 'apply_control_click',
          timeoutMs: 3000,
          allowForceFallback: true,
        },
        logger
      );

      if (!clickResult.success) {
        await targetLocator.evaluate((node: HTMLElement) => node.click()).catch(() => {});
      }

      // 8. Detect resulting progress
      const newPage = await Promise.race([pagePromise, navPromise.then(() => null)]);
      if (newPage) {
        await logger.info('tab_switched', 'Application opened in a new browser tab — switching context');
        await newPage.waitForLoadState('domcontentloaded').catch(() => {});
        (browser as any)._page = newPage;
        page = newPage;
      } else {
        await page.waitForTimeout(600);
      }

      hop++;
    }

    // Hand off to form filler after interaction loop
    return { success: true, reachedForm: true };
  }

  /**
   * Helper to resolve a Playwright Locator for an ApplicationControlCandidate.
   */
  private async locateTargetElement(
    page: Page,
    candidate: ApplicationControlCandidate
  ): Promise<Locator | null> {
    const textEscaped = candidate.text.replace(/["\\]/g, '\\$&');

    const selectors = [
      `button:has-text("${textEscaped}")`,
      `a:has-text("${textEscaped}")`,
      `[role="button"]:has-text("${textEscaped}")`,
      `input[type="submit"][value*="${textEscaped}" i]`,
      `input[type="button"][value*="${textEscaped}" i]`,
      `button:has-text("Apply Now")`,
      `button:has-text("Apply")`,
      `a:has-text("Apply Now")`,
      `a:has-text("Apply")`,
    ];

    for (const sel of selectors) {
      try {
        const loc = page.locator(sel).first();
        if ((await loc.count().catch(() => 0)) > 0) {
          return loc;
        }
      } catch {}
    }

    return null;
  }
}
