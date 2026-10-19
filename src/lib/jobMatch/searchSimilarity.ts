import { UserSearchCriteria } from './criteria';
import { computeRoleMatchScore } from '@/lib/roleMatcher';
import { extractStateAbbr, isRemoteLocation } from '@/lib/locationUtils';

const LEVEL_RANKS: Record<string, number> = {
  'intern': 0,
  'entry': 1,
  'entry-level': 1,
  'junior': 1,
  'associate': 1,
  'mid': 2,
  'mid-level': 2,
  'senior': 3,
  'lead': 4,
  'principal': 4,
  'staff': 4,
  'manager': 4,
  'director': 5,
  'vp': 5,
  'executive': 5,
};

function getLevelRank(level?: string | null): number {
  if (!level) return 2; // default mid
  const clean = level.toLowerCase().trim();
  for (const [k, v] of Object.entries(LEVEL_RANKS)) {
    if (clean.includes(k)) return v;
  }
  return 2;
}

export function computeLocationSimilarity(locA: string, locB: string, remoteA: boolean, remoteB: boolean): number {
  const isRemA = remoteA || isRemoteLocation(locA);
  const isRemB = remoteB || isRemoteLocation(locB);

  // Both remote
  if (isRemA && isRemB) return 100;

  // Exact normalized location match
  const cleanA = locA.toLowerCase().trim();
  const cleanB = locB.toLowerCase().trim();
  if (cleanA && cleanB && cleanA === cleanB) return 100;

  // Same US state match
  const stateA = extractStateAbbr(locA);
  const stateB = extractStateAbbr(locB);
  if (stateA && stateB && stateA === stateB) return 70;

  // One is remote, the other is a specific location (partial overlap)
  if (isRemA || isRemB) return 40;

  return 0;
}

export function computeLevelSimilarity(levelA: string, levelB: string): number {
  const rankA = getLevelRank(levelA);
  const rankB = getLevelRank(levelB);
  const diff = Math.abs(rankA - rankB);

  if (diff === 0) return 100;
  if (diff === 1) return 60;
  if (diff === 2) return 25;
  return 0;
}

export function computeSearchCriteriaSimilarity(
  a: UserSearchCriteria,
  b: UserSearchCriteria
): number {
  // 1. Role / Keyword score (0 - 1000 scaled to 0 - 100)
  const scoreAtoB = computeRoleMatchScore(a.searchKeyword, b.searchKeyword);
  const scoreBtoA = computeRoleMatchScore(b.searchKeyword, a.searchKeyword);
  const rawRoleScore = Math.max(scoreAtoB, scoreBtoA);
  const roleScore = Math.min(100, Math.round(rawRoleScore / 10));

  // 2. Location score (0 - 100)
  const locScore = computeLocationSimilarity(
    a.normalizedLocation || a.searchLocation,
    b.normalizedLocation || b.searchLocation,
    a.remoteOnly,
    b.remoteOnly
  );

  // 3. Job Level score (0 - 100)
  const levelScore = computeLevelSimilarity(a.jobLevel, b.jobLevel);

  // 4. Flags score (0 - 100)
  let flagScore = 0;
  if (a.remoteOnly === b.remoteOnly) flagScore += 50;
  if (a.noInternational === b.noInternational) flagScore += 50;

  // Weighted total: Role 50%, Location 25%, Level 15%, Flags 10%
  const total = (roleScore * 0.50) + (locScore * 0.25) + (levelScore * 0.15) + (flagScore * 0.10);

  return Math.round(total);
}
