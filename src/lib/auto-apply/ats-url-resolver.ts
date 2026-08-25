/**
 * ats-url-resolver.ts
 *
 * Universal utility for identifying embedded ATS tokens (e.g. Greenhouse gh_jid,
 * Lever lever_token, Ashby ashby_jid, Workable, SmartRecruiters, iCIMS) inside
 * employer job portal URLs and transforming them into direct, unblocked ATS endpoints.
 */

interface EmbeddedAtsPattern {
  platform: 'greenhouse' | 'lever' | 'ashby' | 'workable' | 'smartrecruiters' | 'icims';
  paramNames: string[];
  resolveUrl: (jobId: string, companySlug: string, originalUrl: URL) => string;
}

/**
 * Extracts a clean company slug from an employer website URL or company name.
 * e.g. "https://www.zoro.com/careers/jobs" -> "zoro"
 * e.g. "https://careers.datadoghq.com/detail/123" -> "datadog"
 */
export function extractCompanySlug(url: string | URL, companyName?: string): string {
  try {
    const parsed = typeof url === 'string' ? new URL(url) : url;
    
    // Check explicit query param overrides like ?for=company or ?company=company
    const forParam = parsed.searchParams.get('for') || parsed.searchParams.get('company');
    if (forParam && forParam.trim()) {
      return sanitizeSlug(forParam.trim());
    }

    // Extract from hostname
    const hostname = parsed.hostname.toLowerCase();
    const parts = hostname.split('.').filter(Boolean);

    // Remove common subdomains
    const filteredParts = parts.filter(
      (p) => !['www', 'careers', 'jobs', 'about', 'app', 'hire', 'apply', 'corp', 'portal', 'work'].includes(p)
    );

    if (filteredParts.length >= 2) {
      // First non-subdomain part (e.g. zoro from zoro.com or datadoghq from datadoghq.com)
      let slug = filteredParts[0];
      // Clean common suffixes like "hq", "inc", "corp", "careers" if part of domain
      slug = slug.replace(/(?:careers|jobs|hq|inc|corp|app|software|tech|global|group)$/i, '');
      if (slug.length >= 2) {
        return sanitizeSlug(slug);
      }
      return sanitizeSlug(filteredParts[0]);
    }
  } catch {}

  if (companyName) {
    return sanitizeSlug(companyName);
  }

  return 'company';
}

function sanitizeSlug(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

const EMBEDDED_ATS_PATTERNS: EmbeddedAtsPattern[] = [
  {
    platform: 'greenhouse',
    paramNames: ['gh_jid', 'greenhouse_job_id', 'gh_job_id'],
    resolveUrl: (jobId, companySlug, originalUrl) => {
      const ghSrc = originalUrl.searchParams.get('gh_src');
      const srcQuery = ghSrc ? `?gh_src=${encodeURIComponent(ghSrc)}` : '';
      return `https://boards.greenhouse.io/${companySlug}/jobs/${jobId}${srcQuery}`;
    },
  },
  {
    platform: 'lever',
    paramNames: ['lever_token', 'lever_job_id', 'lever_id'],
    resolveUrl: (jobId, companySlug) => {
      return `https://jobs.lever.co/${companySlug}/${jobId}`;
    },
  },
  {
    platform: 'ashby',
    paramNames: ['ashby_jid', 'ashby_job_id', 'ashby_id'],
    resolveUrl: (jobId, companySlug) => {
      return `https://jobs.ashbyhq.com/${companySlug}/${jobId}`;
    },
  },
  {
    platform: 'workable',
    paramNames: ['workable_job_id', 'workable_jid', 'workable_token', 'w_jid'],
    resolveUrl: (jobId, companySlug) => {
      return `https://apply.workable.com/${companySlug}/j/${jobId}`;
    },
  },
  {
    platform: 'smartrecruiters',
    paramNames: ['smartrecruiters_jid', 'st_jid', 'sr_jid'],
    resolveUrl: (jobId, companySlug) => {
      return `https://jobs.smartrecruiters.com/${companySlug}/${jobId}`;
    },
  },
  {
    platform: 'icims',
    paramNames: ['icims_jid', 'icims_job_id'],
    resolveUrl: (jobId, companySlug) => {
      return `https://careers-${companySlug}.icims.com/jobs/${jobId}/job`;
    },
  },
];

/**
 * Checks if a URL contains embedded ATS parameters and resolves it to a direct ATS endpoint.
 *
 * Examples:
 *  - "https://www.zoro.com/careers/jobs?gh_jid=4692557006&gh_src=0c2bd01d6us"
 *    -> "https://boards.greenhouse.io/zoro/jobs/4692557006?gh_src=0c2bd01d6us"
 *
 *  - "https://careers.datadoghq.com/detail/8076871/?gh_jid=8076871&gh_src=c6d4c5501"
 *    -> "https://boards.greenhouse.io/datadog/jobs/8076871?gh_src=c6d4c5501"
 *
 * Returns the resolved direct ATS URL, or null if no embedded ATS pattern matches.
 */
export function resolveEmbeddedAtsUrl(rawUrl: string, companyName?: string): string | null {
  if (!rawUrl || !rawUrl.startsWith('http')) return null;

  try {
    const parsed = new URL(rawUrl);
    const companySlug = extractCompanySlug(parsed, companyName);

    for (const pattern of EMBEDDED_ATS_PATTERNS) {
      for (const param of pattern.paramNames) {
        const jobId = parsed.searchParams.get(param);
        if (jobId && jobId.trim()) {
          return pattern.resolveUrl(jobId.trim(), companySlug, parsed);
        }
      }
    }

    // Special check for Greenhouse embed URLs already partially structured
    // e.g. /jobs/embed?for=zoro&token=4692557006
    if (parsed.searchParams.has('token') && (parsed.searchParams.has('for') || parsed.pathname.includes('greenhouse') || parsed.pathname.includes('grnhse'))) {
      const token = parsed.searchParams.get('token')!;
      const forComp = parsed.searchParams.get('for') || companySlug;
      return `https://boards.greenhouse.io/${sanitizeSlug(forComp)}/jobs/${token.trim()}`;
    }
  } catch {}

  return null;
}
