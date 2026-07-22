/**
 * RailwayAPIClient
 *
 * The worker's ONLY interface to the outside world.
 * All state reads and writes go through this client.
 * The worker never connects to the database directly.
 *
 * Authenticated via a shared WORKER_API_KEY.
 * This client is infrastructure-agnostic — nothing here is DigitalOcean-specific.
 */

import {
  QueuedSession,
  SessionStatusUpdate,
  ExecutionLogEntry,
  SessionContext,
  CreateInterventionPayload,
  InterventionStatus,
  WorkerHealthStatus,
} from './types';

export class RailwayAPIClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly workerId: string;

  constructor(baseUrl: string, apiKey: string, workerId: string) {
    this.baseUrl = baseUrl.replace(/\/$/, ''); // strip trailing slash
    this.apiKey = apiKey;
    this.workerId = workerId;
  }

  // ─── Queue ───────────────────────────────────────────────────────────────

  /**
   * Poll for the next queued session.
   * Returns null if no work is available (204 response).
   */
  async pollQueue(): Promise<QueuedSession | null> {
    const res = await this.request('GET', '/api/worker/queue/poll', null, {
      'x-worker-id': this.workerId,
    });

    if (res.status === 204) return null;
    if (!res.ok) throw new APIError('pollQueue', res.status, await res.text());

    return res.json() as Promise<QueuedSession>;
  }

  // ─── Session Status ───────────────────────────────────────────────────────

  /**
   * Update session status, step, platform info, failure details, etc.
   */
  async updateSessionStatus(sessionId: string, update: SessionStatusUpdate): Promise<void> {
    const res = await this.request(
      'PATCH',
      `/api/worker/sessions/${sessionId}/status`,
      update
    );
    if (!res.ok) throw new APIError('updateSessionStatus', res.status, await res.text());
  }

  // ─── Execution Logs ───────────────────────────────────────────────────────

  /**
   * Batch post execution log entries.
   * Worker buffers these in memory and calls flush() periodically.
   */
  async postLogs(sessionId: string, entries: ExecutionLogEntry[]): Promise<void> {
    if (entries.length === 0) return;

    const res = await this.request(
      'POST',
      `/api/worker/sessions/${sessionId}/logs`,
      { entries }
    );
    if (!res.ok) {
      // Non-fatal — log locally and continue. Losing logs is better than losing the session.
      console.error(`[APIClient] Failed to post logs: ${res.status} ${await res.text()}`);
    }
  }

  // ─── Session Context ──────────────────────────────────────────────────────

  /**
   * Fetch full context for a session (job details, assets, user profile).
   * Called once per session after claiming from the queue.
   */
  async getSessionContext(sessionId: string): Promise<SessionContext> {
    const res = await this.request('GET', `/api/worker/sessions/${sessionId}/context`);
    if (!res.ok) throw new APIError('getSessionContext', res.status, await res.text());
    return res.json() as Promise<SessionContext>;
  }

  // ─── Interventions ────────────────────────────────────────────────────────

  /**
   * Create a human intervention request.
   * Returns the interventionId — poll checkIntervention() for resolution.
   */
  async createIntervention(
    sessionId: string,
    payload: CreateInterventionPayload
  ): Promise<string> {
    const res = await this.request(
      'POST',
      `/api/worker/sessions/${sessionId}/intervention`,
      payload
    );
    if (!res.ok) throw new APIError('createIntervention', res.status, await res.text());
    const data = (await res.json()) as { interventionId: string };
    return data.interventionId;
  }

  /**
   * Check whether an intervention has been resolved by the user.
   */
  async checkIntervention(sessionId: string): Promise<InterventionStatus> {
    const res = await this.request(
      'GET',
      `/api/worker/sessions/${sessionId}/intervention`
    );
    if (!res.ok) throw new APIError('checkIntervention', res.status, await res.text());
    return res.json() as Promise<InterventionStatus>;
  }

  // ─── Heartbeat ────────────────────────────────────────────────────────────

  /**
   * Send worker health status to Railway.
   */
  async heartbeat(status: WorkerHealthStatus): Promise<void> {
    const res = await this.request('POST', '/api/worker/heartbeat', status);
    if (!res.ok) {
      // Non-fatal — heartbeat failure shouldn't stop automation
      console.warn(`[APIClient] Heartbeat failed: ${res.status}`);
    }
  }

  // ─── Private HTTP helper ──────────────────────────────────────────────────

  private async request(
    method: string,
    path: string,
    body?: unknown,
    extraHeaders?: Record<string, string>
  ): Promise<Response> {
    const url = `${this.baseUrl}${path}`;

    const headers: Record<string, string> = {
      'Authorization': `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
      ...extraHeaders,
    };

    const init: RequestInit = {
      method,
      headers,
    };

    if (body !== null && body !== undefined) {
      init.body = JSON.stringify(body);
    }

    return fetch(url, init);
  }
}

// ─── Error class ─────────────────────────────────────────────────────────────

export class APIError extends Error {
  constructor(
    public readonly operation: string,
    public readonly statusCode: number,
    public readonly body: string
  ) {
    super(`[RailwayAPIClient] ${operation} failed: HTTP ${statusCode} — ${body}`);
    this.name = 'APIError';
  }
}
