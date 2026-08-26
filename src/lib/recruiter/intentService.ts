import { prisma } from '@/lib/prisma';
import { MatchIntentLevel } from '@prisma/client';
import { INTENT_SNAPSHOT_TTL_HOURS } from './config';

export interface PublicIntentDTO {
  intentLevel: MatchIntentLevel;
  displayLabel: string;
}

/**
 * Returns a privacy-safe intent snapshot for a candidate.
 * If a valid (unexpired) snapshot exists, returns the cached result.
 * Otherwise, computes a new snapshot and caches it.
 */
export async function getOrComputeCandidateIntent(candidateId: string): Promise<PublicIntentDTO> {
  const now = new Date();

  // 1. Check for valid cached snapshot
  const cached = await prisma.candidateIntentSnapshot.findFirst({
    where: {
      candidateId,
      expiresAt: { gt: now },
    },
    orderBy: { calculatedAt: 'desc' },
  });

  if (cached) {
    return {
      intentLevel: cached.intentLevel,
      displayLabel: formatIntentLabel(cached.intentLevel),
    };
  }

  // 2. Compute fresh intent snapshot
  const computed = await calculateCandidateIntent(candidateId);

  const expiresAt = new Date(Date.now() + INTENT_SNAPSHOT_TTL_HOURS * 60 * 60 * 1000);

  try {
    await prisma.candidateIntentSnapshot.create({
      data: {
        candidateId,
        intentLevel: computed.intentLevel,
        intentScore: computed.intentScore,
        calculationVersion: 'v1',
        calculatedAt: now,
        expiresAt,
      },
    });
  } catch (err) {
    console.error('Failed to cache candidate intent snapshot:', err);
  }

  return {
    intentLevel: computed.intentLevel,
    displayLabel: formatIntentLabel(computed.intentLevel),
  };
}

/**
 * Internal computation of candidate intent based on aggregated engagement signals.
 * Raw behavioral inputs are evaluated strictly server-side and never returned to clients.
 */
async function calculateCandidateIntent(candidateId: string): Promise<{
  intentLevel: MatchIntentLevel;
  intentScore: number;
}> {
  // Use separate queries to avoid Prisma nested select type inference issues
  const user = await prisma.user.findUnique({
    where: { id: candidateId },
    select: {
      lastLoginAt: true,
    },
  });

  const prefs = await prisma.userPreferences.findUnique({
    where: { userId: candidateId },
    select: {
      resumeMarkdown: true,
      profile: true,
      createdAt: true,
    },
  });

  const recentJobCount = await prisma.userJob.count({
    where: {
      userId: candidateId,
      createdAt: {
        gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // last 30 days
      },
    },
  });

  if (!user) {
    return { intentLevel: MatchIntentLevel.UNKNOWN, intentScore: 0 };
  }

  let score = 0;
  const now = Date.now();

  // Signal 1: Recency of login
  if (user.lastLoginAt) {
    const daysSinceLogin = (now - new Date(user.lastLoginAt).getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceLogin <= 3) score += 40;
    else if (daysSinceLogin <= 7) score += 30;
    else if (daysSinceLogin <= 14) score += 20;
    else if (daysSinceLogin <= 30) score += 10;
  }

  // Signal 2: Active job-seeking activity in past 30 days
  if (recentJobCount >= 10) score += 30;
  else if (recentJobCount >= 3) score += 20;
  else if (recentJobCount >= 1) score += 10;

  // Signal 3: Profile completeness
  if (prefs?.resumeMarkdown && prefs.resumeMarkdown.length > 100) {
    score += 15;
  }
  if (prefs?.profile && prefs.profile.length > 50) {
    score += 15;
  }

  let intentLevel: MatchIntentLevel = MatchIntentLevel.LOW;
  if (score >= 65) {
    intentLevel = MatchIntentLevel.HIGH;
  } else if (score >= 35) {
    intentLevel = MatchIntentLevel.MEDIUM;
  } else if (score > 0) {
    intentLevel = MatchIntentLevel.LOW;
  } else {
    intentLevel = MatchIntentLevel.UNKNOWN;
  }

  return { intentLevel, intentScore: Math.min(score, 100) };
}

/**
 * Maps enum to user-friendly badge text.
 */
function formatIntentLabel(level: MatchIntentLevel): string {
  switch (level) {
    case MatchIntentLevel.HIGH:
      return '🔥 High Intent';
    case MatchIntentLevel.MEDIUM:
      return 'Active Intent';
    case MatchIntentLevel.LOW:
      return 'Open to Opportunities';
    default:
      return 'Exploring';
  }
}

/**
 * Bulk recalculation for unexpired or expiring snapshots.
 * Used by scheduled cron task.
 */
export async function refreshCandidateIntentBatch(candidateIds: string[]): Promise<number> {
  let updatedCount = 0;
  for (const id of candidateIds) {
    try {
      const computed = await calculateCandidateIntent(id);
      const expiresAt = new Date(Date.now() + INTENT_SNAPSHOT_TTL_HOURS * 60 * 60 * 1000);
      await prisma.candidateIntentSnapshot.create({
        data: {
          candidateId: id,
          intentLevel: computed.intentLevel,
          intentScore: computed.intentScore,
          calculationVersion: 'v1',
          calculatedAt: new Date(),
          expiresAt,
        },
      });
      updatedCount++;
    } catch (err) {
      console.error(`Failed to refresh intent for candidate ${id}:`, err);
    }
  }
  return updatedCount;
}
