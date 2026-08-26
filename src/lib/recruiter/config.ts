import crypto from 'crypto';

export const RECRUITER_MATCH_VERSION = 'v1';
export const DEFAULT_ATTRIBUTION_WINDOW_DAYS = 365;
export const INTENT_SNAPSHOT_TTL_HOURS = 6;

// Rate limiting keys and defaults
export const RECRUITER_RATE_LIMITS = {
  SEARCH_MAX_HITS: 60,
  SEARCH_WINDOW_MS: 15 * 60 * 1000, // 15 mins
  INTRO_MAX_HITS: 20,
  INTRO_WINDOW_MS: 60 * 60 * 1000, // 1 hour
  PROFILE_VIEW_MAX_HITS: 100,
  PROFILE_VIEW_WINDOW_MS: 60 * 60 * 1000, // 1 hour
} as const;

/**
 * Generates an attribution-friendly public ID.
 * Examples:
 *   generatePublicId('JHQ-JOB')   -> 'JHQ-JOB-8F32A7'
 *   generatePublicId('JHQ-INTRO') -> 'JHQ-INTRO-9E41C2'
 */
export function generatePublicId(prefix: 'JHQ-JOB' | 'JHQ-INTRO'): string {
  const randomHex = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `${prefix}-${randomHex}`;
}
