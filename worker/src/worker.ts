import {
  AutomationWorker,
  QueuedSession,
  WorkflowResult,
  WorkerHealthStatus,
  AutoApplyStatus,
  ATSPlatform,
} from './types';
import { RailwayAPIClient } from './api-client';
import { WorkflowEngine } from './workflow-engine';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { version: WORKER_VERSION } = require('../package.json') as { version: string };


/**
 * WorkerProcess — implements the AutomationWorker interface.
 *
 * Responsibilities:
 *  - Poll the Railway API queue every POLL_INTERVAL_MS
 *  - Claim and process one session at a time (MVP)
 *  - Delegate execution to WorkflowEngine
 *  - Report health status via healthCheck()
 *
 * Infrastructure-agnostic: nothing here is DigitalOcean-specific.
 * The worker can be migrated to any VPS, Kubernetes, or cloud browser service.
 */
export class WorkerProcess implements AutomationWorker {
  private running = false;
  private currentSessionId: string | null = null;
  private sessionsProcessed = 0;
  private startTime = Date.now();
  private pollTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly apiClient: RailwayAPIClient,
    private readonly workerId: string,
    private readonly pollIntervalMs: number
  ) {}

  // ─── AutomationWorker interface ───────────────────────────────────────────

  async start(): Promise<void> {
    this.running = true;
    console.info(`[WorkerProcess] Poll loop started`);
    await this.poll();
  }

  async shutdown(): Promise<void> {
    console.info('[WorkerProcess] Shutting down — waiting for current session to finish');
    this.running = false;
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
    // Current session will finish naturally — we don't kill mid-workflow
  }

  async processSession(session: QueuedSession): Promise<WorkflowResult> {
    this.currentSessionId = session.sessionId;

    const engine = new WorkflowEngine(this.apiClient, this.workerId);

    try {
      const result = await engine.execute(session);
      this.sessionsProcessed++;
      return result;
    } catch (err: any) {
      console.error(`[WorkerProcess] Session ${session.sessionId} threw unexpectedly:`, err);

      // Report failure back to Railway
      await this.apiClient.updateSessionStatus(session.sessionId, {
        status: AutoApplyStatus.FAILED,
        failureReason: 'unexpected_error',
        failureDetails: err?.message ?? 'Unknown error in worker process',
      }).catch(() => {}); // swallow — we're already in error handling

      this.sessionsProcessed++;

      return {
        status: AutoApplyStatus.FAILED,
        canComplete: false,
        platform: ATSPlatform.UNKNOWN,
        automationConfidence: 0,
        stepsCompleted: 0,
        stepsRemaining: 0,
        blockingIssue: err?.message ?? 'Unexpected error',
        estimatedSubmissionTime: null,
      };
    } finally {
      this.currentSessionId = null;
    }
  }

  healthCheck(): WorkerHealthStatus {
    return {
      workerId: this.workerId,
      workerVersion: WORKER_VERSION,
      status: this.currentSessionId ? 'processing' : 'idle',
      currentSessionId: this.currentSessionId,
      uptimeSeconds: Math.floor((Date.now() - this.startTime) / 1000),
      sessionsProcessed: this.sessionsProcessed,
      lastHeartbeat: new Date().toISOString(),
    };
  }

  // ─── Private polling loop ─────────────────────────────────────────────────

  private async poll(): Promise<void> {
    if (!this.running) return;

    try {
      const session = await this.apiClient.pollQueue();

      if (session) {
        console.info(`[WorkerProcess] Picked up session ${session.sessionId} — job: ${session.jobId}`);
        await this.processSession(session);
      }
    } catch (err) {
      console.error('[WorkerProcess] Poll error:', err);
    }

    // Schedule next poll
    if (this.running) {
      this.pollTimer = setTimeout(() => this.poll(), this.pollIntervalMs);
    }
  }
}
