/**
 * worker/src/generic-agent/generic-application-agent.ts
 *
 * GenericApplicationAgent — autonomous hybrid agent for unknown ATS platforms and custom employer portals.
 *
 * Architecture:
 *  Tier 0: Strategy Memory (re-uses proven selectors/flows for known domains)
 *  Tier 1: Deterministic DOM Analysis & Candidate Ranking
 *  Tier 2: DeepSeek V4 Flash Semantic AXTree Reasoning (structured JSON actions)
 *  Tier 3: Gemini Flash-Lite Visual Multimodal Fallback (screenshot coordinate validation)
 *  Tier 4: Manual Intervention (unresolvable state, CAPTCHA, login walls)
 */

import { Locator, Page } from 'playwright';
import { BrowserSession } from '../browser-session';
import { ExecutionLogger } from '../execution-logger';
import {
  ATSPlatform,
  AutoApplyStatus,
  InterventionReason,
  WorkflowContext,
  WorkflowResult,
} from '../types';
import { InterventionError, ATSPlugin } from '../plugins/base-plugin';
import { agentConfig } from '../config';
import {
  ActionSource,
  AgentActionType,
  AgentDecision,
  AgentState,
  ApplicationControlCandidate,
  PageAnalysisResult,
  PageClassification,
} from './types';
import { GenericPageAnalyzer } from './page-analyzer';
import { AXTreeBuilder } from './axtree-builder';
import { GLMNavigator } from './glm-navigator';
import { DeepSeekNavigator } from './deepseek-navigator';
import { GeminiVisualFallback } from './gemini-visual-fallback';
import { AgentStateMachine } from './agent-state-machine';
import { AgentTelemetry } from './agent-telemetry';
import { StrategyMemory } from './strategy-memory';
import {
  UIObstructionDetector,
  UIObstructionResolver,
  ObstructionType,
  safeClick,
} from '../obstruction';

class GenericAuthHelper extends ATSPlugin {
  readonly platform = ATSPlatform.UNKNOWN;
  readonly displayName = 'Employer Portal';
  detect() { return { platform: ATSPlatform.UNKNOWN, confidence: 0, detectedFeatures: [], automationSupported: true }; }
  async prepare() {}
  async apply() {}
  async validate() { return { valid: true, issues: [] }; }
  async finalize(): Promise<WorkflowResult> {
    return {
      status: AutoApplyStatus.APPLIED,
      canComplete: true,
      platform: ATSPlatform.UNKNOWN,
      automationConfidence: 100,
      stepsCompleted: 1,
      stepsRemaining: 0,
      blockingIssue: null,
      estimatedSubmissionTime: null,
    };
  }
}

export class GenericApplicationAgent {
  private readonly maxHops: number = agentConfig.maxNavigationHops;

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

    const stateMachine = new AgentStateMachine(AgentState.INITIALIZING);
    const telemetry = new AgentTelemetry(context.sessionId, logger);
    telemetry.markApplicationAttempted();

    while (hop < this.maxHops) {
      const hopStartTime = Date.now();
      const currentUrl = page.url() || context.jobUrl || '';
      await logger.info('agent_analysis', `Generic Application Agent inspecting page (Hop ${hop + 1}/${this.maxHops}): ${currentUrl}`);

      // ─── SPA Hydration Wait ─────────────────────────────────────────────────
      // Many ATS portals (Phenom, iCIMS, SmartRecruiters) are JS-rendered SPAs.
      // Playwright's domcontentloaded fires before React/Vue mounts, leaving the
      // DOM as an empty shell. Wait for network to settle and a visible interactive
      // element to appear before analyzing — both timeouts are graceful best-effort.
      await this.waitForSPAHydration(page, logger);

      // ─── Step 1: Analyze page structure & security boundaries ──────────────
      const analysis = await GenericPageAnalyzer.analyze(page, logger);
      const classifiedState = AgentStateMachine.classifyFromPageAnalysis(analysis);
      stateMachine.forceTransition(classifiedState, currentUrl, `Analysis classified as ${analysis.classification}`);

      await logger.info('page_classified', `Page classified as: ${analysis.classification} (Confidence: ${analysis.confidence}%)`, {
        classification: analysis.classification,
        confidence: analysis.confidence,
        reasons: analysis.reasons,
      });

      // ─── Step 2: Security & Auth boundary checks — MUST NOT BYPASS ─────────
      if (analysis.securityBlocker) {
        const blocker = analysis.securityBlocker;
        if (blocker.type === 'CAPTCHA') {
          await telemetry.record(telemetry.buildEntry({
            currentState: AgentState.CAPTCHA_REQUIRED,
            previousState: stateMachine.previous,
            url: currentUrl,
            action: 'stop',
            actionSource: 'deterministic',
            reason: `Security challenge detected: CAPTCHA (${blocker.reason})`,
            result: 'failed',
            latencyMs: Date.now() - hopStartTime,
          }));
          throw new InterventionError(
            InterventionReason.APPLICATION_BLOCKED_BY_CAPTCHA,
            `This application is blocked by a CAPTCHA security challenge (${blocker.reason}). Please solve the challenge in the browser window.`,
            currentUrl
          );
        }

        if (blocker.type === 'BOT_CHALLENGE') {
          await telemetry.record(telemetry.buildEntry({
            currentState: AgentState.BOT_CHALLENGE,
            previousState: stateMachine.previous,
            url: currentUrl,
            action: 'stop',
            actionSource: 'deterministic',
            reason: `Security challenge detected: Bot Protection (${blocker.reason})`,
            result: 'failed',
            latencyMs: Date.now() - hopStartTime,
          }));
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

          await telemetry.record(telemetry.buildEntry({
            currentState: AgentState.LOGIN_REQUIRED,
            previousState: stateMachine.previous,
            url: currentUrl,
            action: 'stop',
            actionSource: 'deterministic',
            reason: `Authentication required: ${blocker.reason}`,
            result: 'failed',
            latencyMs: Date.now() - hopStartTime,
          }));
          throw new InterventionError(
            InterventionReason.APPLICATION_BLOCKED_BY_LOGIN,
            `This employer portal requires candidate sign in or account creation to apply (${blocker.reason}).`,
            currentUrl
          );
        }
      }

      // ─── Step 3: Check if we have arrived at active application form ───────
      if (
        analysis.classification === PageClassification.APPLICATION_FORM ||
        analysis.classification === PageClassification.APPLICATION_CONTINUATION ||
        analysis.formPresence.hasApplicationElements ||
        analysis.formPresence.hasForm
      ) {
        stateMachine.forceTransition(AgentState.APPLICATION_FORM, currentUrl, 'Application form reached');
        await telemetry.record(telemetry.buildEntry({
          currentState: AgentState.APPLICATION_FORM,
          previousState: stateMachine.previous,
          url: currentUrl,
          action: 'classify',
          actionSource: 'deterministic',
          reason: 'Active application form confirmed with application elements',
          result: 'success',
          latencyMs: Date.now() - hopStartTime,
        }));
        await logger.info('application_form_ready', 'Active application form confirmed — handing off to form filler');
        
        // Record learned strategy for this domain
        await StrategyMemory.recordSuccess(currentUrl, {
          flow: ['job_page', 'application_form'],
        });

        await telemetry.flushSessionMetrics();
        return { success: true, reachedForm: true };
      }

      // ─── Step 4: Tier 0 — Strategy Memory Lookup ────────────────────────────
      let controlSelected: {
        source: ActionSource;
        candidate?: ApplicationControlCandidate;
        locator?: Locator;
        decision?: AgentDecision;
      } | null = null;

      const memoryEntry = await StrategyMemory.get(currentUrl);
      if (memoryEntry && memoryEntry.applicationTriggerSelector) {
        try {
          const memLoc = page.locator(memoryEntry.applicationTriggerSelector).first();
          if ((await memLoc.count()) > 0 && (await memLoc.isVisible())) {
            await logger.info('strategy_memory_hit', `Reusing saved strategy for domain ${memoryEntry.domain}: selector "${memoryEntry.applicationTriggerSelector}"`);
            controlSelected = {
              source: 'strategy_memory',
              locator: memLoc,
              candidate: {
                index: 0,
                text: memoryEntry.applicationTriggerText || 'Apply',
                ariaLabel: '',
                role: 'button',
                tagName: 'button',
                href: null,
                resolvedHref: null,
                confidence: 95,
                confidenceTier: 'HIGH',
                positiveSignals: ['memory:domain_strategy'],
                negativeSignals: [],
                isButton: true,
                isVisible: true,
                isEnabled: true,
                isInViewport: true,
              },
            };
          }
        } catch {
          // Fall through to deterministic
        }
      }

      // ─── Step 5: Tier 1 — Deterministic Selection ──────────────────────────
      if (!controlSelected && analysis.bestControl && analysis.bestControl.confidence >= 75) {
        const best = analysis.bestControl;
        const loc = await this.locateTargetElement(page, best);
        if (loc) {
          controlSelected = {
            source: 'deterministic',
            candidate: best,
            locator: loc,
          };
        }
      }

      // ─── Step 6: Tier 2 — GLM & DeepSeek AXTree Reasoning ──────────────────
      if (!controlSelected && agentConfig.aiNavigationEnabled && (agentConfig.glmApiKey || agentConfig.deepseekApiKey)) {
        const snapshot = await AXTreeBuilder.build(page);

        if (snapshot.elements.length < 3) {
          // AXTree is too sparse — DOM likely not hydrated yet or page is bot-blocked.
          // AI cannot reason about an empty tree; skip to Gemini visual fallback.
          await logger.warn('axtree_sparse',
            `AXTree has only ${snapshot.elements.length} element(s) — DOM may not be fully hydrated or page is bot-blocked. Skipping AI reasoning, falling through to Gemini visual fallback.`);
        } else {
          // 6a. Try GLM-5.3-Flash primary reasoning
          if (agentConfig.glmApiKey) {
            await logger.info('ai_reasoning', 'Deterministic confidence is moderate/ambiguous — invoking GLM-5.3-Flash AXTree navigation engine...');

            const glmResult = await GLMNavigator.decideAction(snapshot, stateMachine.current, {
              jobTitle: analysis.pageMetadata.schemaJobTitle,
            });

            if (glmResult.decision.action === 'click' && glmResult.decision.target_id) {
              const targetEl = AXTreeBuilder.findElementById(snapshot, glmResult.decision.target_id);
              if (targetEl) {
                const loc = await AXTreeBuilder.resolveLocator(page, targetEl);
                if (loc && (await loc.isVisible().catch(() => false))) {
                  await logger.info('glm_decision', `GLM-5.3-Flash selected ${targetEl.id} ("${targetEl.name}") with confidence ${glmResult.decision.confidence}`);
                  controlSelected = {
                    source: 'glm',
                    locator: loc,
                    decision: glmResult.decision,
                    candidate: {
                      index: 0,
                      text: targetEl.name,
                      ariaLabel: targetEl.ariaLabel,
                      role: targetEl.role,
                      tagName: targetEl.tag,
                      href: targetEl.href || null,
                      resolvedHref: targetEl.href || null,
                      confidence: Math.round(glmResult.decision.confidence * 100),
                      confidenceTier: glmResult.decision.confidence >= 0.75 ? 'HIGH' : 'MEDIUM',
                      positiveSignals: ['glm:axtree_reasoning'],
                      negativeSignals: [],
                      isButton: targetEl.role === 'button' || targetEl.tag === 'button',
                      isVisible: true,
                      isEnabled: targetEl.enabled,
                      isInViewport: targetEl.inViewport,
                    },
                  };
                }
              }
            } else if (glmResult.decision.action === 'manual_intervention' || glmResult.decision.action === 'stop') {
              if (glmResult.decision.confidence > 0.5) {
                await telemetry.record(telemetry.buildEntry({
                  currentState: stateMachine.current,
                  previousState: stateMachine.previous,
                  url: currentUrl,
                  action: glmResult.decision.action,
                  actionSource: 'glm',
                  model: 'glm-5.3-flash',
                  modelConfidence: glmResult.decision.confidence,
                  reason: glmResult.decision.reason,
                  result: 'failed',
                  latencyMs: Date.now() - hopStartTime,
                }));

                throw new InterventionError(
                  InterventionReason.APPLICATION_NOT_FOUND,
                  `Navigation stopped by GLM reasoning: ${glmResult.decision.reason}`,
                  currentUrl
                );
              }

              await logger.warn('glm_low_confidence_stop',
                `GLM returned '${glmResult.decision.action}' with low confidence (${glmResult.decision.confidence}) — falling through to DeepSeek/Gemini fallback. Reason: ${glmResult.decision.reason}`);
            }
          }

          // 6b. Try DeepSeek V4 Flash fallback if GLM was not configured or did not select a control
          if (!controlSelected && agentConfig.deepseekApiKey) {
            await logger.info('ai_reasoning', 'GLM unresolved or unconfigured — invoking DeepSeek AXTree navigation engine...');

            const dsResult = await DeepSeekNavigator.decideAction(snapshot, stateMachine.current, {
              jobTitle: analysis.pageMetadata.schemaJobTitle,
            });

            if (dsResult.decision.action === 'click' && dsResult.decision.target_id) {
              const targetEl = AXTreeBuilder.findElementById(snapshot, dsResult.decision.target_id);
              if (targetEl) {
                const loc = await AXTreeBuilder.resolveLocator(page, targetEl);
                if (loc && (await loc.isVisible().catch(() => false))) {
                  await logger.info('deepseek_decision', `DeepSeek selected ${targetEl.id} ("${targetEl.name}") with confidence ${dsResult.decision.confidence}`);
                  controlSelected = {
                    source: 'deepseek',
                    locator: loc,
                    decision: dsResult.decision,
                    candidate: {
                      index: 0,
                      text: targetEl.name,
                      ariaLabel: targetEl.ariaLabel,
                      role: targetEl.role,
                      tagName: targetEl.tag,
                      href: targetEl.href || null,
                      resolvedHref: targetEl.href || null,
                      confidence: Math.round(dsResult.decision.confidence * 100),
                      confidenceTier: dsResult.decision.confidence >= 0.75 ? 'HIGH' : 'MEDIUM',
                      positiveSignals: ['deepseek:axtree_reasoning'],
                      negativeSignals: [],
                      isButton: targetEl.role === 'button' || targetEl.tag === 'button',
                      isVisible: true,
                      isEnabled: targetEl.enabled,
                      isInViewport: targetEl.inViewport,
                    },
                  };
                }
              }
            } else if (dsResult.decision.action === 'manual_intervention' || dsResult.decision.action === 'stop') {
              if (dsResult.decision.confidence > 0.5) {
                await telemetry.record(telemetry.buildEntry({
                  currentState: stateMachine.current,
                  previousState: stateMachine.previous,
                  url: currentUrl,
                  action: dsResult.decision.action,
                  actionSource: 'deepseek',
                  model: 'deepseek-v4-flash',
                  modelConfidence: dsResult.decision.confidence,
                  reason: dsResult.decision.reason,
                  result: 'failed',
                  latencyMs: Date.now() - hopStartTime,
                  deepseekPromptTokens: dsResult.promptTokens,
                  deepseekCompletionTokens: dsResult.completionTokens,
                }));

                throw new InterventionError(
                  InterventionReason.APPLICATION_NOT_FOUND,
                  `Navigation stopped by AI reasoning: ${dsResult.decision.reason}`,
                  currentUrl
                );
              }

              await logger.warn('deepseek_low_confidence_stop',
                `DeepSeek returned '${dsResult.decision.action}' with low confidence (${dsResult.decision.confidence}) — falling through to Gemini visual fallback. Reason: ${dsResult.decision.reason}`);
            }
          }
        }
      }

      // ─── Step 7: Tier 3 — Gemini Visual Multimodal Fallback ────────────────
      if (!controlSelected && agentConfig.visionFallbackEnabled && agentConfig.geminiApiKey) {
        await logger.info('gemini_visual_fallback', 'Semantic reasoning unresolved — invoking Gemini visual screenshot fallback...');
        const geminiResult = await GeminiVisualFallback.decideVisualAction(page, stateMachine.current, {
          jobTitle: analysis.pageMetadata.schemaJobTitle,
        });

        if (geminiResult.decision.action === 'click' && geminiResult.decision.x && geminiResult.decision.y) {
          const clickRes = await GeminiVisualFallback.validateAndClickCoordinates(
            page,
            geminiResult.decision.x,
            geminiResult.decision.y
          );

          if (clickRes.success) {
            await telemetry.record(telemetry.buildEntry({
              currentState: stateMachine.current,
              previousState: stateMachine.previous,
              url: currentUrl,
              action: 'click',
              actionSource: 'gemini',
              model: agentConfig.visionFallbackModel,
              modelConfidence: geminiResult.decision.confidence,
              reason: geminiResult.decision.reason,
              result: 'success',
              latencyMs: Date.now() - hopStartTime,
              geminiPromptTokens: geminiResult.promptTokens,
              geminiCompletionTokens: geminiResult.completionTokens,
            }));

            await page.waitForTimeout(1000);
            hop++;
            continue;
          }
        }
      }

      // ─── Step 8: Multi-Apply Button Search Before Giving Up ────────────────
      // If elements like resume upload, logins, form fields for first name or last name are not found,
      // try to look for another apply button before giving up.
      if (!controlSelected || !controlSelected.candidate || !controlSelected.locator) {
        // Fall back to lower confidence deterministic candidate if available
        if (analysis.bestControl && analysis.bestControl.confidence >= 35) {
          const loc = await this.locateTargetElement(page, analysis.bestControl);
          if (loc) {
            controlSelected = {
              source: 'deterministic',
              candidate: analysis.bestControl,
              locator: loc,
            };
          }
        }
      }

      // Comprehensive search for any other visible Apply button on the page or inside child frames
      if (!controlSelected || !controlSelected.candidate || !controlSelected.locator) {
        const foundApply = await this.findAnyApplyButton(page);
        if (foundApply) {
          await logger.info('multi_apply_search', `Found another Apply button ("${foundApply.text}") — preparing to click and resume looking for application elements`);
          controlSelected = {
            source: 'deterministic',
            candidate: {
              index: 0,
              text: foundApply.text,
              ariaLabel: '',
              role: 'button',
              tagName: 'button',
              href: null,
              resolvedHref: null,
              confidence: 70,
              confidenceTier: 'MEDIUM',
              positiveSignals: ['multi_apply_fallback'],
              negativeSignals: [],
              isButton: true,
              isVisible: true,
              isEnabled: true,
              isInViewport: true,
            },
            locator: foundApply.locator,
          };
        }
      }

      if (!controlSelected || !controlSelected.candidate || !controlSelected.locator) {
        // If a modal or overlay is open, try dismissing it before declaring failure (many modals are dismissible)
        const hasOpenModal = await page.evaluate(() => {
          const modals = document.querySelectorAll('[role="dialog"], [aria-modal="true"], .modal, [class*="modal" i]');
          for (const m of Array.from(modals)) {
            const rect = m.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) return true;
          }
          return false;
        }).catch(() => false);

        if (hasOpenModal) {
          await logger.info('stuck_modal_fallback', 'No controls found while a modal is visible — attempting to dismiss modal via close button or Escape...');
          const dismissed = await UIObstructionResolver.dismissAnyOpenModal(page, logger);
          if (dismissed) {
            await page.waitForTimeout(600);
            hop++;
            continue;
          }
        }

        await telemetry.record(telemetry.buildEntry({
          currentState: stateMachine.current,
          previousState: stateMachine.previous,
          url: currentUrl,
          action: 'stop',
          actionSource: 'deterministic',
          reason: 'No actionable application controls or application elements detected on this page',
          result: 'failed',
          latencyMs: Date.now() - hopStartTime,
        }));
        await logger.warn('application_not_found', 'No actionable application controls or elements detected on this page');
        throw new InterventionError(
          InterventionReason.APPLICATION_NOT_FOUND,
          'Auto Apply could not find a credible "Apply" button or application form on this employer page. Please apply manually using the link above.',
          currentUrl
        );
      }

      const best = controlSelected.candidate;
      const targetLocator = controlSelected.locator;

      await logger.info('control_selected', `[${controlSelected.source}] Selected control: "${best.text}" (Confidence: ${best.confidence}%)`, {
        text: best.text,
        confidence: best.confidence,
        actionSource: controlSelected.source,
      });

      // ─── Step 9: Actionability & UI Obstruction Handling ──────────────────
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

          if (obsType === ObstructionType.APPLICATION_FLOW_MODAL) {
            await logger.info('obstruction_recovery', 'Application flow / resume choice modal detected. Selecting positive option...');
            await UIObstructionResolver.resolveObstruction(page, targetLocator, obstruction, logger);
          } else if (obstruction.classification.isSafeToDismiss) {
            await logger.info('obstruction_recovery', `Obstruction classified as ${obsType} (Safe to dismiss). Attempting recovery...`);
            const recovery = await UIObstructionResolver.resolveObstruction(page, targetLocator, obstruction, logger);
            if (!recovery.success) {
              await logger.warn('obstruction_recovery_failed', `Could not safely dismiss ${obsType}`);
            }
          }
        }
      }

      // ─── Step 10: Interact with target control ─────────────────────────────
      stateMachine.forceTransition(AgentState.CLICKING_APPLICATION_TRIGGER, currentUrl, `Clicking "${best.text}"`);

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

      await telemetry.record(telemetry.buildEntry({
        currentState: AgentState.CLICKING_APPLICATION_TRIGGER,
        previousState: stateMachine.previous,
        url: currentUrl,
        action: 'click',
        actionSource: controlSelected.source,
        modelConfidence: best.confidence,
        deterministicScore: best.confidence,
        targetElement: best.text,
        reason: `Clicked application control: "${best.text}"`,
        result: 'success',
        latencyMs: Date.now() - hopStartTime,
      }));

      // ─── Step 11: Detect resulting progress ────────────────────────────────
      const newPage = await Promise.race([pagePromise, navPromise.then(() => null)]);
      if (newPage) {
        await logger.info('tab_switched', 'Application opened in a new browser tab — switching context');
        await newPage.waitForLoadState('domcontentloaded').catch(() => {});
        browser.page = newPage;
        page = newPage;
      } else {
        await page.waitForLoadState('domcontentloaded', { timeout: 3000 }).catch(() => {});
        await page.waitForTimeout(600);
      }

      // Proactively handle resume choice onboarding modal if it opened upon clicking the button
      await UIObstructionResolver.handleResumeChoiceModalIfPresent(page, logger);

      hop++;
    }

    await telemetry.flushSessionMetrics();
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
      `div:has-text("${textEscaped}"):not(:has(div:has-text("${textEscaped}")))`,
      `input[type="submit"][value*="${textEscaped}" i]`,
      `input[type="button"][value*="${textEscaped}" i]`,
      `button:has-text("I have a resume")`,
      `[role="button"]:has-text("I have a resume")`,
      `a:has-text("I have a resume")`,
      `div:has-text("I have a resume"):not(:has(div:has-text("I have a resume")))`,
      `button:has-text("I'm interested")`,
      `[role="button"]:has-text("I'm interested")`,
      `a:has-text("I'm interested")`,
      `button:has-text("Apply Now")`,
      `a:has-text("Apply Now")`,
      `button:has-text("Apply for this job")`,
      `a:has-text("Apply for this job")`,
      `button:has-text("Apply on company site")`,
      `a:has-text("Apply on company site")`,
      `button:has-text("Apply directly")`,
      `a:has-text("Apply directly")`,
      `button:has-text("Start Application")`,
      `a:has-text("Start Application")`,
      `button:has-text("Start your application")`,
      `a:has-text("Start your application")`,
      `button:has-text("Begin Application")`,
      `a:has-text("Begin Application")`,
      `button:has-text("Proceed to Application")`,
      `a:has-text("Proceed to Application")`,
      `button:has-text("Apply Manually")`,
      `a:has-text("Apply Manually")`,
      `button:has-text("Autofill with Resume")`,
      `a:has-text("Autofill with Resume")`,
      `button:has-text("Apply Online")`,
      `a:has-text("Apply Online")`,
      `button:has-text("Apply")`,
      `a:has-text("Apply")`,
      `[data-automation-id*="apply" i]`,
      `[data-testid*="apply" i]`,
      `a[href*="/apply" i]`,
    ];

    for (const sel of selectors) {
      try {
        const loc = page.locator(sel).first();
        if ((await loc.count().catch(() => 0)) > 0 && (await loc.isVisible().catch(() => false))) {
          return loc;
        }
      } catch {}
    }

    return null;
  }

  /**
   * Scans page and child frames for any visible, credible Apply button or link.
   */
  private async findAnyApplyButton(
    page: Page
  ): Promise<{ text: string; locator: Locator } | null> {
    const applySelectors = [
      'button:has-text("Apply for this job")',
      'a:has-text("Apply for this job")',
      'button:has-text("Apply Now")',
      'a:has-text("Apply Now")',
      'button:has-text("Apply on company site")',
      'a:has-text("Apply on company site")',
      'button:has-text("Apply on company website")',
      'a:has-text("Apply on company website")',
      'button:has-text("Apply on employer site")',
      'a:has-text("Apply on employer site")',
      'button:has-text("Apply Directly")',
      'a:has-text("Apply Directly")',
      'button:has-text("Start Application")',
      'a:has-text("Start Application")',
      'button:has-text("Start your application")',
      'a:has-text("Start your application")',
      'button:has-text("Begin Application")',
      'a:has-text("Begin Application")',
      'button:has-text("Proceed to Application")',
      'a:has-text("Proceed to Application")',
      'button:has-text("Continue to Application")',
      'a:has-text("Continue to Application")',
      'button:has-text("Apply with Resume")',
      'a:has-text("Apply with Resume")',
      'button:has-text("Autofill with Resume")',
      'a:has-text("Autofill with Resume")',
      'button:has-text("Apply Manually")',
      'a:has-text("Apply Manually")',
      'button:has-text("Apply Online")',
      'a:has-text("Apply Online")',
      '[data-automation-id="applyButton"]',
      '[data-automation-id="Apply"]',
      'button[data-automation-id*="apply" i]',
      'a[data-automation-id*="apply" i]',
      'a.postings-btn',
      'a[href*="/apply" i]',
      'button:has-text("I\'m interested")',
      'a:has-text("I\'m interested")',
      'button:has-text("I have a resume")',
      'a:has-text("I have a resume")',
      'button:has-text("Apply")',
      'a:has-text("Apply")',
      '[role="button"]:has-text("Apply")',
      'input[type="submit"][value*="Apply" i]',
      'input[type="button"][value*="Apply" i]',
    ];

    const isNegativeApplyText = (t: string) => {
      return /\b(apply (filter|filters|coupon|promo|code|discount|search|changes|settings|preferences|sort|tags)|clear filters|reset filters|save search|subscribe|job alerts?)\b/i.test(t);
    };

    // 1. Scan main page
    for (const sel of applySelectors) {
      try {
        const loc = page.locator(sel).first();
        if ((await loc.count().catch(() => 0)) > 0 && (await loc.isVisible().catch(() => false))) {
          const txt = (await loc.textContent().catch(() => ''))?.trim() || 'Apply';
          if (!isNegativeApplyText(txt)) {
            return { text: txt, locator: loc };
          }
        }
      } catch {}
    }

    // 2. Scan child frames
    for (const frame of page.frames()) {
      if (frame === page.mainFrame()) continue;
      for (const sel of applySelectors) {
        try {
          const loc = frame.locator(sel).first();
          if ((await loc.count().catch(() => 0)) > 0 && (await loc.isVisible().catch(() => false))) {
            const txt = (await loc.textContent().catch(() => ''))?.trim() || 'Apply';
            if (!isNegativeApplyText(txt)) {
              return { text: txt, locator: loc };
            }
          }
        } catch {}
      }
    }

    return null;
  }

  /**
   * Waits for a JS-rendered SPA to finish hydrating before DOM analysis.
   *
   * Many ATS portals (Phenom People, iCIMS, SmartRecruiters) are React/Vue SPAs
   * where `domcontentloaded` fires on an empty shell before the framework mounts.
   * This method waits for:
   *  1. Network idle (SPA API calls that populate job content settle)
   *  2. At least one visible interactive element to appear in the DOM
   *
   * Both waits are best-effort — timeouts are graceful and analysis proceeds
   * with whatever is available if the conditions are not met in time.
   */
  private async waitForSPAHydration(page: Page, logger: ExecutionLogger): Promise<void> {
    try {
      await page.waitForLoadState('networkidle', { timeout: 8000 });
      await logger.info('spa_hydration', 'Network idle — SPA hydration likely complete');
    } catch {
      // networkidle timeout is acceptable; proceed with what's rendered
      await logger.info('spa_hydration', 'Network idle wait timed out — proceeding with available DOM');
    }

    try {
      await page.waitForSelector(
        'button:visible, a[href]:visible, [role="button"]:visible',
        { timeout: 5000 }
      );
    } catch {
      // No interactive element appeared — page analyzer will handle gracefully
    }
  }
}
