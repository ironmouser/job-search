/**
 * worker/src/ai/deepseek-client.ts
 *
 * Minimal DeepSeek client for the worker process.
 * Mirrors the core of src/lib/deepseek.ts but:
 *  - No dependency on Next.js / web-app safeguard infrastructure
 *  - Supports JSON mode / structured output
 *  - Has a configurable timeout appropriate for navigation decisions
 *  - Returns token usage for telemetry
 */

import { agentConfig } from '../config';

export interface DeepSeekWorkerMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface DeepSeekWorkerOptions {
  messages: DeepSeekWorkerMessage[];
  jsonMode?: boolean;
  temperature?: number;
  maxTokens?: number;
  /** Override default model from config */
  model?: string;
  timeoutMs?: number;
}

export interface DeepSeekWorkerResult {
  content: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

/**
 * Call DeepSeek Chat Completions API from the worker process.
 * Returns structured result with token usage for telemetry.
 * Throws if the API key is absent or all attempts fail.
 */
export async function callDeepSeekWorker(
  options: DeepSeekWorkerOptions
): Promise<DeepSeekWorkerResult> {
  const apiKey = agentConfig.deepseekApiKey;
  if (!apiKey) {
    throw new Error('DEEPSEEK_API_KEY is not configured in worker environment.');
  }

  const model = options.model ?? agentConfig.primaryAgentModel;
  const timeoutMs = options.timeoutMs ?? agentConfig.deepseekNavigationTimeoutMs;
  const maxAttempts = 2;

  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const bodyPayload: Record<string, unknown> = {
        model,
        messages: options.messages,
        temperature: options.temperature ?? 0.1, // low temperature for deterministic decisions
        max_tokens: options.maxTokens ?? 1024,
      };

      if (options.jsonMode) {
        bodyPayload.response_format = { type: 'json_object' };
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      let res: Response;
      try {
        res = await fetch('https://api.deepseek.com/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
          },
          body: JSON.stringify(bodyPayload),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeoutId);
      }

      if (!res.ok) {
        const errData = await res.json().catch(() => ({})) as any;
        const errMsg = errData?.error?.message ?? `HTTP ${res.status} ${res.statusText}`;

        if ((res.status === 429 || res.status >= 500) && attempt < maxAttempts - 1) {
          const delayMs = 1500 + Math.floor(Math.random() * 500);
          console.warn(`[DeepSeekWorker] ${res.status} — retrying in ${delayMs}ms: ${errMsg}`);
          await new Promise(r => setTimeout(r, delayMs));
          continue;
        }

        throw new Error(`DeepSeek API error (${model}): ${errMsg}`);
      }

      const data = await res.json() as any;
      const choice = data?.choices?.[0];
      const content: string = choice?.message?.content ?? '';
      const usage = data?.usage ?? {};

      return {
        content,
        promptTokens: usage.prompt_tokens ?? 0,
        completionTokens: usage.completion_tokens ?? 0,
        totalTokens: usage.total_tokens ?? 0,
      };

    } catch (err: any) {
      lastError = err;
      if (err.name === 'AbortError') {
        throw new Error(`DeepSeek request timed out after ${timeoutMs}ms`);
      }
      if (attempt < maxAttempts - 1) {
        const delayMs = 1500 + Math.floor(Math.random() * 500);
        console.warn(`[DeepSeekWorker] Attempt ${attempt + 1} failed, retrying in ${delayMs}ms:`, err.message);
        await new Promise(r => setTimeout(r, delayMs));
      }
    }
  }

  throw lastError ?? new Error('All DeepSeek API attempts failed.');
}

/**
 * Parse a DeepSeek JSON response safely.
 * Returns null if parsing fails (caller should treat as low confidence).
 */
export function parseDeepSeekJson<T>(content: string): T | null {
  try {
    // Strip markdown code fences if the model wrapped the JSON
    const cleaned = content.trim().replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    return JSON.parse(cleaned) as T;
  } catch {
    return null;
  }
}
