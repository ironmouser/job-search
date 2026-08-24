/**
 * worker/src/obstruction/types.ts
 *
 * Types, enums, and data contracts for UI obstruction detection,
 * classification, recovery resolution, and safe interaction.
 */

import { Frame, Locator, Page } from 'playwright';

// ─── Obstruction Classifications ────────────────────────────────────────────

export enum ObstructionType {
  NONE = 'NONE',

  // Application flow / Onboarding dialogs (must NOT be dismissed via escape/close; proceed via positive selection)
  APPLICATION_FLOW_MODAL = 'APPLICATION_FLOW_MODAL',

  // Safe dismissible modals & overlays
  MARKETING_MODAL = 'MARKETING_MODAL',
  NEWSLETTER_MODAL = 'NEWSLETTER_MODAL',
  JOB_ALERT_MODAL = 'JOB_ALERT_MODAL',
  COOKIE_BANNER = 'COOKIE_BANNER',
  PRIVACY_BANNER = 'PRIVACY_BANNER',
  LOCATION_PROMPT = 'LOCATION_PROMPT',
  NON_CRITICAL_DIALOG = 'NON_CRITICAL_DIALOG',

  // Unsafe / Security / Auth boundaries (must NOT be bypassed)
  LOGIN_MODAL = 'LOGIN_MODAL',
  AUTHENTICATION_REQUIRED = 'AUTHENTICATION_REQUIRED',
  CAPTCHA = 'CAPTCHA',
  BOT_CHALLENGE = 'BOT_CHALLENGE',
  SECURITY_CHALLENGE = 'SECURITY_CHALLENGE',

  // Unknown UI
  UNKNOWN_MODAL = 'UNKNOWN_MODAL',
  UNKNOWN_OVERLAY = 'UNKNOWN_OVERLAY',
}

export enum ObstructionDismissalAction {
  NONE = 'NONE',
  ESCAPE = 'ESCAPE',
  CLOSE_BUTTON = 'CLOSE_BUTTON',
  BACKDROP_CLICK = 'BACKDROP_CLICK',
  FORCE_INTERACTION = 'FORCE_INTERACTION',
  REJECT_ALL = 'REJECT_ALL',
  IGNORE = 'IGNORE',
  NECESSARY_ONLY = 'NECESSARY_ONLY',
  FUNCTIONAL_ONLY = 'FUNCTIONAL_ONLY',
  ACCEPT_FALLBACK = 'ACCEPT_FALLBACK',
  SELECT_POSITIVE_OPTION = 'SELECT_POSITIVE_OPTION',
  DOM_NEUTRALIZED = 'DOM_NEUTRALIZED',
}

// ─── Hit Test & Actionability Information ───────────────────────────────────

export interface ElementHitTestInfo {
  tag: string;
  role: string | null;
  id: string | null;
  className: string | null;
  text: string;
  zIndex: number;
  position: string;
  opacity: number;
  pointerEvents: string;
  ariaModal: boolean;
  isDialog: boolean;
  isInViewport: boolean;
  boundingBox: {
    x: number;
    y: number;
    width: number;
    height: number;
  } | null;
}

export interface TargetActionabilityResult {
  exists: boolean;
  visible: boolean;
  enabled: boolean;
  inViewport: boolean;
  isObstructed: boolean;
  targetInfo?: ElementHitTestInfo;
  blockingElement?: ElementHitTestInfo;
  modalContainer?: ElementHitTestInfo;
}

// ─── Classification & Resolution Results ────────────────────────────────────

export interface ObstructionClassification {
  type: ObstructionType;
  isSafeToDismiss: boolean;
  confidence: number;
  reason: string;
  detectedKeywords: string[];
}

export interface ObstructionDetectionResult {
  detected: boolean;
  classification: ObstructionClassification;
  targetActionability: TargetActionabilityResult;
  blockingElement?: ElementHitTestInfo;
  modalContainer?: ElementHitTestInfo;
  closeControlFound: boolean;
}

export interface RecoveryResult {
  success: boolean;
  actionTaken: ObstructionDismissalAction;
  attemptsCount: number;
  obstructionType: ObstructionType;
  finalActionable: boolean;
  error?: string;
}

// ─── Safe Interaction Options & Results ─────────────────────────────────────

export type PageOrFrame = Page | Frame;
export type InteractTarget = Locator | any | string;

export interface SafeInteractOptions {
  timeoutMs?: number;
  maxRecoveryAttempts?: number;
  allowForceFallback?: boolean;
  scrollAttempts?: number;
  actionName?: string;
  contextDescription?: string;
}

export interface SafeInteractResult {
  success: boolean;
  actionPerformed: string;
  recoveryPerformed: boolean;
  obstructionType: ObstructionType;
  recoveryAction: ObstructionDismissalAction;
  forcedUsed: boolean;
  failureReason?: string;
  failureDetails?: string;
}
