import { prisma } from '../prisma';
import { getEffectiveTier, isInProTrial, TierUser } from '../tier';
import { AutoApplyStatus } from './types';

export const AUTO_APPLY_LIMITS = {
  PRO: {
    MONTHLY: 150,
    DAILY: 15,
  },
  TRIAL: {
    MONTHLY: 25, // Total allowance over the 7-day trial
    DAILY: 5,
  },
  FREE: {
    MONTHLY: 0,
    DAILY: 0,
  },
} as const;

export interface AutoApplyQuotaResult {
  tier: 'PRO' | 'TRIAL' | 'FREE';
  monthlyLimit: number;
  monthlyUsed: number;
  monthlyRemaining: number;
  dailyLimit: number;
  dailyUsed: number;
  dailyRemaining: number;
  canApply: boolean;
  blockedReason: 'MONTHLY_LIMIT_EXCEEDED' | 'DAILY_LIMIT_EXCEEDED' | 'FREE_TIER' | null;
  dailyResetsAt: string; // ISO 8601 UTC midnight
  monthlyResetsAt: string; // ISO 8601 billing cycle or month end
}

/**
 * Calculates current auto-apply quota usage and remaining allowance for a user.
 * 
 * Rules:
 * 1. Only completed sessions (status = 'applied') consume quota.
 * 2. Monthly Pool: 150/mo for Pro, 25 total for Trial, 0 for Free.
 * 3. Daily Velocity Cap: 15/day for Pro, 5/day for Trial, 0 for Free.
 * 4. Respects unifiedQuotaGroupId to prevent multi-account evasion.
 */
export async function getAutoApplyQuota(userId: string): Promise<AutoApplyQuotaResult> {
  const now = new Date();

  // Next UTC midnight for daily reset
  const nextMidnightUtc = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0, 0)
  );
  const startOfTodayUtc = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0)
  );

  const dbUser = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      planTier: true,
      trialEndsAt: true,
      subscriptionType: true,
      orgAccessExpiresAt: true,
      stripeCurrentPeriodEnd: true,
      unifiedQuotaGroupId: true,
    },
  });

  if (!dbUser) {
    return {
      tier: 'FREE',
      monthlyLimit: 0,
      monthlyUsed: 0,
      monthlyRemaining: 0,
      dailyLimit: 0,
      dailyUsed: 0,
      dailyRemaining: 0,
      canApply: false,
      blockedReason: 'FREE_TIER',
      dailyResetsAt: nextMidnightUtc.toISOString(),
      monthlyResetsAt: nextMidnightUtc.toISOString(),
    };
  }

  // Determine user tier
  const tierUser: TierUser = {
    planTier: dbUser.planTier,
    trialEndsAt: dbUser.trialEndsAt,
    subscriptionType: dbUser.subscriptionType,
    orgAccessExpiresAt: dbUser.orgAccessExpiresAt,
  };

  const effectiveTier = getEffectiveTier(tierUser);
  const isTrial = isInProTrial(tierUser);

  let quotaTier: 'PRO' | 'TRIAL' | 'FREE' = 'FREE';
  if (effectiveTier === 'PRO') {
    quotaTier = isTrial ? 'TRIAL' : 'PRO';
  }

  const limits = AUTO_APPLY_LIMITS[quotaTier];

  // Resolve monthly window start and reset date
  let monthlyWindowStart: Date;
  let monthlyResetsAt: string;

  if (quotaTier === 'TRIAL' && dbUser.trialEndsAt) {
    const trialEnd = new Date(dbUser.trialEndsAt);
    monthlyResetsAt = trialEnd.toISOString();
    // Trial is 7 days long; calculate start
    monthlyWindowStart = new Date(trialEnd.getTime() - 7 * 24 * 60 * 60 * 1000);
  } else if (quotaTier === 'PRO' && dbUser.stripeCurrentPeriodEnd) {
    const periodEnd = new Date(dbUser.stripeCurrentPeriodEnd);
    if (periodEnd > now) {
      monthlyResetsAt = periodEnd.toISOString();
      monthlyWindowStart = new Date(periodEnd.getTime() - 30 * 24 * 60 * 60 * 1000);
    } else {
      // Fallback to 1st of current calendar month UTC
      monthlyWindowStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
      const nextMonthFirst = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0, 0));
      monthlyResetsAt = nextMonthFirst.toISOString();
    }
  } else {
    // Free or generic monthly window (1st of calendar month)
    monthlyWindowStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
    const nextMonthFirst = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0, 0));
    monthlyResetsAt = nextMonthFirst.toISOString();
  }

  // Multi-account / quota group aggregation
  let userIds: string[] = [userId];
  if (dbUser.unifiedQuotaGroupId) {
    try {
      const groupedUsers = await prisma.user.findMany({
        where: { unifiedQuotaGroupId: dbUser.unifiedQuotaGroupId },
        select: { id: true },
      });
      if (groupedUsers.length > 0) {
        userIds = groupedUsers.map((u) => u.id);
      }
    } catch (err) {
      console.warn('[getAutoApplyQuota] Error querying unifiedQuotaGroupId users:', err);
    }
  }

  // Count completed applications
  let dailyUsed = 0;
  let monthlyUsed = 0;

  try {
    const countedStatuses = [
      AutoApplyStatus.APPLIED,
      'applied',
      AutoApplyStatus.CANCELLED,
      'cancelled',
    ];

    const [dailyCount, monthlyCount] = await Promise.all([
      prisma.autoApplySession.count({
        where: {
          userId: { in: userIds },
          status: { in: countedStatuses },
          OR: [
            { completedAt: { gte: startOfTodayUtc } },
            { completedAt: null, createdAt: { gte: startOfTodayUtc } },
          ],
        },
      }),
      prisma.autoApplySession.count({
        where: {
          userId: { in: userIds },
          status: { in: countedStatuses },
          OR: [
            { completedAt: { gte: monthlyWindowStart } },
            { completedAt: null, createdAt: { gte: monthlyWindowStart } },
          ],
        },
      }),
    ]);

    dailyUsed = dailyCount;
    monthlyUsed = monthlyCount;
  } catch (err) {
    console.error('[getAutoApplyQuota] Error counting sessions:', err);
  }

  const monthlyRemaining = Math.max(0, limits.MONTHLY - monthlyUsed);
  const dailyRemaining = Math.max(0, limits.DAILY - dailyUsed);

  let canApply = true;
  let blockedReason: 'MONTHLY_LIMIT_EXCEEDED' | 'DAILY_LIMIT_EXCEEDED' | 'FREE_TIER' | null = null;

  if (quotaTier === 'FREE') {
    canApply = false;
    blockedReason = 'FREE_TIER';
  } else if (monthlyRemaining <= 0) {
    canApply = false;
    blockedReason = 'MONTHLY_LIMIT_EXCEEDED';
  } else if (dailyRemaining <= 0) {
    canApply = false;
    blockedReason = 'DAILY_LIMIT_EXCEEDED';
  }

  return {
    tier: quotaTier,
    monthlyLimit: limits.MONTHLY,
    monthlyUsed,
    monthlyRemaining,
    dailyLimit: limits.DAILY,
    dailyUsed,
    dailyRemaining,
    canApply,
    blockedReason,
    dailyResetsAt: nextMidnightUtc.toISOString(),
    monthlyResetsAt,
  };
}
