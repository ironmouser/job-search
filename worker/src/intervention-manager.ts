import { InterventionReason, CreateInterventionPayload } from './types';
import { RailwayAPIClient } from './api-client';
import { BrowserSession } from './browser-session';
import { ExecutionLogger } from './execution-logger';
import { uploadBrowserScreenshot } from './s3';

/** Thrown by the intervention manager when the user cancels instead of resolving */
export class InterventionCancelledError extends Error {
  constructor() {
    super('User cancelled the automation during intervention');
    this.name = 'InterventionCancelledError';
  }
}

/** Thrown when an intervention times out with no user response */
export class InterventionTimeoutError extends Error {
  constructor(reason: string) {
    super(`Intervention timed out — no response from user for: ${reason}`);
    this.name = 'InterventionTimeoutError';
  }
}

const INTERVENTION_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
const POLL_INTERVAL_MS = 3_000;                  // Check for resolution every 3 seconds

/**
 * InterventionManager — pauses automation and waits for human help.
 *
 * When a plugin encounters a blocker (CAPTCHA, unknown question, login wall):
 *  1. Takes a screenshot of the current browser state
 *  2. Creates an InterventionRequest via Railway API
 *  3. Updates session status to needs_intervention
 *  4. Polls Railway for resolution every 3 seconds
 *  5. Resumes automation when user marks it resolved
 *  6. Throws on timeout (5 min) or cancellation
 */
export class InterventionManager {
  constructor(
    private readonly sessionId: string,
    private readonly apiClient: RailwayAPIClient,
    private readonly logger: ExecutionLogger
  ) {}

  async requestIntervention(
    browser: BrowserSession,
    reason: InterventionReason,
    description: string,
    pageUrl?: string
  ): Promise<void> {
    await this.logger.warn('intervention_needed', `Intervention required: ${reason} — ${description}`, {
      reason,
      pageUrl,
    });

    // Take a screenshot and upload to S3
    let screenshotUrl: string | undefined;
    try {
      const s3Key = `screenshots/interventions/${this.sessionId}_${Date.now()}.png`;
      const uploadedUrl = await uploadBrowserScreenshot(browser, s3Key);
      if (uploadedUrl) {
        screenshotUrl = uploadedUrl;
        await this.logger.debug('screenshot_uploaded', 'Screenshot uploaded to S3 for intervention', { url: uploadedUrl });
      }
    } catch {
      await this.logger.warn('screenshot_failed', 'Could not upload screenshot for intervention');
    }

    const payload: CreateInterventionPayload = {
      reason,
      description,
      pageUrl,
      screenshotUrl,
    };

    // Create the intervention request on Railway
    const interventionId = await this.apiClient.createIntervention(this.sessionId, payload);
    await this.logger.info('intervention_created', `Intervention request created — waiting for user`, {
      interventionId,
    });

    // Poll for resolution
    await this.waitForResolution(interventionId);
  }

  private async waitForResolution(interventionId: string): Promise<void> {
    const deadline = Date.now() + INTERVENTION_TIMEOUT_MS;

    while (Date.now() < deadline) {
      await sleep(POLL_INTERVAL_MS);

      const status = await this.apiClient.checkIntervention(this.sessionId);

      if (!status.resolved) continue;

      if (status.resolution === 'cancelled') {
        throw new InterventionCancelledError();
      }

      if (status.resolution === 'skipped') {
        // Treat skip as cancel — don't resume, just stop this session
        throw new InterventionCancelledError();
      }

      // resolution === 'completed' — user confirmed they resolved it
      await this.logger.info('intervention_resolved', 'User resolved the intervention — resuming automation');
      return;
    }

    throw new InterventionTimeoutError(`No response within 5 minutes`);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
