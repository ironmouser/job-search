import {
  QueuedSession,
  WorkflowContext,
  WorkflowResult,
  AutoApplyStatus,
  ATSPlatform,
  InterventionReason,
} from './types';
import { RailwayAPIClient } from './api-client';
import { BrowserSession } from './browser-session';
import { ExecutionLogger } from './execution-logger';
import { InterventionManager, InterventionCancelledError, InterventionTimeoutError } from './intervention-manager';
import { pluginRegistry } from './registry';
import { InterventionError } from './plugins/base-plugin';

/**
 * WorkflowEngine — finite state machine for Auto Apply automation.
 *
 * State transitions:
 *   queued → processing → detecting_ats → preparing → applying
 *     → validating → [simulated | applied | needs_intervention | failed]
 *
 * Every state transition:
 *  1. Updates session status via Railway API
 *  2. Logs the transition via ExecutionLogger
 *
 * The engine never writes to the database directly.
 * All persistence goes through the RailwayAPIClient.
 */
export class WorkflowEngine {
  constructor(
    private readonly apiClient: RailwayAPIClient,
    private readonly workerId: string
  ) {}

  async execute(session: QueuedSession): Promise<WorkflowResult> {
    const browser = new BrowserSession();
    const logger = new ExecutionLogger(session.sessionId, this.apiClient);

    try {
      await logger.info('workflow_started', `Workflow started for job ${session.jobId}`, {
        jobId: session.jobId,
        simulationMode: session.simulationMode,
        workerId: this.workerId,
      });

      // Report processing state with worker ID
      await this.updateStatus(session.sessionId, AutoApplyStatus.PROCESSING, {
        currentStep: 'validating_assets',
        stepsTotal: 6,
        workerId: this.workerId,
      });

      // ─── Step 1: Validate assets ─────────────────────────────────────────
      if (!session.resumeMarkdown || !session.coverLetterMarkdown) {
        await logger.error('assets_validated', 'Missing resume or cover letter assets');
        return await this.fail(session.sessionId, logger, 'missing_assets', 'Resume or cover letter not found');
      }
      await logger.info('assets_validated', 'Resume and cover letter confirmed');

      const context: WorkflowContext = {
        sessionId: session.sessionId,
        userId: session.userId,
        jobId: session.jobId,
        jobUrl: session.jobUrl,
        resumeMarkdown: session.resumeMarkdown,
        coverLetterMarkdown: session.coverLetterMarkdown,
        userProfile: session.userProfile,
        simulationMode: session.simulationMode,
      };

      // ─── Step 2: Launch browser ──────────────────────────────────────────
      await this.updateStatus(session.sessionId, AutoApplyStatus.DETECTING_ATS, {
        currentStep: 'browser_launching',
        stepsCompleted: 1,
      });

      await logger.timed('browser_launched', () => browser.launch(), 'Browser launched');

      // ─── Step 3: Detect ATS ──────────────────────────────────────────────
      await logger.info('page_navigated', `Navigating to ${context.jobUrl}`);
      await browser.navigate(context.jobUrl);

      const html = await browser.getHtml();
      const redirectChain = await browser.getRedirectChain();
      const currentUrl = browser.page.url();

      const match = pluginRegistry.detect(currentUrl, html, redirectChain);
      const plugin = match?.plugin ?? pluginRegistry.get(ATSPlatform.UNKNOWN)!;
      const detection = match?.result ?? {
        platform: ATSPlatform.UNKNOWN,
        confidence: 10,
        detectedFeatures: [],
        automationSupported: false,
      };

      // Formatted ATS detection banner
      await logger.info('ats_detected', [
        '─────────────────────────────────',
        ' Detected ATS',
        ` ${plugin.displayName}`,
        ` Confidence ${detection.confidence}%`,
        '─────────────────────────────────',
      ].join('\n'), {
        platform: detection.platform,
        confidence: detection.confidence,
        automationSupported: detection.automationSupported,
        features: detection.detectedFeatures,
      });


      await this.updateStatus(session.sessionId, AutoApplyStatus.PREPARING, {
        currentStep: 'preparing_plugin',
        stepsCompleted: 2,
        atsPlatform: detection.platform as ATSPlatform,
        atsConfidence: detection.confidence,
      });

      await logger.info('plugin_loaded', `Using plugin: ${plugin.displayName}`);

      // ─── Step 4: Prepare plugin ──────────────────────────────────────────
      await this.runWithIntervention(
        session.sessionId,
        browser,
        logger,
        async () => plugin.prepare(browser, context, logger)
      );

      await this.updateStatus(session.sessionId, AutoApplyStatus.APPLYING, {
        currentStep: 'filling_form',
        stepsCompleted: 3,
      });

      // ─── Step 5: Apply (fill form) ───────────────────────────────────────
      await this.runWithIntervention(
        session.sessionId,
        browser,
        logger,
        async () => plugin.apply(browser, context, logger)
      );

      await this.updateStatus(session.sessionId, AutoApplyStatus.VALIDATING, {
        currentStep: 'validating',
        stepsCompleted: 4,
      });

      // ─── Step 6: Validate ────────────────────────────────────────────────
      const validation = await plugin.validate(browser, context, logger);
      if (!validation.valid) {
        await logger.warn('validation_issues', `Validation failed: ${validation.issues.join(', ')}`);

        if (validation.issues.length > 0) {
          // Minor issues — request intervention
          const interventionManager = new InterventionManager(session.sessionId, this.apiClient, logger);
          await interventionManager.requestIntervention(
            browser,
            InterventionReason.UNEXPECTED_PAGE,
            `Validation issues found: ${validation.issues.slice(0, 3).join('; ')}`,
            browser.page.url()
          );
        }
      } else {
        await logger.info('validation_passed', 'Form validation passed — ready to submit');
      }

      // ─── Step 7: Finalize (submit or simulate) ───────────────────────────
      const result = await plugin.finalize(browser, context, logger);

      await logger.info('workflow_completed', `Workflow complete — status: ${result.status}`);
      await logger.flush();

      await this.updateStatus(session.sessionId, result.status as AutoApplyStatus, {
        currentStep: 'completed',
        stepsCompleted: 6,
        automationConfidence: result.automationConfidence,
      });

      return result;

    } catch (err: any) {
      return await this.handleError(session, logger, err);
    } finally {
      await browser.close().catch(() => {});
    }
  }

  // ─── Error handling ───────────────────────────────────────────────────────

  private async handleError(
    session: QueuedSession,
    logger: ExecutionLogger,
    err: unknown
  ): Promise<WorkflowResult> {
    if (err instanceof InterventionCancelledError) {
      await logger.info('workflow_cancelled', 'User cancelled automation');
      await logger.flush();
      await this.updateStatus(session.sessionId, AutoApplyStatus.CANCELLED, {
        currentStep: 'cancelled',
        failureReason: 'user_cancelled',
      });
      return this.makeResult(AutoApplyStatus.CANCELLED, 'User cancelled');
    }

    if (err instanceof InterventionTimeoutError) {
      await logger.error('workflow_failed', 'Intervention timed out');
      await logger.flush();
      return await this.fail(session.sessionId, logger, 'intervention_timeout', err.message);
    }

    if (err instanceof InterventionError) {
      // Plugin threw an InterventionError — should have been caught by runWithIntervention
      // If it reaches here, the intervention itself failed
      await logger.error('workflow_failed', `Unhandled intervention: ${err.reason}`);
      await logger.flush();
      return await this.fail(session.sessionId, logger, err.reason, err.description);
    }

    const message = err instanceof Error ? err.message : String(err);
    await logger.error('workflow_failed', `Unexpected error: ${message}`, {
      errorName: err instanceof Error ? err.name : 'Unknown',
    });
    await logger.flush();
    return await this.fail(session.sessionId, logger, 'unexpected_error', message);
  }

  /**
   * Run a plugin step, catching InterventionError and routing to the intervention manager.
   */
  private async runWithIntervention(
    sessionId: string,
    browser: BrowserSession,
    logger: ExecutionLogger,
    fn: () => Promise<void>
  ): Promise<void> {
    try {
      await fn();
    } catch (err) {
      if (err instanceof InterventionError) {
        const interventionManager = new InterventionManager(sessionId, this.apiClient, logger);
        await interventionManager.requestIntervention(
          browser,
          err.reason as InterventionReason,
          err.description,
          err.pageUrl
        );
        // After resolution, retry the step once
        await fn();
      } else {
        throw err;
      }
    }
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private async updateStatus(
    sessionId: string,
    status: AutoApplyStatus,
    extra?: Record<string, unknown>
  ): Promise<void> {
    try {
      await this.apiClient.updateSessionStatus(sessionId, { status, ...extra } as any);
    } catch (err) {
      console.warn(`[WorkflowEngine] Failed to update status to ${status}:`, err);
    }
  }

  private async fail(
    sessionId: string,
    logger: ExecutionLogger,
    reason: string,
    details: string
  ): Promise<WorkflowResult> {
    await this.updateStatus(sessionId, AutoApplyStatus.FAILED, {
      currentStep: 'failed',
      failureReason: reason,
      failureDetails: details,
    });
    await logger.flush();
    return this.makeResult(AutoApplyStatus.FAILED, details);
  }

  private makeResult(status: AutoApplyStatus, blockingIssue: string | null): WorkflowResult {
    return {
      status,
      canComplete: false,
      platform: ATSPlatform.UNKNOWN,
      automationConfidence: 0,
      stepsCompleted: 0,
      stepsRemaining: 0,
      blockingIssue,
      estimatedSubmissionTime: null,
    };
  }
}
