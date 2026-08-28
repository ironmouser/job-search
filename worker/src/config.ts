/**
 * worker/src/config.ts
 *
 * Centralized, environment-driven configuration for the Auto Apply Worker.
 * All AI model names, confidence thresholds, and feature flags are read from
 * environment variables with sensible defaults so they can be tuned per-deployment
 * without code changes.
 *
 * Usage:
 *   import { agentConfig } from './config';
 *   if (agentConfig.aiNavigationEnabled) { ... }
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AgentConfig {
  /** Primary navigation/reasoning model (GLM-5.3-Flash, DeepSeek V4 Flash) */
  primaryAgentModel: string;

  /** Visual fallback model (Gemini Flash-Lite) */
  visionFallbackModel: string;

  /**
   * High-confidence threshold (0–1).
   * Above this → execute after Playwright validation.
   */
  highConfidenceThreshold: number;

  /**
   * Medium-confidence threshold (0–1).
   * Between this and high → additional verification / screenshot fallback.
   * Below this → do not auto-execute.
   */
  mediumConfidenceThreshold: number;

  /** Enable/disable Gemini screenshot fallback entirely */
  visionFallbackEnabled: boolean;

  /** Enable/disable AI-assisted navigation (GLM + DeepSeek + Gemini layers) */
  aiNavigationEnabled: boolean;

  /** Enable/disable strategy memory (store/reuse successful navigation paths) */
  strategyMemoryEnabled: boolean;

  /** Path for strategy memory JSON file */
  strategyMemoryPath: string;

  /** GLM API key */
  glmApiKey: string | undefined;

  /** GLM API base URL */
  glmApiBaseUrl: string;

  /** DeepSeek API key */
  deepseekApiKey: string | undefined;

  /** Gemini API key */
  geminiApiKey: string | undefined;

  /** Max seconds to wait for a GLM navigation response */
  glmNavigationTimeoutMs: number;

  /** Max seconds to wait for a DeepSeek navigation response */
  deepseekNavigationTimeoutMs: number;

  /** Max seconds to wait for a Gemini visual response */
  geminiNavigationTimeoutMs: number;

  /** Maximum interaction hops the generic agent will attempt before stopping */
  maxNavigationHops: number;
}

// ─── Parser helpers ───────────────────────────────────────────────────────────

function parseFloat_(key: string, defaultValue: number): number {
  const raw = process.env[key];
  if (raw === undefined || raw.trim() === '') return defaultValue;
  const parsed = parseFloat(raw);
  return isNaN(parsed) ? defaultValue : parsed;
}

function parseInt_(key: string, defaultValue: number): number {
  const raw = process.env[key];
  if (raw === undefined || raw.trim() === '') return defaultValue;
  const parsed = parseInt(raw, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

function parseBool(key: string, defaultValue: boolean): boolean {
  const raw = process.env[key];
  if (raw === undefined || raw.trim() === '') return defaultValue;
  return raw.trim().toLowerCase() === 'true';
}

function parseString(key: string, defaultValue: string): string {
  const raw = process.env[key];
  return raw !== undefined && raw.trim() !== '' ? raw.trim() : defaultValue;
}

// ─── Singleton config ─────────────────────────────────────────────────────────

export const agentConfig: AgentConfig = {
  primaryAgentModel: parseString('PRIMARY_AGENT_MODEL', 'glm-5.3-flash'),
  visionFallbackModel: parseString('VISION_FALLBACK_MODEL', 'gemini-3.1-flash-lite'),

  highConfidenceThreshold: parseFloat_('AGENT_HIGH_CONFIDENCE_THRESHOLD', 0.90),
  mediumConfidenceThreshold: parseFloat_('AGENT_MEDIUM_CONFIDENCE_THRESHOLD', 0.70),

  visionFallbackEnabled: parseBool('VISION_FALLBACK_ENABLED', true),
  aiNavigationEnabled: parseBool('AI_NAVIGATION_ENABLED', true),
  strategyMemoryEnabled: parseBool('STRATEGY_MEMORY_ENABLED', true),

  strategyMemoryPath: parseString(
    'STRATEGY_MEMORY_PATH',
    '/tmp/jahq-strategy-memory.json'
  ),

  glmApiKey: process.env.GLM_API_KEY || process.env.ZHIPU_API_KEY,
  glmApiBaseUrl: parseString('GLM_API_BASE_URL', 'https://open.bigmodel.cn/api/paas/v4'),
  deepseekApiKey: process.env.DEEPSEEK_API_KEY,
  geminiApiKey: process.env.GEMINI_API_KEY,

  glmNavigationTimeoutMs: parseInt_('GLM_NAVIGATION_TIMEOUT_MS', 20000),
  deepseekNavigationTimeoutMs: parseInt_('DEEPSEEK_NAVIGATION_TIMEOUT_MS', 20000),
  geminiNavigationTimeoutMs: parseInt_('GEMINI_NAVIGATION_TIMEOUT_MS', 30000),

  maxNavigationHops: parseInt_('MAX_NAVIGATION_HOPS', 6),
};

// ─── Startup validation ───────────────────────────────────────────────────────

export function validateAIConfig(): { glmAvailable: boolean; deepseekAvailable: boolean; geminiAvailable: boolean } {
  const glmAvailable = !!agentConfig.glmApiKey;
  const deepseekAvailable = !!agentConfig.deepseekApiKey;
  const geminiAvailable = !!agentConfig.geminiApiKey;

  if (agentConfig.aiNavigationEnabled && !glmAvailable && !deepseekAvailable) {
    console.warn(
      '[AgentConfig] AI_NAVIGATION_ENABLED=true but neither GLM_API_KEY nor DEEPSEEK_API_KEY is set. ' +
      'AI navigation layer will be skipped — falling back to Gemini or manual intervention.'
    );
  }

  if (agentConfig.visionFallbackEnabled && !geminiAvailable) {
    console.warn(
      '[AgentConfig] VISION_FALLBACK_ENABLED=true but GEMINI_API_KEY is not set. ' +
      'Gemini visual fallback will be disabled.'
    );
  }

  return { glmAvailable, deepseekAvailable, geminiAvailable };
}
