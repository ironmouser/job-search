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
import {
  InterventionManager,
  InterventionCancelledError,
  InterventionSkippedError,
  InterventionTimeoutError,
} from './intervention-manager';
import { pluginRegistry } from './registry';
import { InterventionError } from './plugins/base-plugin';
import { AggregatorHandler } from './plugins/aggregator-handler';
import { uploadBrowserScreenshot } from './s3';
import { detectJobClosed } from './utils/job-status-detector';

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

      // Check if the landing page indicates the job is closed / no longer accepting applications
      const initialClosedCheck = await detectJobClosed(browser, logger);
      if (initialClosedCheck.isClosed) {
        throw new InterventionError(
          InterventionReason.JOB_CLOSED,
          initialClosedCheck.reason || 'This position is no longer accepting applications or has been closed by the employer.',
          browser.page.url() || context.jobUrl
        );
      }

      let html = await browser.getHtml();
      let redirectChain = await browser.getRedirectChain();
      let currentUrl = browser.page.url();

      let match = pluginRegistry.detect(currentUrl, html, redirectChain);
      let plugin = match?.plugin ?? pluginRegistry.get(ATSPlatform.UNKNOWN)!;
      let detection = match?.result ?? {
        platform: ATSPlatform.UNKNOWN,
        confidence: 10,
        detectedFeatures: [],
        automationSupported: false,
      };

      // ─── Multi-Hop Aggregator & Apply Link Follower (Up to 3 Hops) ───────
      const MAX_AGGREGATOR_HOPS = 3;
      let hopCount = 0;
      const allCandidateReports: import('./plugins/aggregator-handler').CandidateReport[] = [];
      const { normalizeUrl } = await import('./utils/destination-validator');
      const visitedUrls = new Set<string>([normalizeUrl(currentUrl)]);

      while (hopCount < MAX_AGGREGATOR_HOPS) {
        // 1. Check if top-level page matches known ATS with strong confidence
        if (plugin.platform !== ATSPlatform.UNKNOWN && detection.confidence >= 50) {
          break;
        }

        // 2. Check if an embedded iframe contains a known ATS
        const iframeMatch = await AggregatorHandler.detectIframeATS(browser, logger);
        if (iframeMatch && iframeMatch.plugin.platform !== ATSPlatform.UNKNOWN && iframeMatch.result.confidence >= 50) {
          plugin = iframeMatch.plugin;
          detection = iframeMatch.result;
          break;
        }

        // 3. If still unknown, attempt to find and follow the Apply button / link
        await this.updateStatus(session.sessionId, AutoApplyStatus.NAVIGATING_TO_ATS, {
          currentStep: `navigating_aggregator_hop_${hopCount + 1}`,
          stepsCompleted: 1,
        });

        const clickResult = await AggregatorHandler.attemptClickThrough(browser, logger, session.sessionId, visitedUrls);
        // Merge candidate reports from this hop
        allCandidateReports.push(...clickResult.candidateReports);

        if (!clickResult.navigated) {
          break;
        }

        // Check if navigated target is closed
        const targetClosedCheck = await detectJobClosed(browser, logger);
        if (targetClosedCheck.isClosed) {
          throw new InterventionError(
            InterventionReason.JOB_CLOSED,
            targetClosedCheck.reason || 'This position is no longer accepting applications or has been closed by the employer.',
            browser.page.url() || currentUrl
          );
        }

        html = await browser.getHtml();
        redirectChain = await browser.getRedirectChain();
        currentUrl = browser.page.url();
        visitedUrls.add(normalizeUrl(currentUrl));

        match = pluginRegistry.detect(currentUrl, html, redirectChain);
        plugin = match?.plugin ?? pluginRegistry.get(ATSPlatform.UNKNOWN)!;
        detection = match?.result ?? detection;

        hopCount++;
      }

      // Store candidate diagnostic data in browserMetadata for dashboard visibility
      if (allCandidateReports.length > 0) {
        await this.updateStatus(session.sessionId, AutoApplyStatus.DETECTING_ATS, {
          browserMetadata: {
            modalCandidates: allCandidateReports.map(r => ({
              text: r.text,
              href: r.href,
              resolvedHref: r.resolvedHref !== r.href ? r.resolvedHref : undefined,
              classification: r.classification,
              accepted: r.accepted,
              reason: r.reason,
            })),
          },
        });
      }

      // Update context.jobUrl to the final resolved URL after aggregator navigation
      context.jobUrl = currentUrl;

      // ─── Destination Validation Gate ──────────────────────────────────────
      // If we're still on the original job board / aggregator domain after all hops
      // and the ATS is still UNKNOWN, we failed to extract the application destination.
      // Do NOT proceed to ATS detection — surface a clear failure reason instead.
      if (plugin.platform === ATSPlatform.UNKNOWN) {
        const { isLegitimateApplicationDestination } = await import('./utils/destination-validator');
        const destinationValidation = isLegitimateApplicationDestination(currentUrl, session.jobUrl);
        if (!destinationValidation.valid) {
          throw new InterventionError(
            InterventionReason.APPLICATION_DESTINATION_NOT_FOUND,
            'We were unable to determine this application\'s destination from the job posting. Please open the job posting to apply directly.',
            currentUrl
          );
        }
      }

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
        context,
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
        context,
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
      const result = await this.runWithInterventionReturn(
        session.sessionId,
        browser,
        logger,
        context,
        async () => plugin.finalize(browser, context, logger)
      );

      let confirmationScreenshotUrl: string | undefined;
      const isSuccessfulStatus =
        result.status === AutoApplyStatus.APPLIED ||
        (result.status as any) === 'applied' ||
        result.status === AutoApplyStatus.SIMULATED ||
        (result.status as any) === 'simulated';

      if (isSuccessfulStatus) {
        try {
          const s3Key = `screenshots/confirmations/${session.sessionId}.png`;
          const uploadedUrl = await uploadBrowserScreenshot(browser, s3Key);
          if (uploadedUrl) {
            confirmationScreenshotUrl = uploadedUrl;
            await logger.info('confirmation_screenshot_uploaded', 'Confirmation screenshot captured & uploaded to S3', { url: uploadedUrl });
          }
        } catch {
          await logger.warn('confirmation_screenshot_failed', 'Could not upload confirmation screenshot to S3');
        }
      }

      await logger.info('workflow_completed', `Workflow complete — status: ${result.status}`);
      await logger.flush();

      await this.updateStatus(session.sessionId, result.status as AutoApplyStatus, {
        currentStep: 'completed',
        stepsCompleted: 6,
        automationConfidence: result.automationConfidence,
        confirmationScreenshotUrl,
      });

      return result;

    } catch (err: any) {
      return await this.handleError(session, browser, logger, err);
    } finally {
      await browser.close().catch(() => {});
    }
  }

  // ─── Error handling ───────────────────────────────────────────────────────

  private async handleError(
    session: QueuedSession,
    browser: BrowserSession,
    logger: ExecutionLogger,
    err: unknown
  ): Promise<WorkflowResult> {
    if (err instanceof InterventionSkippedError) {
      await logger.info('workflow_skipped', 'Session was marked as skipped');
      await logger.flush();
      return this.makeResult(AutoApplyStatus.SKIPPED, 'Session skipped');
    }

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
      let finalReason = err.reason as InterventionReason;
      let finalDesc = err.description;

      // Always re-check if page indicates the job is closed/expired before prompting user
      try {
        const closedCheck = await detectJobClosed(browser, logger);
        if (closedCheck.isClosed) {
          finalReason = InterventionReason.JOB_CLOSED;
          finalDesc = closedCheck.reason || 'This position is no longer accepting applications or has been closed by the employer.';
        }
      } catch {}

      await logger.warn('unhandled_intervention_caught', `Intervention required: ${finalReason} - ${finalDesc}`);
      try {
        const interventionManager = new InterventionManager(session.sessionId, this.apiClient, logger);
        await interventionManager.requestIntervention(
          browser,
          finalReason,
          finalDesc,
          err.pageUrl
        );
      } catch (interventionErr) {
        if (interventionErr instanceof InterventionSkippedError) {
          await logger.info('workflow_skipped', 'Session was marked as skipped during intervention');
          await logger.flush();
          return this.makeResult(AutoApplyStatus.SKIPPED, 'Session skipped');
        }
        if (interventionErr instanceof InterventionCancelledError) {
          await logger.info('workflow_cancelled', 'User cancelled automation during intervention');
          await logger.flush();
          await this.updateStatus(session.sessionId, AutoApplyStatus.CANCELLED, {
            currentStep: 'cancelled',
            failureReason: 'user_cancelled',
          });
          return this.makeResult(AutoApplyStatus.CANCELLED, 'User cancelled');
        }
        if (interventionErr instanceof InterventionTimeoutError) {
          await logger.error('workflow_failed', 'Intervention timed out');
          await logger.flush();
          return await this.fail(session.sessionId, logger, 'intervention_timeout', interventionErr.message);
        }
        return await this.fail(session.sessionId, logger, finalReason, finalDesc);
      }
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
   * On resolution, re-fetches updated user profile context from database before retrying.
   */
  private async runWithIntervention(
    sessionId: string,
    browser: BrowserSession,
    logger: ExecutionLogger,
    context: WorkflowContext,
    fn: () => Promise<void>
  ): Promise<void> {
    await this.runWithInterventionReturn(sessionId, browser, logger, context, fn);
  }

  private async runWithInterventionReturn<T>(
    sessionId: string,
    browser: BrowserSession,
    logger: ExecutionLogger,
    context: WorkflowContext,
    fn: () => Promise<T>
  ): Promise<T> {
    let attempts = 0;
    const maxAttempts = 5;

    while (attempts < maxAttempts) {
      try {
        return await fn();
      } catch (err) {
        if (err instanceof InterventionError) {
          attempts++;
          let finalReason = err.reason as InterventionReason;
          let finalDesc = err.description;

          // Always check if page indicates the job is closed/expired before prompting user
          try {
            const closedCheck = await detectJobClosed(browser, logger);
            if (closedCheck.isClosed) {
              finalReason = InterventionReason.JOB_CLOSED;
              finalDesc = closedCheck.reason || 'This position is no longer accepting applications or has been closed by the employer.';
            }
          } catch {}

          const interventionManager = new InterventionManager(sessionId, this.apiClient, logger);
          await interventionManager.requestIntervention(
            browser,
            finalReason,
            finalDesc,
            err.pageUrl
          );

          // User resolved intervention — re-fetch session context to pull newly saved user profile data
          try {
            const freshSessionContext = await this.apiClient.getSessionContext(sessionId);
            if (freshSessionContext?.userProfile) {
              context.userProfile = {
                ...context.userProfile,
                ...freshSessionContext.userProfile,
              };
              await logger.info(
                'context_refreshed',
                'Refreshed user profile data from database after intervention resolution'
              );
            }
          } catch (refreshErr) {
            await logger.warn('context_refresh_failed', `Could not refresh context: ${refreshErr}`);
          }
        } else {
          throw err;
        }
      }
    }
    throw new Error('Maximum intervention retries exceeded');
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
