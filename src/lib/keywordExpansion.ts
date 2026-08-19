/**
 * Keyword & Role Title Expansion Utility
 *
 * Expands search keywords into relevant industry synonyms and variants to maximize
 * job discovery across scrapers and database pool queries.
 *
 * Two modes:
 *  - `expandSearchKeywords(keyword)` — fast, synchronous, static dictionary (used as fallback)
 *  - `expandSearchKeywordsWithAI(keyword, userId?)` — async, AI-powered semantic expansion
 *    that works for any role title regardless of whether it appears in the static dictionary.
 */

import { callAI } from './ai';
export {
  SENIORITY_PREFIXES,
  ROLE_SYNONYM_CLUSTERS,
  getCoreKeyword,
  matchesWholeWords,
  expandSearchKeywords,
  CANONICAL_TITLE_LIST
} from './roleTaxonomy';
import { expandSearchKeywords } from './roleTaxonomy';

// ---------------------------------------------------------------------------
// AI-Powered Semantic Expansion
// ---------------------------------------------------------------------------

/** In-memory cache: normalized keyword → { keywords, timestamp } */
const _aiExpansionCache = new Map<string, { keywords: string[]; ts: number }>();
const AI_CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

/**
 * Expands a job title into semantically equivalent search terms using AI.
 *
 * Works for any role title — niche, compound, or abbreviated — regardless of
 * whether it appears in the static `ROLE_SYNONYM_CLUSTERS` dictionary.
 *
 * Falls back to `expandSearchKeywords()` if the AI call fails or times out.
 *
 * @param keyword  The user's raw job title / search keyword.
 * @param userId   Optional user ID passed through to the AI router for logging.
 * @returns        Array of 2–6 search terms; the user's original input is always first.
 */
export async function expandSearchKeywordsWithAI(
  keyword: string,
  userId?: string
): Promise<string[]> {
  if (!keyword || !keyword.trim()) return [];

  const cacheKey = keyword.trim().toLowerCase();

  // Return cached result if still fresh
  const cached = _aiExpansionCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < AI_CACHE_TTL_MS) {
    console.log(`[KeywordExpansion] Cache hit for "${keyword}": [${cached.keywords.join(', ')}]`);
    return cached.keywords;
  }

  try {
    const raw = await Promise.race<string>([
      callAI({
        task: 'extract',
        jsonMode: true,
        maxTokens: 200,
        userId,
        messages: [
          {
            role: 'system',
            content:
              'You are a job search optimization assistant. Given a job title or role description, return the most common equivalent job board search terms that recruiters use when posting similar positions. Focus on standard industry-recognized titles. Return ONLY valid JSON in the exact format: {"keywords": ["Term 1", "Term 2", "Term 3", "Term 4", "Term 5"]} — between 3 and 6 terms, no explanations.',
          },
          {
            role: 'user',
            content: `Job title: "${keyword.trim()}"`,
          },
        ],
      }),
      new Promise<string>((_, reject) =>
        setTimeout(() => reject(new Error('AI keyword expansion timed out')), 4000)
      ),
    ]);

    const parsed = JSON.parse(raw);
    const aiTerms: string[] = Array.isArray(parsed?.keywords)
      ? parsed.keywords.filter((t: any) => typeof t === 'string' && t.trim().length > 0)
      : [];

    if (aiTerms.length === 0) throw new Error('Empty AI expansion response');

    // Always put the user's exact input first, then AI suggestions (deduped, max 6 total)
    const combined: string[] = [keyword.trim()];
    for (const term of aiTerms) {
      if (!combined.some(r => r.toLowerCase() === term.toLowerCase())) {
        combined.push(term);
      }
      if (combined.length >= 6) break;
    }

    _aiExpansionCache.set(cacheKey, { keywords: combined, ts: Date.now() });
    console.log(`[KeywordExpansion] AI expanded "${keyword}" → [${combined.join(', ')}]`);
    return combined;
  } catch (err: any) {
    console.warn(`[KeywordExpansion] AI expansion failed for "${keyword}", using static fallback: ${err.message}`);
    const fallback = expandSearchKeywords(keyword);
    // Cache the fallback too so we don't hammer the AI on repeated failures
    _aiExpansionCache.set(cacheKey, { keywords: fallback, ts: Date.now() });
    return fallback;
  }
}


// ---------------------------------------------------------------------------
// Skill Inference from Role Title (Cold Start / No Resume Profile Context)
// ---------------------------------------------------------------------------

const _skillInferenceCache = new Map<string, { skills: string[]; ts: number }>();
const SKILL_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Given a job title, infers a likely skill set for a practitioner.
 * Used as a lightweight substitute for resume-based profile context when
 * the user has not uploaded a resume. Results are cached for 24 hours.
 */
export async function inferSkillsFromTitle(
  title: string,
  userId?: string
): Promise<string[]> {
  if (!title || !title.trim()) return [];
  const cleanTitle = title.trim();
  const cacheKey = cleanTitle.toLowerCase();

  const cached = _skillInferenceCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < SKILL_CACHE_TTL_MS) {
    return cached.skills;
  }

  try {
    const raw = await Promise.race<string>([
      callAI({
        task: 'extract',
        jsonMode: true,
        maxTokens: 250,
        userId,
        messages: [
          {
            role: 'system',
            content:
              'You are a career taxonomy assistant. Given a job title, list 8 to 12 core technical skills, domain knowledge areas, and tools commonly expected for that role. Return ONLY valid JSON in the exact format: {"skills": ["Skill 1", "Skill 2", ...]} with no preamble or explanation.',
          },
          {
            role: 'user',
            content: `Job title: "${cleanTitle}"`,
          },
        ],
      }),
      new Promise<string>((_, reject) =>
        setTimeout(() => reject(new Error('Skill inference timed out')), 4000)
      ),
    ]);

    const parsed = JSON.parse(raw);
    const skills: string[] = Array.isArray(parsed?.skills)
      ? parsed.skills.filter((s: any) => typeof s === 'string' && s.trim().length > 0)
      : [];

    if (skills.length === 0) throw new Error('Empty skills response');

    _skillInferenceCache.set(cacheKey, { skills, ts: Date.now() });
    return skills;
  } catch (err: any) {
    console.warn(`[KeywordExpansion] Skill inference failed for "${cleanTitle}": ${err.message}`);
    return [];
  }
}

