/**
 * atsDetector.ts
 *
 * Unified ATS detection and token resolution service for JAHQ.
 * Consolidates URL hostname matching, embedded query token extraction,
 * and HTML signature inspection.
 */

export enum ATSPlatform {
  WORKDAY = 'workday',
  GREENHOUSE = 'greenhouse',
  LEVER = 'lever',
  ASHBY = 'ashby',
  WORKABLE = 'workable',
  SMARTRECRUITERS = 'smartrecruiters',
  TALEO = 'taleo',
  ICIMS = 'icims',
  BREEZY = 'breezy',
  JOBVITE = 'jobvite',
  SUCCESSFACTORS = 'successfactors',
  ADP = 'adp',
  UNKNOWN = 'unknown',
}

export interface WorkdayUrlMetadata {
  subdomain: string;
  tenant: string;
  site: string;
  cxsEndpoint: string;
}

export interface ATSDetectionResult {
  platform: ATSPlatform;
  confidence: number; // 0–100
  detectedFeatures: string[];
  automationSupported: boolean;
  companySlug?: string;
  jobId?: string;
  directAtsUrl?: string;
  workdayTenant?: string;
  workdaySite?: string;
  workdayCxsEndpoint?: string;
}

interface DetectionRule {
  platform: ATSPlatform;
  automationSupported: boolean;
  hostnamePatterns: RegExp[];
  urlKeywords: string[];
}

const DETECTION_RULES: DetectionRule[] = [
  {
    platform: ATSPlatform.WORKDAY,
    automationSupported: true,
    hostnamePatterns: [/\.myworkdayjobs\.com$/i, /\.wd\d+\.myworkdayjobs\.com$/i, /\.workday\.com$/i],
    urlKeywords: ['myworkdayjobs', 'workday'],
  },
  {
    platform: ATSPlatform.GREENHOUSE,
    automationSupported: true,
    hostnamePatterns: [/^boards\.greenhouse\.io$/i, /^job-boards\.greenhouse\.io$/i, /\.greenhouse\.io$/i],
    urlKeywords: ['greenhouse.io', 'greenhouse', 'gh_jid', 'gh_src'],
  },
  {
    platform: ATSPlatform.LEVER,
    automationSupported: true,
    hostnamePatterns: [/^jobs\.lever\.co$/i, /\.lever\.co$/i],
    urlKeywords: ['lever.co', '/lever/'],
  },
  {
    platform: ATSPlatform.ASHBY,
    automationSupported: true,
    hostnamePatterns: [/^jobs\.ashbyhq\.com$/i, /\.ashbyhq\.com$/i],
    urlKeywords: ['ashbyhq.com', 'ashbyhq', '/ashby/', 'ashby_jid', 'ashby_embed'],
  },
  {
    platform: ATSPlatform.WORKABLE,
    automationSupported: true,
    hostnamePatterns: [/^apply\.workable\.com$/i, /\.workable\.com$/i],
    urlKeywords: ['workable.com', 'workable'],
  },
  {
    platform: ATSPlatform.SMARTRECRUITERS,
    automationSupported: true,
    hostnamePatterns: [/\.smartrecruiters\.com$/i, /^careers\.smartrecruiters\.com$/i],
    urlKeywords: ['smartrecruiters.com', 'smartrecruiters', 'smartrecruiter'],
  },
  {
    platform: ATSPlatform.BREEZY,
    automationSupported: false,
    hostnamePatterns: [/\.breezy\.hr$/i],
    urlKeywords: ['breezy.hr', 'breezy'],
  },
  {
    platform: ATSPlatform.TALEO,
    automationSupported: true,
    hostnamePatterns: [/\.taleo\.net$/i, /\.taleo\.com$/i],
    urlKeywords: ['taleo.net', 'taleo.com', 'taleo'],
  },
  {
    platform: ATSPlatform.ICIMS,
    automationSupported: true,
    hostnamePatterns: [/\.icims\.com$/i, /^careers-\w+\.icims\.com$/i],
    urlKeywords: ['icims.com', 'icims_jid', 'icims'],
  },
  {
    platform: ATSPlatform.JOBVITE,
    automationSupported: false,
    hostnamePatterns: [/\.jobvite\.com$/i, /^jobs\.jobvite\.com$/i],
    urlKeywords: ['jobvite.com', 'jobvite'],
  },
  {
    platform: ATSPlatform.SUCCESSFACTORS,
    automationSupported: false,
    hostnamePatterns: [/\.successfactors\.com$/i, /\.successfactors\.eu$/i],
    urlKeywords: ['successfactors.com', 'successfactors'],
  },
];

/**
 * Extracts a clean company slug from an employer website URL or company name.
 */
export function extractCompanySlug(url: string | URL, companyName?: string): string {
  try {
    const parsed = typeof url === 'string' ? new URL(url) : url;

    // Check explicit query param overrides
    const forParam = parsed.searchParams.get('for') || parsed.searchParams.get('company') || parsed.searchParams.get('org');
    if (forParam && forParam.trim()) {
      return sanitizeSlug(forParam.trim());
    }

    const hostname = parsed.hostname.toLowerCase();
    const parts = hostname.split('.').filter(Boolean);

    // If path starts with company slug on known ATS (e.g. boards.greenhouse.io/stripe or jobs.lever.co/netflix)
    const pathParts = parsed.pathname.split('/').filter(Boolean);
    if (
      (hostname.includes('greenhouse.io') ||
       hostname.includes('lever.co') ||
       hostname.includes('ashbyhq.com') ||
       hostname.includes('workable.com') ||
       hostname.includes('smartrecruiters.com')) &&
      pathParts.length > 0
    ) {
      const nonSlugPrefixes = ['jobs', 'embed', 'search', 'v1', 'v0', 'postings', 'api', 'widget', 'accounts', 'detail', 'opening'];
      const candidatePart = pathParts.find(p => !nonSlugPrefixes.includes(p.toLowerCase()));
      if (candidatePart) {
        return sanitizeSlug(candidatePart);
      }
    }

    // Remove common non-brand subdomains
    const filteredParts = parts.filter(
      (p) => !['www', 'careers', 'jobs', 'about', 'app', 'hire', 'apply', 'corp', 'portal', 'work'].includes(p)
    );

    if (filteredParts.length >= 2) {
      let slug = filteredParts[0];
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

export function sanitizeSlug(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Parses Workday candidate experience service (CXS) parameters from a Workday URL.
 */
export function parseWorkdayUrl(url: string | URL): WorkdayUrlMetadata | null {
  try {
    const parsed = typeof url === 'string' ? new URL(url) : url;
    const hostname = parsed.hostname.toLowerCase();
    if (!hostname.includes('myworkdayjobs.com') && !hostname.includes('workday.com')) {
      return null;
    }

    const hostParts = hostname.split('.');
    const tenant = hostParts[0];
    const fullSubdomain = hostParts.slice(0, -2).join('.');

    const pathParts = parsed.pathname.split('/').filter(Boolean);
    const nonLocaleParts = pathParts.filter(
      (p) => !/^[a-z]{2}(?:-[a-z]{2,4})?$/i.test(p) && p.toLowerCase() !== 'job' && !p.startsWith('JR') && !p.startsWith('R')
    );

    const site = nonLocaleParts.length > 0 ? nonLocaleParts[0] : `${tenant}_Careers`;

    return {
      subdomain: fullSubdomain || tenant,
      tenant,
      site,
      cxsEndpoint: `https://${hostname}/wday/cxs/${tenant}/${site}/jobs`,
    };
  } catch {
    return null;
  }
}

/**
 * Detects ATS platform and any embedded job tokens from a URL.
 */
export function detectAtsFromUrl(jobUrl: string, companyName?: string): ATSDetectionResult {
  if (!jobUrl || !jobUrl.startsWith('http')) {
    return {
      platform: ATSPlatform.UNKNOWN,
      confidence: 0,
      detectedFeatures: [],
      automationSupported: false,
    };
  }

  try {
    const parsed = new URL(jobUrl);
    const hostname = parsed.hostname.toLowerCase();
    const fullUrl = jobUrl.toLowerCase();
    const detectedCompanySlug = extractCompanySlug(parsed, companyName);

    // Check embedded query parameters first (e.g. ?gh_jid=123 on employer site)
    const ghJid = parsed.searchParams.get('gh_jid') || parsed.searchParams.get('greenhouse_job_id');
    if (ghJid) {
      return {
        platform: ATSPlatform.GREENHOUSE,
        confidence: 95,
        detectedFeatures: [`param:gh_jid=${ghJid}`],
        automationSupported: true,
        companySlug: detectedCompanySlug,
        jobId: ghJid,
        directAtsUrl: `https://boards.greenhouse.io/${detectedCompanySlug}/jobs/${ghJid}`,
      };
    }

    const leverToken = parsed.searchParams.get('lever_token') || parsed.searchParams.get('lever_job_id');
    if (leverToken) {
      return {
        platform: ATSPlatform.LEVER,
        confidence: 95,
        detectedFeatures: [`param:lever_token=${leverToken}`],
        automationSupported: true,
        companySlug: detectedCompanySlug,
        jobId: leverToken,
        directAtsUrl: `https://jobs.lever.co/${detectedCompanySlug}/${leverToken}`,
      };
    }

    const ashbyJid = parsed.searchParams.get('ashby_jid') || parsed.searchParams.get('ashby_job_id');
    if (ashbyJid) {
      return {
        platform: ATSPlatform.ASHBY,
        confidence: 95,
        detectedFeatures: [`param:ashby_jid=${ashbyJid}`],
        automationSupported: true,
        companySlug: detectedCompanySlug,
        jobId: ashbyJid,
        directAtsUrl: `https://jobs.ashbyhq.com/${detectedCompanySlug}/${ashbyJid}`,
      };
    }

    const workableJid = parsed.searchParams.get('workable_job_id') || parsed.searchParams.get('workable_jid');
    if (workableJid) {
      return {
        platform: ATSPlatform.WORKABLE,
        confidence: 95,
        detectedFeatures: [`param:workable_jid=${workableJid}`],
        automationSupported: true,
        companySlug: detectedCompanySlug,
        jobId: workableJid,
        directAtsUrl: `https://apply.workable.com/${detectedCompanySlug}/j/${workableJid}`,
      };
    }

    const srJid = parsed.searchParams.get('smartrecruiters_jid') || parsed.searchParams.get('sr_jid');
    if (srJid) {
      return {
        platform: ATSPlatform.SMARTRECRUITERS,
        confidence: 95,
        detectedFeatures: [`param:smartrecruiters_jid=${srJid}`],
        automationSupported: true,
        companySlug: detectedCompanySlug,
        jobId: srJid,
        directAtsUrl: `https://jobs.smartrecruiters.com/${detectedCompanySlug}/${srJid}`,
      };
    }

    // Special case: Workday URL parsing for Candidate Experience Service (CXS) API
    if (hostname.includes('myworkdayjobs.com') || hostname.includes('workday.com')) {
      const wdMeta = parseWorkdayUrl(parsed);
      return {
        platform: ATSPlatform.WORKDAY,
        confidence: 95,
        detectedFeatures: [`hostname:${hostname}`, `workday:tenant=${wdMeta?.tenant || detectedCompanySlug}`],
        automationSupported: true,
        companySlug: wdMeta?.tenant || detectedCompanySlug,
        directAtsUrl: jobUrl,
        workdayTenant: wdMeta?.tenant,
        workdaySite: wdMeta?.site,
        workdayCxsEndpoint: wdMeta?.cxsEndpoint,
      };
    }

    // Standard hostname pattern matching
    for (const rule of DETECTION_RULES) {
      const hostnameMatch = rule.hostnamePatterns.some((p) => p.test(hostname));
      const keywordMatch = rule.urlKeywords.some((kw) => fullUrl.includes(kw));

      if (hostnameMatch || keywordMatch) {
        return {
          platform: rule.platform,
          confidence: hostnameMatch ? 90 : 65,
          detectedFeatures: [
            hostnameMatch ? `hostname:${hostname}` : `url-keyword:match`,
          ],
          automationSupported: rule.automationSupported,
          companySlug: detectedCompanySlug,
          directAtsUrl: jobUrl,
        };
      }
    }
  } catch {
    // Invalid URL
  }

  return {
    platform: ATSPlatform.UNKNOWN,
    confidence: 0,
    detectedFeatures: [],
    automationSupported: false,
  };
}

/**
 * Inspects rendered HTML (JSON-LD, links, script tags, meta redirects) to detect
 * destination ATS platform and direct application URLs.
 */
export function detectAtsFromHtml(html: string, pageUrl?: string): ATSDetectionResult {
  if (!html || html.length < 50) {
    return { platform: ATSPlatform.UNKNOWN, confidence: 0, detectedFeatures: [], automationSupported: false };
  }

  // 1. JSON-LD schema.org/JobPosting inspection
  const jsonLdMatches = html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
  for (const match of jsonLdMatches) {
    try {
      const data = JSON.parse(match[1]);
      const items = Array.isArray(data)
        ? data
        : data['@graph'] && Array.isArray(data['@graph'])
        ? data['@graph']
        : [data];

      for (const item of items) {
        if (item?.['@type'] === 'JobPosting') {
          const directApply = item.directApply || item.url;
          if (directApply && typeof directApply === 'string') {
            const detected = detectAtsFromUrl(directApply);
            if (detected.platform !== ATSPlatform.UNKNOWN) {
              return {
                ...detected,
                confidence: 95,
                detectedFeatures: [`json-ld:${detected.platform}`, ...detected.detectedFeatures],
              };
            }
          }
        }
      }
    } catch {}
  }

  // 2. Scan links (<a href>) for known ATS domains
  const hrefMatches = html.matchAll(/href=["'](https?:\/\/[^"'\s>]+)["']/gi);
  for (const match of hrefMatches) {
    const href = match[1];
    const detected = detectAtsFromUrl(href);
    if (detected.platform !== ATSPlatform.UNKNOWN) {
      return {
        ...detected,
        confidence: 85,
        detectedFeatures: [`link:${detected.platform}`, ...detected.detectedFeatures],
      };
    }
  }

  // 3. Scan script embeds for ATS endpoints or window.location redirects
  const scriptRegex = /(https?:\/\/[a-z0-9.-]+(?:myworkdayjobs|greenhouse|lever|ashbyhq|workable|smartrecruiters|icims|taleo|breezy)[^"'\s<>]+)/gi;
  const scriptMatches = html.matchAll(scriptRegex);
  for (const match of scriptMatches) {
    const candidate = match[1];
    const detected = detectAtsFromUrl(candidate);
    if (detected.platform !== ATSPlatform.UNKNOWN) {
      return {
        ...detected,
        confidence: 80,
        detectedFeatures: [`script:${detected.platform}`, ...detected.detectedFeatures],
      };
    }
  }

  return {
    platform: ATSPlatform.UNKNOWN,
    confidence: 0,
    detectedFeatures: [],
    automationSupported: false,
  };
}
