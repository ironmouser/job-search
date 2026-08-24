/**
 * worker/src/ai/gemini-client.ts
 *
 * Minimal Gemini client for the worker process.
 * Supports:
 *  - Text-only prompts
 *  - Multimodal input (base64 screenshot + text) for visual fallback
 *  - JSON mode
 *  - Returns token usage for telemetry
 */

import { agentConfig } from '../config';

export interface GeminiWorkerPart {
  text?: string;
  inlineData?: {
    mimeType: string;
    data: string; // base64
  };
}

export interface GeminiWorkerMessage {
  role: 'user' | 'model';
  parts: GeminiWorkerPart[];
}

export interface GeminiWorkerOptions {
  systemInstruction?: string;
  contents: GeminiWorkerMessage[];
  jsonMode?: boolean;
  temperature?: number;
  maxTokens?: number;
  /** Override default model from config */
  model?: string;
  timeoutMs?: number;
}

export interface GeminiWorkerResult {
  content: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

/**
 * Call Google Gemini API from the worker process.
 * Returns structured result with token usage for telemetry.
 * Throws if the API key is absent or all attempts fail.
 */
export async function callGeminiWorker(
  options: GeminiWorkerOptions
): Promise<GeminiWorkerResult> {
  const apiKey = agentConfig.geminiApiKey;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured in worker environment.');
  }

  const model = options.model ?? agentConfig.visionFallbackModel;
  const timeoutMs = options.timeoutMs ?? agentConfig.geminiNavigationTimeoutMs;
  const maxAttempts = 2;

  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const bodyPayload: Record<string, unknown> = {
        contents: options.contents,
        generationConfig: {
          temperature: options.temperature ?? 0.1,
          ...(options.maxTokens ? { maxOutputTokens: options.maxTokens } : {}),
          ...(options.jsonMode ? { responseMimeType: 'application/json' } : {}),
        },
      };

      if (options.systemInstruction) {
        bodyPayload.systemInstruction = {
          parts: [{ text: options.systemInstruction }],
        };
      }

      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      let res: Response;
      try {
        res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
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
          const delayMs = 2000 * (attempt + 1);
          console.warn(`[GeminiWorker] ${res.status} — retrying in ${delayMs}ms: ${errMsg}`);
          await new Promise(r => setTimeout(r, delayMs));
          continue;
        }

        throw new Error(`Gemini API error (${model}): ${errMsg}`);
      }

      const data = await res.json() as any;
      const content: string = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
      const usage = data?.usageMetadata ?? {};

      return {
        content,
        promptTokens: usage.promptTokenCount ?? 0,
        completionTokens: usage.candidatesTokenCount ?? 0,
        totalTokens: (usage.promptTokenCount ?? 0) + (usage.candidatesTokenCount ?? 0),
      };

    } catch (err: any) {
      lastError = err;
      if (err.name === 'AbortError') {
        throw new Error(`Gemini request timed out after ${timeoutMs}ms`);
      }
      if (attempt < maxAttempts - 1) {
        const delayMs = 2000;
        console.warn(`[GeminiWorker] Attempt ${attempt + 1} failed, retrying in ${delayMs}ms:`, err.message);
        await new Promise(r => setTimeout(r, delayMs));
      }
    }
  }

  throw lastError ?? new Error('All Gemini API attempts failed.');
}

/**
 * Parse a Gemini JSON response safely.
 * Returns null if parsing fails (caller should treat as low confidence).
 */
export function parseGeminiJson<T>(content: string): T | null {
  try {
    const cleaned = content.trim().replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    return JSON.parse(cleaned) as T;
  } catch {
    return null;
  }
}

/**
 * Capture a Playwright page screenshot and return as base64 for Gemini multimodal input.
 */
export async function captureScreenshotBase64(page: import('playwright').Page): Promise<string | null> {
  try {
    const buffer = await page.screenshot({ type: 'png', fullPage: false });
    return buffer.toString('base64');
  } catch {
    return null;
  }
}
