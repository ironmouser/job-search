/**
 * Central tier resolution for Job Agent HQ.
 *
 * All API routes and UI components should call getEffectiveTier() instead of
 * comparing planTier === 'PRO' directly, so the 7-day Pro trial is respected
 * uniformly across the entire application.
 */

/** Shape of user data needed to resolve the effective tier. */
export interface TierUser {
  planTier: string;
  trialEndsAt?: Date | string | null;
  subscriptionType?: string | null;
  orgAccessExpiresAt?: Date | string | null;
}

/**
 * Returns the user's effective plan tier.
 * Order of precedence:
 *   1. Paid PRO subscription (planTier === 'PRO')
 *   2. Active org/group access (subscriptionType === 'GROUP' or 'PREMIUM' with non-expired orgAccessExpiresAt)
 *   3. Active 7-day Pro trial (trialEndsAt is in the future)
 *   4. FREE
 */
export function getEffectiveTier(user: TierUser): 'PRO' | 'FREE' {
  // 1. Paid subscriber
  if (user.planTier === 'PRO') return 'PRO';

  // 2. Org / group access
  if (user.subscriptionType === 'GROUP' || user.subscriptionType === 'PREMIUM') {
    const expires = user.orgAccessExpiresAt ? new Date(user.orgAccessExpiresAt) : null;
    if (!expires || expires > new Date()) return 'PRO';
  }

  // 3. Active 7-day Pro trial (uses the existing trialEndsAt column)
  if (user.trialEndsAt) {
    const trialEnd = new Date(user.trialEndsAt);
    if (trialEnd > new Date()) return 'PRO';
  }

  return 'FREE';
}

/**
 * Returns true if the user is currently in their 7-day Pro trial
 * (not a paid subscriber, but trial window is active).
 */
export function isInProTrial(user: TierUser): boolean {
  // Paid subscribers are not "in trial"
  if (user.planTier === 'PRO') return false;
  if (!user.trialEndsAt) return false;
  return new Date(user.trialEndsAt) > new Date();
}

/**
 * Returns the number of whole days remaining in the trial, or 0 if expired/none.
 */
export function getTrialDaysRemaining(trialEndsAt?: Date | string | null): number {
  if (!trialEndsAt) return 0;
  const diff = new Date(trialEndsAt).getTime() - Date.now();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

/**
 * Returns true if the user is in the first 24 hours of their trial
 * (show welcome message instead of countdown).
 */
export function isInWelcomeWindow(trialEndsAt?: Date | string | null): boolean {
  if (!trialEndsAt) return false;
  const trialEnd = new Date(trialEndsAt);
  if (trialEnd <= new Date()) return false;
  // Trial lasts 7 days. Welcome window = first 24 hours = trial started < 24h ago
  const trialStartApprox = trialEnd.getTime() - 7 * 24 * 60 * 60 * 1000;
  const hoursSinceStart = (Date.now() - trialStartApprox) / (1000 * 60 * 60);
  return hoursSinceStart < 24;
}
