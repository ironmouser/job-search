/**
 * Role Matcher Utility
 * 
 * Computes a relevance score (0 to 1000) indicating how closely a job title
 * aligns with a user's target job title or role.
 */

import { splitTargetRoles } from './roleTaxonomy';

const STOP_WORDS = new Set([
  'a', 'an', 'the', 'in', 'on', 'at', 'for', 'to', 'of', 'and', 'or', 'with',
  '&', '/', '-', '–', '—', 'as', 'by', 'from'
]);

const SENIORITY_WORDS = new Set([
  'senior', 'sr', 'junior', 'jr', 'lead', 'principal', 'staff', 'associate',
  'head', 'director', 'vp', 'chief', 'manager', 'intern', 'entry', 'mid',
  'level', 'i', 'ii', 'iii', 'iv', 'v'
]);

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractTokens(text: string): string[] {
  return normalizeText(text)
    .split(' ')
    .filter(token => token.length > 0 && !STOP_WORDS.has(token));
}

/**
 * Computes a score from 0 to 1000 representing how closely `jobTitle` matches `targetRole`.
 * Also checks `jobDescription` as a low-weight fallback if title does not match.
 * If `targetRole` contains comma-separated titles, returns the best match score among them.
 */
export function computeRoleMatchScore(
  jobTitle?: string | null,
  targetRole?: string | null,
  jobDescription?: string | null
): number {
  if (!targetRole || !targetRole.trim()) return 0;
  if (!jobTitle || !jobTitle.trim()) return 0;

  const subRoles = splitTargetRoles(targetRole);
  if (subRoles.length > 1) {
    let bestScore = 0;
    for (const role of subRoles) {
      const score = computeSingleRoleMatchScore(jobTitle, role, jobDescription);
      if (score > bestScore) {
        bestScore = score;
      }
      if (bestScore === 1000) break;
    }
    return bestScore;
  }

  return computeSingleRoleMatchScore(jobTitle, targetRole, jobDescription);
}

function computeSingleRoleMatchScore(
  jobTitle: string,
  targetRole: string,
  jobDescription?: string | null
): number {
  const cleanTarget = normalizeText(targetRole);
  const cleanTitle = normalizeText(jobTitle);

  if (!cleanTarget || !cleanTitle) return 0;

  // 1. Exact match
  if (cleanTitle === cleanTarget) {
    return 1000;
  }

  // 2. Exact phrase containment
  if (cleanTitle.includes(cleanTarget)) {
    return 900;
  }
  if (cleanTarget.includes(cleanTitle)) {
    return 850;
  }

  const targetTokens = extractTokens(targetRole);
  const titleTokens = extractTokens(jobTitle);

  if (targetTokens.length === 0 || titleTokens.length === 0) return 0;

  const titleTokenSet = new Set(titleTokens);
  
  // Distinguish core role keywords from pure seniority modifiers
  const coreTargetTokens = targetTokens.filter(t => !SENIORITY_WORDS.has(t));
  const effectiveCoreTokens = coreTargetTokens.length > 0 ? coreTargetTokens : targetTokens;

  let matchedTargetCount = 0;
  let matchedCoreCount = 0;

  for (const token of targetTokens) {
    if (titleTokenSet.has(token)) {
      matchedTargetCount++;
      if (effectiveCoreTokens.includes(token)) {
        matchedCoreCount++;
      }
    }
  }

  // If user specified core keywords (e.g. "Product Manager") but the title only matched seniority (e.g. "Senior"),
  // avoid high false-positive matches (e.g. "Senior Accountant").
  if (coreTargetTokens.length > 0 && matchedCoreCount === 0) {
    // Only seniority matched, assign low score
    return matchedTargetCount > 0 ? 30 : 0;
  }

  const overlapRatio = matchedTargetCount / targetTokens.length;
  const coreOverlapRatio = matchedCoreCount / effectiveCoreTokens.length;

  if (overlapRatio === 1.0) {
    // All target tokens present in job title
    let score = 750;

    // Bonus for consecutive sequence match
    const targetSeq = targetTokens.join(' ');
    const titleSeq = titleTokens.join(' ');
    if (titleSeq.includes(targetSeq)) {
      score += 50;
    }

    // Title conciseness bonus (fewer extra words in title = higher precision)
    const extraTokens = Math.max(0, titleTokens.length - targetTokens.length);
    score += Math.max(0, 50 - extraTokens * 5);

    return Math.min(score, 890);
  }

  if (coreOverlapRatio === 1.0) {
    // All core keywords match, but maybe seniority differs (e.g. Target: "Senior Product Manager", Title: "Product Manager")
    let score = 650;
    const extraTokens = Math.max(0, titleTokens.length - targetTokens.length);
    score += Math.max(0, 40 - extraTokens * 4);
    return score;
  }

  if (coreOverlapRatio >= 0.5) {
    // Partial core match (e.g. Target: "Product Marketing Manager", Title: "Product Manager")
    return Math.round(300 + coreOverlapRatio * 250);
  }

  if (matchedTargetCount > 0) {
    return Math.round(overlapRatio * 200);
  }

  // 3. Fallback: check if target phrase or core tokens appear prominently in the description
  if (jobDescription && jobDescription.trim()) {
    const cleanDesc = normalizeText(jobDescription);
    if (cleanDesc.includes(cleanTarget)) {
      return 60;
    }
    const descTokens = new Set(extractTokens(jobDescription.slice(0, 1000)));
    let descCoreMatches = 0;
    for (const token of effectiveCoreTokens) {
      if (descTokens.has(token)) {
        descCoreMatches++;
      }
    }
    if (descCoreMatches === effectiveCoreTokens.length) {
      return 40;
    }
  }

  return 0;
}
