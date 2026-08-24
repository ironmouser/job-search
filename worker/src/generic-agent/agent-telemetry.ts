/**
 * worker/src/generic-agent/agent-telemetry.ts
 *
 * AgentTelemetry — per-action telemetry logger for the hybrid agent.
 *
 * Records structured data for every significant browser action:
 *  - Which tier resolved the action (deterministic | deepseek | gemini | ...)
 *  - Model confidence and deterministic score
 *  - Latency per action
 *  - Token usage per AI call
 *  - Session-level aggregate metrics
 *
 * Wraps the existing ExecutionLogger so all telemetry flows through the
 * standard Railway log pipeline with no additional infrastructure.
 */

import { ExecutionLogger } from '../execution-logger';
import {
  AgentTelemetryEntry,
  AgentSessionMetrics,
  AgentState,
  ActionSource,
  AgentActionType,
} from './types';

export class AgentTelemetry {
  private entries: AgentTelemetryEntry[] = [];
  private metrics: AgentSessionMetrics;

  constructor(
    private readonly sessionId: string,
    private readonly logger: ExecutionLogger,
  ) {
    this.metrics = this.createEmptyMetrics(sessionId);
  }

  // ─── Record a single action ────────────────────────────────────────────────

  async record(entry: AgentTelemetryEntry): Promise<void> {
    this.entries.push(entry);
    this.updateMetrics(entry);

    // Forward to execution logger so it shows in Railway logs
    await this.logger.log(
      entry.result === 'failed' ? 'warn' as any : 'info' as any,
      `agent_action:${entry.action}`,
      `[${entry.actionSource}] ${entry.action} → ${entry.result} (${entry.latencyMs}ms)`,
      {
        currentState: entry.currentState,
        previousState: entry.previousState,
        actionSource: entry.actionSource,
        confidence: entry.modelConfidence ?? entry.deterministicScore,
        reason: entry.reason,
        target: entry.targetElement,
        model: entry.model,
        tokens: this.buildTokenSummary(entry),
      },
      entry.latencyMs
    );
  }

  // ─── Convenience builders ──────────────────────────────────────────────────

  buildEntry(params: {
    currentState: AgentState;
    previousState: AgentState;
    url: string;
    action: AgentActionType | string;
    actionSource: ActionSource;
    reason: string;
    result: 'success' | 'failed' | 'skipped';
    latencyMs: number;
    model?: string;
    modelConfidence?: number;
    deterministicScore?: number;
    targetElement?: string;
    nextState?: AgentState;
    deepseekPromptTokens?: number;
    deepseekCompletionTokens?: number;
    geminiPromptTokens?: number;
    geminiCompletionTokens?: number;
  }): AgentTelemetryEntry {
    return {
      workflowSessionId: this.sessionId,
      timestamp: new Date().toISOString(),
      ...params,
    };
  }

  // ─── Session metrics ───────────────────────────────────────────────────────

  markApplicationAttempted(): void {
    this.metrics.applicationAttempted = true;
  }

  markApplicationCompleted(): void {
    this.metrics.applicationCompleted = true;
  }

  markApplicationFailed(): void {
    this.metrics.applicationFailed = true;
  }

  incrementManualIntervention(): void {
    this.metrics.manualInterventionCount++;
  }

  getMetrics(): Readonly<AgentSessionMetrics> {
    return { ...this.metrics };
  }

  getEntries(): ReadonlyArray<AgentTelemetryEntry> {
    return [...this.entries];
  }

  /** Flush session-level aggregate metrics to the execution log. */
  async flushSessionMetrics(): Promise<void> {
    const m = this.metrics;
    const totalAI = m.deepseekActions + m.geminiActions;
    const deterministicRate =
      m.totalActions > 0
        ? Math.round((m.deterministicActions / m.totalActions) * 100)
        : 0;

    await this.logger.info(
      'agent_session_metrics',
      `Session complete — ${m.totalActions} actions (${deterministicRate}% deterministic, ${totalAI} AI calls)`,
      {
        sessionId: m.sessionId,
        applicationAttempted: m.applicationAttempted,
        applicationCompleted: m.applicationCompleted,
        applicationFailed: m.applicationFailed,
        manualInterventionCount: m.manualInterventionCount,
        totalActions: m.totalActions,
        successfulActions: m.successfulActions,
        failedActions: m.failedActions,
        deterministicActions: m.deterministicActions,
        deterministicRate: `${deterministicRate}%`,
        deepseekActions: m.deepseekActions,
        geminiActions: m.geminiActions,
        strategyMemoryHits: m.strategyMemoryHits,
        totalDeepseekTokens: m.totalDeepseekPromptTokens + m.totalDeepseekCompletionTokens,
        totalGeminiTokens: m.totalGeminiPromptTokens + m.totalGeminiCompletionTokens,
        avgLatencyMs: m.totalActions > 0
          ? Math.round(m.totalLatencyMs / m.totalActions)
          : 0,
      }
    );
  }

  // ─── Private helpers ───────────────────────────────────────────────────────

  private updateMetrics(entry: AgentTelemetryEntry): void {
    this.metrics.totalActions++;
    this.metrics.totalLatencyMs += entry.latencyMs;

    if (entry.result === 'success') this.metrics.successfulActions++;
    if (entry.result === 'failed') this.metrics.failedActions++;

    switch (entry.actionSource) {
      case 'deterministic': this.metrics.deterministicActions++; break;
      case 'deepseek':      this.metrics.deepseekActions++;      break;
      case 'gemini':        this.metrics.geminiActions++;        break;
      case 'strategy_memory': this.metrics.strategyMemoryHits++; break;
    }

    if (entry.deepseekPromptTokens)     this.metrics.totalDeepseekPromptTokens += entry.deepseekPromptTokens;
    if (entry.deepseekCompletionTokens) this.metrics.totalDeepseekCompletionTokens += entry.deepseekCompletionTokens;
    if (entry.geminiPromptTokens)       this.metrics.totalGeminiPromptTokens += entry.geminiPromptTokens;
    if (entry.geminiCompletionTokens)   this.metrics.totalGeminiCompletionTokens += entry.geminiCompletionTokens;
  }

  private buildTokenSummary(entry: AgentTelemetryEntry): string | undefined {
    const parts: string[] = [];
    if ((entry.deepseekPromptTokens ?? 0) > 0 || (entry.deepseekCompletionTokens ?? 0) > 0) {
      parts.push(`deepseek=${entry.deepseekPromptTokens ?? 0}+${entry.deepseekCompletionTokens ?? 0}`);
    }
    if ((entry.geminiPromptTokens ?? 0) > 0 || (entry.geminiCompletionTokens ?? 0) > 0) {
      parts.push(`gemini=${entry.geminiPromptTokens ?? 0}+${entry.geminiCompletionTokens ?? 0}`);
    }
    return parts.length > 0 ? parts.join(', ') : undefined;
  }

  private createEmptyMetrics(sessionId: string): AgentSessionMetrics {
    return {
      sessionId,
      applicationAttempted: false,
      applicationCompleted: false,
      applicationFailed: false,
      manualInterventionCount: 0,
      deterministicActions: 0,
      deepseekActions: 0,
      geminiActions: 0,
      strategyMemoryHits: 0,
      totalActions: 0,
      totalDeepseekPromptTokens: 0,
      totalDeepseekCompletionTokens: 0,
      totalGeminiPromptTokens: 0,
      totalGeminiCompletionTokens: 0,
      totalLatencyMs: 0,
      successfulActions: 0,
      failedActions: 0,
    };
  }
}
