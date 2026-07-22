/**
 * worker/src/types.ts
 *
 * Mirror of src/lib/auto-apply/types.ts from the Railway app.
 * Keep these two files in sync whenever types change.
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
  previousSuccessRate: number;
}

export interface ConfidenceResult {
  confidence: number;
  recommendation: 'auto' | 'assisted' | 'manual' | 'skip';
  explanation: string;
  estimatedCompletionTime: string;
}

// ─── Workflow ─────────────────────────────────────────────────────────────────

export interface UserProfile {
  name: string;
  email: string;
  phone?: string;
  location?: string;
  linkedinUrl?: string;
  websiteUrl?: string;
}

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

// ─── Status Updates ──────────────────────────────────────────────────────────

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

export interface ExecutionLogEntry {
  timestamp: string;
  level: LogLevel;
  step: string;
  message: string;
  metadata?: Record<string, unknown>;
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
  workerVersion: string;
  status: 'idle' | 'processing' | 'error';
  currentSessionId: string | null;
  uptimeSeconds: number;
  sessionsProcessed: number;
  lastHeartbeat: string;
}


// ─── AutomationWorker interface ───────────────────────────────────────────────

/**
 * Infrastructure-agnostic worker interface.
 * The implementation does not depend on DigitalOcean-specific APIs.
 * Can be migrated to another VPS, Kubernetes, or cloud browser service.
 */
export interface AutomationWorker {
  start(): Promise<void>;
  shutdown(): Promise<void>;
  processSession(session: QueuedSession): Promise<WorkflowResult>;
  healthCheck(): WorkerHealthStatus;
}
