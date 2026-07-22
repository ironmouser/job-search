import { LogLevel, ExecutionLogEntry } from './types';
import { RailwayAPIClient } from './api-client';

/**
 * ExecutionLogger — generates and batches execution log entries.
 *
 * The logger buffers entries in memory and flushes to Railway API:
 *  - When the buffer reaches 10 entries
 *  - When an ERROR level entry is received (immediate flush)
 *  - When flush() is called explicitly (e.g., at end of workflow)
 *
 * PII sanitization: strips email addresses, phone numbers, SSN patterns
 * from metadata values before persisting.
 */
export class ExecutionLogger {
  private buffer: ExecutionLogEntry[] = [];
  private readonly FLUSH_THRESHOLD = 10;

  constructor(
    private readonly sessionId: string,
    private readonly apiClient: RailwayAPIClient
  ) {}

  // ─── Convenience methods ──────────────────────────────────────────────────

  async info(step: string, message: string, metadata?: Record<string, unknown>): Promise<void> {
    return this.log(LogLevel.INFO, step, message, metadata);
  }

  async warn(step: string, message: string, metadata?: Record<string, unknown>): Promise<void> {
    return this.log(LogLevel.WARN, step, message, metadata);
  }

  async error(step: string, message: string, metadata?: Record<string, unknown>): Promise<void> {
    return this.log(LogLevel.ERROR, step, message, metadata);
  }

  async debug(step: string, message: string, metadata?: Record<string, unknown>): Promise<void> {
    return this.log(LogLevel.DEBUG, step, message, metadata);
  }

  // ─── Core log method ──────────────────────────────────────────────────────

  async log(
    level: LogLevel,
    step: string,
    message: string,
    metadata?: Record<string, unknown>,
    durationMs?: number
  ): Promise<void> {
    const entry: ExecutionLogEntry = {
      timestamp: new Date().toISOString(),
      level,
      step,
      message,
      metadata: metadata ? this.sanitize(metadata) : undefined,
      durationMs,
    };

    this.buffer.push(entry);

    // Flush immediately on error or when buffer is full
    if (level === LogLevel.ERROR || this.buffer.length >= this.FLUSH_THRESHOLD) {
      await this.flush();
    }
  }

  // ─── Timed step helper ────────────────────────────────────────────────────

  /**
   * Wrap an async operation with automatic timing + logging.
   * Logs start and end with duration.
   */
  async timed<T>(
    step: string,
    fn: () => Promise<T>,
    successMessage?: string
  ): Promise<T> {
    const start = Date.now();
    try {
      const result = await fn();
      const durationMs = Date.now() - start;
      await this.log(LogLevel.INFO, step, successMessage ?? step, undefined, durationMs);
      return result;
    } catch (err: any) {
      const durationMs = Date.now() - start;
      await this.log(LogLevel.ERROR, step, `${step} failed: ${err.message}`, { error: err.message }, durationMs);
      throw err;
    }
  }

  // ─── Flush ────────────────────────────────────────────────────────────────

  async flush(): Promise<void> {
    if (this.buffer.length === 0) return;
    const entries = [...this.buffer];
    this.buffer = [];

    try {
      await this.apiClient.postLogs(this.sessionId, entries);
    } catch (err) {
      // Re-buffer on failure — will try again next flush
      this.buffer = [...entries, ...this.buffer];
      console.warn('[ExecutionLogger] Failed to flush logs:', err);
    }
  }

  // ─── PII sanitization ─────────────────────────────────────────────────────

  private sanitize(metadata: Record<string, unknown>): Record<string, unknown> {
    const sanitized: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(metadata)) {
      if (typeof value === 'string') {
        sanitized[key] = this.scrubString(value);
      } else if (typeof value === 'object' && value !== null) {
        sanitized[key] = this.sanitize(value as Record<string, unknown>);
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }

  private scrubString(str: string): string {
    return str
      // Email addresses
      .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[EMAIL]')
      // Phone numbers (various formats)
      .replace(/(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/g, '[PHONE]')
      // SSN patterns
      .replace(/\d{3}-\d{2}-\d{4}/g, '[SSN]');
  }
}
