import { UserSearchCriteria } from './criteria';
import { computeRoleMatchScore } from '@/lib/roleMatcher';
import { computeLocationSimilarity, computeLevelSimilarity } from './searchSimilarity';
import { isRemoteLocation, isOutsideUsLocation } from '@/lib/locationUtils';
import { isClosedJobRecord } from '@/lib/jobStatusDetector';

export interface JobCandidate {
  id?: string;
  title: string;
  company?: string | null;
  location?: string | null;
  description?: string | null;
  salaryRange?: string | null;
  url: string;
  source?: string | null;
  status?: string | null;
}

export interface JobRelevanceResult {
  isMatch: boolean;
  score: number;
  rejectionReason?: string;
  breakdown: {
    titleScore: number;
    locationScore: number;
    levelScore: number;
    keywordScore: number;
  };
}

export const MATCH_THRESHOLD = 60; // 60% relevance threshold for a Job Match

/**
 * Evaluates whether a job posting matches an individual user's criteria.
 * Applies hard elimination rules first, followed by rule-based relevance scoring.
 */
export function evaluateJobRelevance(
  job: JobCandidate,
  user: UserSearchCriteria,
  threshold: number = MATCH_THRESHOLD
): JobRelevanceResult {
  const emptyBreakdown = { titleScore: 0, locationScore: 0, levelScore: 0, keywordScore: 0 };

  // Hard Check 1: Job closed or expired
  if (isClosedJobRecord(job)) {
    return { isMatch: false, score: 0, rejectionReason: 'Job is closed or expired', breakdown: emptyBreakdown };
  }

  // Hard Check 2: Source disabled by user
  if (job.source && user.sources[job.source] === false) {
    return { isMatch: false, score: 0, rejectionReason: `Source ${job.source} is disabled by user`, breakdown: emptyBreakdown };
  }

  const jobLoc = job.location || '';
  const titleLower = (job.title || '').toLowerCase();
  const descLower = (job.description || '').toLowerCase();
  const fullText = `${titleLower} ${descLower}`;

  // Hard Check 3: Exclude keywords
  if (user.excludeKeywords.length > 0) {
    for (const kw of user.excludeKeywords) {
      if (kw && fullText.includes(kw)) {
        return { isMatch: false, score: 0, rejectionReason: `Contains excluded keyword: "${kw}"`, breakdown: emptyBreakdown };
      }
    }
  }

  // Hard Check 4: Remote only filter
  const isJobRemote = isRemoteLocation(jobLoc) || titleLower.includes('remote') || descLower.includes('remote');
  if (user.remoteOnly && !isJobRemote) {
    return { isMatch: false, score: 0, rejectionReason: 'Job is not remote', breakdown: emptyBreakdown };
  }

  // Hard Check 5: International filter
  if (user.noInternational && isOutsideUsLocation(jobLoc)) {
    return { isMatch: false, score: 0, rejectionReason: 'Job location is outside the United States', breakdown: emptyBreakdown };
  }

  // ─── Relevance Scoring (0 to 100) ──────────────────────────────────────────

  // 1. Title Match Score (55% weight)
  const rawRoleScore = computeRoleMatchScore(job.title, user.searchKeyword, job.description);
  const titleScore = Math.min(100, Math.round(rawRoleScore / 10));

  // If role score is strictly 0 (completely unrelated field, e.g. Nurse vs Software Engineer), reject early
  if (titleScore === 0) {
    return { isMatch: false, score: 0, rejectionReason: 'Role title does not match search criteria', breakdown: emptyBreakdown };
  }

  // 2. Location Score (20% weight)
  const locationScore = computeLocationSimilarity(
    jobLoc,
    user.normalizedLocation || user.searchLocation,
    false,
    user.remoteOnly
  );

  // 3. Level Score (15% weight)
  // Infer level from job title, fall back to mid-level
  const levelScore = computeLevelSimilarity(job.title, user.jobLevel);

  // 4. Include Keywords Score (10% weight)
  let keywordScore = 100;
  if (user.includeKeywords.length > 0) {
    let matchedKws = 0;
    for (const kw of user.includeKeywords) {
      if (kw && fullText.includes(kw)) {
        matchedKws++;
      }
    }
    keywordScore = Math.round((matchedKws / user.includeKeywords.length) * 100);
  }

  // Weighted total: Title 55%, Location 20%, Level 15%, Keywords 10%
  const totalScore = Math.round(
    (titleScore * 0.55) +
    (locationScore * 0.20) +
    (levelScore * 0.15) +
    (keywordScore * 0.10)
  );

  const isMatch = totalScore >= threshold;

  return {
    isMatch,
    score: totalScore,
    rejectionReason: isMatch ? undefined : `Score ${totalScore} below threshold of ${threshold}`,
    breakdown: {
      titleScore,
      locationScore,
      levelScore,
      keywordScore,
    },
  };
}
