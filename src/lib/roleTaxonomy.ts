/**
 * Canonical Role Taxonomy & Static Synonym Clusters
 *
 * Client-safe data structure and pure helper functions with zero external dependencies.
 * Safe to import in both client UI components and server routes.
 */

export const SENIORITY_PREFIXES = [
  'senior', 'sr.', 'sr', 'junior', 'jr.', 'jr', 'lead', 'principal', 'staff',
  'associate', 'head of', 'director of', 'vp of', 'vp', 'chief', 'entry level',
  'mid level', 'mid-level', 'intern', 'trainee', 'graduate'
];

// Dictionary of canonical role clusters and their common synonyms
export const ROLE_SYNONYM_CLUSTERS: Record<string, string[]> = {
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
 * Splits comma- or semicolon-separated job titles into clean, distinct target roles.
 * E.g., "Administrative Assistant, quality control, medical, coding, billing"
 *   -> ["Administrative Assistant", "quality control", "medical", "coding", "billing"]
 */
export function splitTargetRoles(raw: string): string[] {
  if (!raw || !raw.trim()) return [];
  const parts = raw.split(/[,;/|]+/).map(p => p.trim()).filter(Boolean);
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const part of parts) {
    const lower = part.toLowerCase();
    if (!seen.has(lower)) {
      seen.add(lower);
      unique.push(part);
    }
  }
  return unique.length > 0 ? unique : [raw.trim()];
}

/**
 * Checks if targetText contains query with whole word boundary semantics.
 */
export function matchesWholeWords(targetText: string, query: string): boolean {
  if (!targetText || !query) return false;
  const escaped = escapeRegex(query.toLowerCase().trim());
  const regex = new RegExp(`\\b${escaped}\\b`, 'i');
  return regex.test(targetText.toLowerCase());
}

/**
 * Expands a target search keyword into relevant search terms.
 * Supports comma-separated lists by expanding each distinct role and deduplicating.
 * Always ensures the user's exact input role(s) are the first elements.
 */
export function expandSearchKeywords(keyword: string): string[] {
  if (!keyword || !keyword.trim()) return [];
  const subRoles = splitTargetRoles(keyword);

  if (subRoles.length > 1) {
    const results: string[] = [];
    for (const role of subRoles) {
      if (!results.some(r => r.toLowerCase() === role.toLowerCase())) {
        results.push(role);
      }
    }
    for (const role of subRoles) {
      const singleExp = expandSingleKeyword(role);
      for (const term of singleExp) {
        if (!results.some(r => r.toLowerCase() === term.toLowerCase())) {
          results.push(term);
        }
        if (results.length >= Math.max(8, subRoles.length * 2)) break;
      }
    }
    return results;
  }

  return expandSingleKeyword(keyword.trim());
}

function expandSingleKeyword(keyword: string): string[] {
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

/**
 * Flat deduplicated list of all canonical role titles and synonyms from ROLE_SYNONYM_CLUSTERS.
 * Used for instant client-side fuzzy matching in typeaheads.
 */
export const CANONICAL_TITLE_LIST: string[] = Array.from(
  new Set([
    ...Object.keys(ROLE_SYNONYM_CLUSTERS).map(k => k.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')),
    ...Object.values(ROLE_SYNONYM_CLUSTERS).flat()
  ])
).sort((a, b) => a.localeCompare(b));
