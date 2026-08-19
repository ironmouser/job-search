/**
 * worker/src/generic-agent/types.ts
 *
 * Types, enums, and data contracts for the Generic Application Agent.
 */

import { Frame, Locator, Page } from 'playwright';
import { ElementHitTestInfo } from '../obstruction/types';

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
