/**
 * worker/src/generic-agent/types.ts
 *
 * Types, enums, and data contracts for the Generic Application Agent.
 *
 * Includes:
 *  - Existing page analysis types (PageClassification, ApplicationControlCandidate, etc.)
 *  - New: AgentState, ActionSource, AXTreeElement, SemanticSnapshot
 *  - New: AgentAction, AgentTelemetryEntry, AgentDecision
 *  - New: StrategyMemoryEntry
 */

import { Frame, Locator, Page } from 'playwright';
import { ElementHitTestInfo } from '../obstruction/types';

// ─── Existing Page Analysis Types ─────────────────────────────────────────────

export enum PageClassification {
  JOB_DETAIL_PAGE = 'JOB_DETAIL_PAGE',
  APPLICATION_START_PAGE = 'APPLICATION_START_PAGE',
  APPLICATION_FORM = 'APPLICATION_FORM',
  APPLICATION_CONTINUATION = 'APPLICATION_CONTINUATION',
  AUTHENTICATION_REQUIRED = 'AUTHENTICATION_REQUIRED',
  CAPTCHA_CHALLENGE = 'CAPTCHA_CHALLENGE',
  BOT_CHALLENGE = 'BOT_CHALLENGE',
  ERROR_PAGE = 'ERROR_PAGE',
  JOB_CLOSED = 'JOB_CLOSED',
  UNSUPPORTED_PAGE = 'UNSUPPORTED_PAGE',
  UNKNOWN = 'UNKNOWN',
}

export type ConfidenceTier = 'HIGH' | 'MEDIUM' | 'LOW';

/** Page region classification for candidate elements */
export type PageRegion =
  | 'job-header'
  | 'job-content'
  | 'application-content'
  | 'cookie-banner'
  | 'modal'
  | 'dialog'
  | 'navigation'
  | 'footer'
  | 'advertisement'
  | 'related-jobs'
  | 'sidebar'
  | 'unknown';

export interface ApplicationControlCandidate {
  index: number;
  selector?: string;
  locator?: Locator;
  text: string;
  ariaLabel: string;
  role: string;
  tagName: string;
  href: string | null;
  resolvedHref: string | null;
  confidence: number;
  confidenceTier: ConfidenceTier;
  positiveSignals: string[];
  negativeSignals: string[];
  isButton: boolean;
  isVisible: boolean;
  isEnabled: boolean;
  isInViewport: boolean;
  hitTestInfo?: ElementHitTestInfo;
  isObstructed?: boolean;
  /** Page region where the element was found */
  region?: PageRegion;
  /** Bounding box {x, y, width, height} in viewport pixels */
  boundingBox?: { x: number; y: number; width: number; height: number } | null;
}

export interface SecurityBlockerInfo {
  type: 'CAPTCHA' | 'BOT_CHALLENGE' | 'AUTHENTICATION_REQUIRED' | 'SECURITY_VERIFICATION';
  reason: string;
  detectedKeywords: string[];
}

export interface PageMetadataInfo {
  url: string;
  title: string;
  description: string;
  hasJobPostingSchema: boolean;
  schemaJobTitle?: string;
  schemaApplyUrl?: string;
  canonicalUrl?: string;
}

export interface FormPresenceInfo {
  hasForm: boolean;
  inputCount: number;
  hasResumeUpload: boolean;
  hasCoverLetterUpload: boolean;
  hasEmailInput: boolean;
  hasNameInput: boolean;
  hasSubmitButton: boolean;
  hasWizardNextButton: boolean;
  frameContextsCount: number;
}

export interface PageAnalysisResult {
  url: string;
  classification: PageClassification;
  confidence: number;
  pageMetadata: PageMetadataInfo;
  formPresence: FormPresenceInfo;
  securityBlocker?: SecurityBlockerInfo;
  candidates: ApplicationControlCandidate[];
  bestControl?: ApplicationControlCandidate;
  reasons: string[];
}

export interface FormFieldMapping {
  name: string;
  locator: Locator;
  type: 'text' | 'email' | 'tel' | 'file' | 'select' | 'checkbox' | 'radio' | 'textarea';
  matchedProperty: string;
  valueToFill: string;
  required: boolean;
}

// ─── Agent State Machine ───────────────────────────────────────────────────────

/**
 * Formal state machine states for the browser agent workflow.
 * The agent always knows its current state and only transitions
 * via the AgentStateMachine class.
 */
export enum AgentState {
  // Navigation states
  INITIALIZING = 'INITIALIZING',
  JOB_PAGE = 'JOB_PAGE',
  IDENTIFYING_APPLICATION_TRIGGER = 'IDENTIFYING_APPLICATION_TRIGGER',
  CLICKING_APPLICATION_TRIGGER = 'CLICKING_APPLICATION_TRIGGER',
  INTERSTITIAL = 'INTERSTITIAL',
  COOKIE_CONSENT = 'COOKIE_CONSENT',

  // Form states
  APPLICATION_FORM = 'APPLICATION_FORM',
  FORM_STEP = 'FORM_STEP',
  FORM_VALIDATION = 'FORM_VALIDATION',
  REVIEW = 'REVIEW',
  SUBMITTING = 'SUBMITTING',
  COMPLETED = 'COMPLETED',

  // Blocked / terminal states
  LOGIN_REQUIRED = 'LOGIN_REQUIRED',
  MFA_REQUIRED = 'MFA_REQUIRED',
  CAPTCHA_REQUIRED = 'CAPTCHA_REQUIRED',
  BOT_CHALLENGE = 'BOT_CHALLENGE',
  JOB_EXPIRED = 'JOB_EXPIRED',
  ERROR = 'ERROR',
  UNKNOWN = 'UNKNOWN',
  MANUAL_INTERVENTION = 'MANUAL_INTERVENTION',
}

// ─── Action Source ─────────────────────────────────────────────────────────────

/**
 * What tier of the architecture produced a browser action.
 * Used for telemetry to measure deterministic vs AI rates.
 */
export type ActionSource =
  | 'strategy_memory'     // Tier 0: known strategy loaded from memory
  | 'deterministic'       // Tier 1: deterministic DOM analysis
  | 'deepseek'            // Tier 2: DeepSeek V4 Flash AXTree reasoning
  | 'gemini'              // Tier 3: Gemini visual screenshot fallback
  | 'manual'              // Tier 4: manual intervention
  | 'ats_plugin';         // Tier 0: known ATS-specific plugin

// ─── AXTree / Semantic Snapshot ───────────────────────────────────────────────

/**
 * A single element in the accessibility/semantic snapshot.
 * Sent to DeepSeek for reasoning — compact, no raw HTML.
 */
export interface AXTreeElement {
  /** Stable element ID for this analysis pass (e.g., "element_17") */
  id: string;
  tag: string;
  role: string;
  name: string;        // text content / accessible name
  ariaLabel: string;
  href?: string;
  visible: boolean;
  enabled: boolean;
  inViewport: boolean;
  region: PageRegion;
  bbox?: { x: number; y: number; w: number; h: number };
}

/**
 * Full semantic snapshot of the current page, sent to AI models.
 * Compact representation — no raw HTML.
 */
export interface SemanticSnapshot {
  url: string;
  title: string;
  elements: AXTreeElement[];
  /** Plain-text representation ready to embed in an AI prompt */
  textRepresentation: string;
}

// ─── Agent Decisions ──────────────────────────────────────────────────────────

/**
 * Structured decision returned by the AI decision engines (DeepSeek / Gemini).
 * All AI actions MUST go through Playwright validation before execution.
 */
export interface AgentDecision {
  action: AgentActionType;
  /** Element ID from the semantic snapshot (for click/fill/select actions) */
  target_id?: string;
  /** Coordinate-based target (Gemini visual fallback only) */
  x?: number;
  y?: number;
  /** For 'fill' actions */
  value?: string;
  /** For 'classify' actions */
  page_type?: string;
  /** For 'select' actions */
  option?: string;
  confidence: number;
  reason: string;
}

export type AgentActionType =
  | 'click'
  | 'dismiss'
  | 'classify'
  | 'fill'
  | 'select'
  | 'scroll'
  | 'wait'
  | 'stop'
  | 'manual_intervention';

// ─── Telemetry ────────────────────────────────────────────────────────────────

/**
 * Per-action telemetry entry logged for every significant browser action.
 * Enables measurement of deterministic vs AI rates, latency, and cost.
 */
export interface AgentTelemetryEntry {
  workflowSessionId: string;
  timestamp: string;
  currentState: AgentState;
  previousState: AgentState;
  url: string;
  action: AgentActionType | string;
  actionSource: ActionSource;
  model?: string;
  modelConfidence?: number;
  deterministicScore?: number;
  targetElement?: string;
  reason: string;
  result: 'success' | 'failed' | 'skipped';
  nextState?: AgentState;
  latencyMs: number;
  deepseekPromptTokens?: number;
  deepseekCompletionTokens?: number;
  geminiPromptTokens?: number;
  geminiCompletionTokens?: number;
}

/**
 * Session-level aggregate metrics, tracked in memory and flushed at session end.
 */
export interface AgentSessionMetrics {
  sessionId: string;
  applicationAttempted: boolean;
  applicationCompleted: boolean;
  applicationFailed: boolean;
  manualInterventionCount: number;
  deterministicActions: number;
  deepseekActions: number;
  geminiActions: number;
  strategyMemoryHits: number;
  totalActions: number;
  totalDeepseekPromptTokens: number;
  totalDeepseekCompletionTokens: number;
  totalGeminiPromptTokens: number;
  totalGeminiCompletionTokens: number;
  totalLatencyMs: number;
  successfulActions: number;
  failedActions: number;
}

// ─── Strategy Memory ──────────────────────────────────────────────────────────

/**
 * Stored navigation strategy for a known domain.
 * Learned from successful application navigation and reused on subsequent visits.
 */
export interface StrategyMemoryEntry {
  domain: string;
  ats?: string;
  applicationTriggerSelector?: string;
  applicationTriggerText?: string;
  cookieSelector?: string;
  applicationUrlPattern?: string;
  flow: string[];
  successfulSelectors: string[];
  lastUsed: string;
  successCount: number;
  failureCount: number;
  /** Navigation sequence metadata */
  navigationSequence?: Array<{
    state: string;
    action: string;
    selector?: string;
    waitFor?: string;
  }>;
}
