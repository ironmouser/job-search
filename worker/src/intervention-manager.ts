import { InterventionReason, CreateInterventionPayload } from './types';
import { RailwayAPIClient } from './api-client';
import { BrowserSession } from './browser-session';
import { ExecutionLogger } from './execution-logger';
import { uploadBrowserScreenshot } from './s3';
import { browserStreamServer } from './browser-stream-server';

/** Thrown by the intervention manager when the user cancels instead of resolving */
export class InterventionCancelledError extends Error {
  constructor() {
    super('User cancelled the automation during intervention');
    this.name = 'InterventionCancelledError';
  }
}

/** Thrown by the intervention manager when an intervention is skipped (auto or manual) */
export class InterventionSkippedError extends Error {
  constructor() {
    super('Automation session was skipped during intervention');
    this.name = 'InterventionSkippedError';
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
 *  1. Mounts a live interactive CDP screencast stream for the session
 *  2. Takes a screenshot of the current browser state
 *  3. Creates an InterventionRequest via Railway API
 *  4. Polls Railway for resolution every 3 seconds while streaming inputs
 *  5. On resolution, harvests and persists target domain session cookies
 *  6. Resumes automation cleanly
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

    // Start live screencast stream on active browser page
    if (browser.page) {
      await browser.page.waitForLoadState('domcontentloaded').catch(() => {});
      // Allow dynamic client-side auth widgets (Google Sign-In button iframes, OAuth buttons, modal forms) to settle
      await browser.page.waitForTimeout(1500);

      await browserStreamServer.startStreaming(this.sessionId, browser.page).catch((err) => {
        console.warn(`[InterventionManager] Could not start stream: ${err.message}`);
      });
    }

    // Persist every buffered entry BEFORE the long poll begins.
    await this.logger.flush();

    // Check for specific login options on the page to enhance description
    let enhancedDescription = description;
    if (
      (reason === InterventionReason.APPLICATION_BLOCKED_BY_LOGIN ||
       reason === InterventionReason.JOB_BOARD_AUTH_REQUIRED) &&
      browser.page
    ) {
      try {
        const pageHtml = await browser.page.content().catch(() => '');
        const options: string[] = [];
        if (/continue with google|sign in with google|google/i.test(pageHtml)) options.push('Google');
        if (/continue with apple|sign in with apple|apple/i.test(pageHtml)) options.push('Apple');
        if (/continue with linkedin|sign in with linkedin/i.test(pageHtml)) options.push('LinkedIn');
        if (/continue with email|sign in with your email|password/i.test(pageHtml)) options.push('Email & Password');

        if (options.length > 0 && !enhancedDescription.includes('options:')) {
          enhancedDescription = `${enhancedDescription} (Available options: ${options.join(', ')})`;
        }
      } catch {}
    }

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
      description: enhancedDescription,
      pageUrl,
      screenshotUrl,
    };

    // Create the intervention request on Railway
    const result = await this.apiClient.createIntervention(this.sessionId, payload);
    const interventionId = typeof result === 'string' ? result : result.interventionId;

    if (typeof result === 'object' && result.autoResolved && result.resolution === 'skipped') {
      await browserStreamServer.stopStreaming(this.sessionId).catch(() => {});
      await this.logger.info('intervention_auto_skipped', `Intervention auto-skipped: ${reason}`);
      throw new InterventionSkippedError();
    }

    await this.logger.info('intervention_created', `Intervention request created — waiting for user`, {
      interventionId,
    });

    try {
      // Poll for resolution
      await this.waitForResolution(interventionId);

      // On successful completion, harvest active session cookies & storage state
      const harvested = await browserStreamServer.harvestSession(this.sessionId);
      if (harvested && harvested.cookies?.length > 0) {
        await this.logger.info('session_harvested', `Harvested session cookies for ${harvested.provider} (${harvested.domain})`);
        await this.apiClient.saveHarvestedSession(this.sessionId, harvested);
      }
    } finally {
      // Clean up stream session
      await browserStreamServer.stopStreaming(this.sessionId).catch(() => {});
    }
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
        throw new InterventionSkippedError();
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
