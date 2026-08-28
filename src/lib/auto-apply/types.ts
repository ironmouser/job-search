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
  GENERATING_ASSETS = 'generating_assets',
  NAVIGATING_TO_ATS = 'navigating_to_ats',
  DETECTING_ATS = 'detecting_ats',
  PREPARING = 'preparing',
  APPLYING = 'applying',
  VALIDATING = 'validating',
  NEEDS_REVIEW = 'needs_review',
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
  WORKABLE = 'workable',
  SMARTRECRUITERS = 'smartrecruiters',
  TALEO = 'taleo',
  ICIMS = 'icims',
  ZIPRECRUITER_NATIVE = 'ziprecruiter_native',
  DICE_NATIVE = 'dice_native',
  LINKEDIN_EASY_APPLY = 'linkedin_easy_apply',
  INDEED_APPLY = 'indeed_apply',
  UNKNOWN = 'unknown',
}

export enum InterventionReason {
  CAPTCHA = 'captcha',
  MFA_REQUIRED = 'mfa_required',
  UNKNOWN_QUESTION = 'unknown_question',
  UNEXPECTED_PAGE = 'unexpected_page',
  JOB_CLOSED = 'job_closed',
  RESUME_REJECTED = 'resume_rejected',
  ATTACHMENT_MISSING = 'attachment_missing',
  LOGIN_REQUIRED = 'login_required',
  SESSION_EXPIRED = 'session_expired',
  JOB_BOARD_AUTH_REQUIRED = 'job_board_auth_required',
  ASSESSMENT_REQUIRED = 'assessment_required',
  REVIEW_GATE = 'review_gate',
  /** Job board modal/page did not yield a valid application destination URL. */
  APPLICATION_DESTINATION_NOT_FOUND = 'application_destination_not_found',
  /** Obstruction & interaction failure reasons */
  APPLICATION_NOT_FOUND = 'application_not_found',
  APPLICATION_FOUND_BUT_NOT_ACTIONABLE = 'application_found_but_not_actionable',
  APPLICATION_BLOCKED_BY_MODAL = 'application_blocked_by_modal',
  APPLICATION_BLOCKED_BY_MARKETING_MODAL = 'application_blocked_by_marketing_modal',
  APPLICATION_BLOCKED_BY_COOKIE_BANNER = 'application_blocked_by_cookie_banner',
  APPLICATION_BLOCKED_BY_LOGIN = 'application_blocked_by_login',
  APPLICATION_BLOCKED_BY_AUTHENTICATION = 'application_blocked_by_authentication',
  APPLICATION_BLOCKED_BY_CAPTCHA = 'application_blocked_by_captcha',
  APPLICATION_BLOCKED_BY_BOT_CHALLENGE = 'application_blocked_by_bot_challenge',
  APPLICATION_BLOCKED_BY_SECURITY_CHALLENGE = 'application_blocked_by_security_challenge',
  APPLICATION_BLOCKED_BY_UNKNOWN_UI = 'application_blocked_by_unknown_ui',
  APPLICATION_INTERACTION_FAILED = 'application_interaction_failed',
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
  streetAddress?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  linkedinUrl?: string;
  websiteUrl?: string;
  usWorkAuthorization?: string;
  workingRemotelyFrom?: string;
  visaSponsorship?: string;
  country?: string;
  eeocRace?: string;
  eeocGender?: string;
  eeocVeteran?: string;
  eeocDisability?: string;
  skipSelfId?: boolean;
  startDate?: string;
  expectedSalary?: string;
  willingToTravel?: string;
  isOver18?: string;
  willingToRelocate?: string;
  accountPassword?: string;
  accountEmail?: string;
  accountAuthMode?: 'sign_in' | 'create_account';
  otpCode?: string;
  customAnswers?: Record<string, string>;
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
  connectedSession?: {
    provider: string;
    storageState: any;
  } | null;
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
  connectedSession?: {
    provider: string;
    storageState: any;
  } | null;
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
  confirmationScreenshotUrl?: string;
  confirmationNumber?: string;
  submittedAnswersSummary?: Record<string, unknown>;
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

export interface QuestionInterventionData {
  fieldKey?: string;
  label: string;
  fieldType: 'text' | 'textarea' | 'select' | 'radio' | 'checkbox';
  options?: string[];
  required?: boolean;
}

export interface CreateInterventionPayload {
  reason: InterventionReason;
  description: string;
  screenshotUrl?: string;
  pageUrl?: string;
  questionData?: QuestionInterventionData;
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
