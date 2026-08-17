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

const SENIORITY_PREFIXES = [
  'senior', 'sr.', 'sr', 'junior', 'jr.', 'jr', 'lead', 'principal', 'staff',
  'associate', 'head of', 'director of', 'vp of', 'vp', 'chief', 'entry level',
  'mid level', 'mid-level', 'intern', 'trainee', 'graduate'
];

// Dictionary of canonical role clusters and their common synonyms
const ROLE_SYNONYM_CLUSTERS: Record<string, string[]> = {
  // Sales & Account Management
  'account manager': ['Account Executive', 'Client Success Manager', 'Customer Success Manager', 'Relationship Manager'],
  'account executive': ['Account Manager', 'Sales Executive', 'Business Development Manager', 'Enterprise Sales'],
  'customer success': ['Customer Success Manager', 'Client Success Manager', 'Account Manager', 'Customer Experience Specialist'],
  'client success': ['Customer Success Manager', 'Account Manager', 'Client Relationship Manager'],
  'sales representative': ['Business Development Representative', 'Sales Executive', 'Account Executive', 'Inside Sales Representative'],
  'business development': ['Business Development Representative', 'Account Executive', 'Partnership Manager', 'Sales Representative'],
  'bdr': ['Business Development Representative', 'Sales Development Representative', 'Account Executive'],
  'sdr': ['Sales Development Representative', 'Business Development Representative', 'Inside Sales'],

  // Software & Technology
  'software engineer': ['Software Developer', 'Full Stack Engineer', 'Backend Engineer', 'Frontend Engineer', 'Application Developer'],
  'software developer': ['Software Engineer', 'Full Stack Developer', 'Application Developer', 'Web Developer'],
  'full stack': ['Full Stack Engineer', 'Full Stack Developer', 'Software Engineer', 'Web Developer'],
  'frontend': ['Frontend Engineer', 'Frontend Developer', 'UI Engineer', 'Web Developer'],
  'backend': ['Backend Engineer', 'Backend Developer', 'Software Engineer', 'Systems Engineer'],
  'devops': ['DevOps Engineer', 'Site Reliability Engineer', 'Cloud Engineer', 'Platform Engineer', 'Infrastructure Engineer'],
  'sre': ['Site Reliability Engineer', 'DevOps Engineer', 'Cloud Infrastructure Engineer'],
  'qa': ['QA Engineer', 'Quality Assurance Engineer', 'Test Automation Engineer', 'Software Test Engineer'],
  'mobile developer': ['iOS Developer', 'Android Developer', 'Mobile Engineer', 'React Native Developer'],

  // Product & Project Management
  'product manager': ['Product Owner', 'Technical Product Manager', 'Associate Product Manager', 'Product Lead'],
  'product owner': ['Product Manager', 'Technical Product Owner', 'Scrum Master'],
  'project manager': ['Program Manager', 'Technical Project Manager', 'Scrum Master', 'Project Coordinator'],
  'program manager': ['Technical Program Manager', 'Project Manager', 'Operations Program Manager'],
  'scrum master': ['Agile Coach', 'Project Manager', 'Delivery Lead'],

  // Data & AI
  'data analyst': ['Business Intelligence Analyst', 'BI Analyst', 'Analytics Specialist', 'Data Specialist'],
  'data scientist': ['Machine Learning Engineer', 'Applied Scientist', 'Data Analyst', 'AI Specialist'],
  'data engineer': ['Big Data Engineer', 'Analytics Engineer', 'Database Developer', 'Data Platform Engineer'],
  'business intelligence': ['BI Developer', 'BI Analyst', 'Data Analyst', 'Analytics Engineer'],
  'machine learning': ['Machine Learning Engineer', 'AI Engineer', 'Data Scientist', 'MLOps Engineer'],

  // Design & Creative
  'product designer': ['UI/UX Designer', 'UX Designer', 'UX/UI Designer', 'User Experience Designer'],
  'ux designer': ['Product Designer', 'UI/UX Designer', 'User Experience Designer', 'Interaction Designer'],
  'ui designer': ['UI/UX Designer', 'Visual Designer', 'Web Designer', 'Product Designer'],
  'graphic designer': ['Visual Designer', 'Brand Designer', 'Digital Designer', 'Content Creator'],

  // Marketing & Content
  'marketing manager': ['Digital Marketing Manager', 'Growth Marketer', 'Marketing Specialist', 'Brand Manager'],
  'digital marketing': ['Digital Marketing Specialist', 'Performance Marketer', 'Growth Marketer', 'SEO Specialist'],
  'content writer': ['Content Strategist', 'Copywriter', 'Technical Writer', 'Content Marketing Specialist'],
  'seo': ['SEO Specialist', 'Search Engine Optimization', 'Growth Marketer', 'Digital Marketer'],
  'social media': ['Social Media Manager', 'Community Manager', 'Content Specialist', 'Digital Marketing'],

  // Operations & HR
  'operations manager': ['Business Operations', 'Operations Specialist', 'Operations Lead', 'Office Manager'],
  'recruiter': ['Talent Acquisition Specialist', 'Technical Recruiter', 'Recruitment Specialist', 'Sourcer'],
  'talent acquisition': ['Recruiter', 'Talent Partner', 'Technical Recruiter', 'HR Specialist'],
  'human resources': ['HR Generalist', 'HR Specialist', 'People Operations', 'HR Manager'],
  'executive assistant': ['Administrative Assistant', 'Office Manager', 'Personal Assistant', 'Chief of Staff'],
  'customer service': ['Customer Support Specialist', 'Customer Care Representative', 'Client Support Representative', 'Help Desk Specialist'],

  // Finance & Accounting
  'financial analyst': ['Finance Associate', 'FP&A Analyst', 'Finance Specialist', 'Financial Planning Analyst'],
  'accountant': ['Staff Accountant', 'Senior Accountant', 'Bookkeeper', 'Financial Accountant'],

  // Healthcare
  'nurse': ['Registered Nurse', 'RN', 'Staff Nurse', 'Clinical Nurse'],
  'medical assistant': ['Clinical Assistant', 'Healthcare Specialist', 'Patient Care Coordinator']
};

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Strips common seniority and modifier prefixes/suffixes to isolate the core job title.
 */
export function getCoreKeyword(keyword: string): string {
  if (!keyword) return '';
  let cleaned = keyword.toLowerCase().trim();

  for (const prefix of SENIORITY_PREFIXES) {
    const escaped = escapeRegex(prefix);
    const startRegex = new RegExp(`^${escaped}\\s+`, 'i');
    const endRegex = new RegExp(`\\s+${escaped}$`, 'i');
    cleaned = cleaned.replace(startRegex, '').replace(endRegex, '').trim();
  }

  return cleaned || keyword.trim();
}

/**
 * Checks if targetText contains query with whole word boundary semantics.
 */
function matchesWholeWords(targetText: string, query: string): boolean {
  if (!targetText || !query) return false;
  const escaped = escapeRegex(query.toLowerCase().trim());
  const regex = new RegExp(`\\b${escaped}\\b`, 'i');
  return regex.test(targetText.toLowerCase());
}

/**
 * Expands a target search keyword into 2 to 5 relevant search terms.
 * Always ensures the user's exact input is the first element.
 */
export function expandSearchKeywords(keyword: string): string[] {
  if (!keyword || !keyword.trim()) return [];
  const rawTrimmed = keyword.trim();
  const lowerKeyword = rawTrimmed.toLowerCase();
  const core = getCoreKeyword(rawTrimmed);
  const lowerCore = core.toLowerCase();

  const results: string[] = [rawTrimmed];

  // If the core keyword is distinct from the raw input (e.g. "Senior Account Manager" -> "Account Manager"), add it
  if (lowerCore !== lowerKeyword && core.length >= 3) {
    results.push(core);
  }

  // Find matching synonym clusters using word-boundary matching
  for (const [clusterKey, synonyms] of Object.entries(ROLE_SYNONYM_CLUSTERS)) {
    const isMatch =
      matchesWholeWords(lowerKeyword, clusterKey) ||
      matchesWholeWords(lowerCore, clusterKey) ||
      (lowerCore.length >= 4 && matchesWholeWords(clusterKey, lowerCore));

    if (isMatch) {
      for (const syn of synonyms) {
        if (!results.some(r => r.toLowerCase() === syn.toLowerCase())) {
          results.push(syn);
        }
        if (results.length >= 5) break;
      }
    }
    if (results.length >= 5) break;
  }

  return results.slice(0, 5);
}

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
