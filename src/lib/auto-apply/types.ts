/**
 * Auto Apply — Shared Types
 *
 * This file is the source of truth for all Auto Apply types and enums.
 * It is used by the Railway API routes and frontend components.
 * A copy lives in worker/src/types.ts for the DigitalOcean worker process.
 */

// ─── Enums ───────────────────────────────────────────────────────────────────

export enum AutoApplyStatus {
  IDLE = 'idle',
  QUEUED = 'queued',
  PROCESSING = 'processing',
  DETECTING_ATS = 'detecting_ats',
  PREPARING = 'preparing',
  APPLYING = 'applying',
  VALIDATING = 'validating',
  NEEDS_INTERVENTION = 'needs_intervention',
  APPLIED = 'applied',
  FAILED = 'failed',
  SKIPPED = 'skipped',
  CANCELLED = 'cancelled',
  SIMULATED = 'simulated',
}

export enum ATSPlatform {
  WORKDAY = 'workday',
  GREENHOUSE = 'greenhouse',
  LEVER = 'lever',
  ASHBY = 'ashby',
  SMARTRECRUITERS = 'smartrecruiters',
  TALEO = 'taleo',
  ICIMS = 'icims',
  UNKNOWN = 'unknown',
}

export enum InterventionReason {
  CAPTCHA = 'captcha',
  MFA_REQUIRED = 'mfa_required',
  UNKNOWN_QUESTION = 'unknown_question',
  UNEXPECTED_PAGE = 'unexpected_page',
  RESUME_REJECTED = 'resume_rejected',
  ATTACHMENT_MISSING = 'attachment_missing',
  LOGIN_REQUIRED = 'login_required',
  ASSESSMENT_REQUIRED = 'assessment_required',
}

export enum LogLevel {
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
  DEBUG = 'debug',
}

// ─── ATS Detection ───────────────────────────────────────────────────────────

export interface ATSDetectionResult {
  platform: ATSPlatform;
  /** 0–100 confidence score */
  confidence: number;
  detectedFeatures: string[];
  automationSupported: boolean;
}

// ─── Confidence Scoring ──────────────────────────────────────────────────────

export interface ConfidenceInput {
  platform: ATSPlatform;
  requiresLogin: boolean;
  hasResumeUpload: boolean;
  hasCoverLetterUpload: boolean;
  hasCaptcha: boolean;
  hasAssessments: boolean;
  hasDynamicQuestionnaire: boolean;
  hasWorkAuthQuestions: boolean;
  hasSalaryQuestions: boolean;
  /** Rolling success rate from past sessions: 0.0–1.0 */
  previousSuccessRate: number;
}

export interface ConfidenceResult {
  /** 0–100 automation confidence score */
  confidence: number;
  recommendation: 'auto' | 'assisted' | 'manual' | 'skip';
  explanation: string;
  /** Human-readable estimate e.g. "45 seconds" */
  estimatedCompletionTime: string;
}

// ─── Workflow ─────────────────────────────────────────────────────────────────

export interface WorkflowContext {
  sessionId: string;
  userId: string;
  jobId: string;
  jobUrl: string;
  resumeMarkdown: string;
  coverLetterMarkdown: string;
  userProfile: UserProfile;
  simulationMode: boolean;
}

export interface UserProfile {
  name: string;
  email: string;
  phone?: string;
  location?: string;
  linkedinUrl?: string;
  websiteUrl?: string;
}

export interface WorkflowResult {
  status: AutoApplyStatus;
  canComplete: boolean;
  platform: ATSPlatform;
  automationConfidence: number;
  stepsCompleted: number;
  stepsRemaining: number;
  blockingIssue: string | null;
  estimatedSubmissionTime: string | null;
}

// ─── Worker Queue ─────────────────────────────────────────────────────────────

/** The payload the worker receives when it polls the queue */
export interface QueuedSession {
  sessionId: string;
  jobId: string;
  userId: string;
  jobUrl: string;
  simulationMode: boolean;
  resumeMarkdown: string;
  coverLetterMarkdown: string;
  userProfile: UserProfile;
}

/** Full context fetched by the worker before executing the workflow */
export interface SessionContext {
  session: {
    id: string;
    status: string;
    simulationMode: boolean;
    retryCount: number;
    maxRetries: number;
  };
  job: {
    id: string;
    title: string;
    company: string;
    url: string;
    description: string | null;
    requirements: string | null;
  };
  assets: {
    resumeMarkdown: string;
    coverLetterMarkdown: string;
  };
  userProfile: UserProfile;
}

// ─── Status Updates (Worker → Railway) ───────────────────────────────────────

export interface SessionStatusUpdate {
  status: AutoApplyStatus;
  currentStep?: string;
  stepsCompleted?: number;
  stepsTotal?: number;
  atsPlatform?: ATSPlatform;
  atsConfidence?: number;
  automationConfidence?: number;
  failureReason?: string;
  failureDetails?: string;
  browserMetadata?: Record<string, string>;
  workerId?: string;
}

// ─── Execution Logging ────────────────────────────────────────────────────────

/** Log entry format — serializable for transport over HTTPS */
export interface ExecutionLogEntry {
  /** ISO 8601 timestamp string */
  timestamp: string;
  level: LogLevel;
  /** Standardized step key e.g. 'browser_launched', 'resume_uploaded' */
  step: string;
  message: string;
  /** Non-PII structured data */
  metadata?: Record<string, unknown>;
  /** Duration of the step in milliseconds */
  durationMs?: number;
  screenshotPath?: string;
}

// ─── Human Intervention ──────────────────────────────────────────────────────

export interface CreateInterventionPayload {
  reason: InterventionReason;
  description: string;
  screenshotUrl?: string;
  pageUrl?: string;
}

export interface InterventionStatus {
  id: string;
  resolved: boolean;
  resolution: 'completed' | 'skipped' | 'cancelled' | null;
  resolvedAt: string | null;
}

// ─── Worker Health ────────────────────────────────────────────────────────────

export interface WorkerHealthStatus {
  workerId: string;
  status: 'idle' | 'processing' | 'error';
  currentSessionId: string | null;
  uptimeSeconds: number;
  sessionsProcessed: number;
  lastHeartbeat: string;
}
