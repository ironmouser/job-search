export function cleanJobUrl(rawUrl: string): string {
  try {
    let urlToParse = rawUrl.trim();
    if (urlToParse.endsWith('/')) {
        urlToParse = urlToParse.slice(0, -1);
    }
    const parsed = new URL(urlToParse);

    // 1. Unwrap LinkedIn login checkpoint or redirect URLs
    if (parsed.hostname.includes('linkedin.com') && parsed.searchParams.has('session_redirect')) {
      const redirect = parsed.searchParams.get('session_redirect');
      if (redirect) {
        let decoded = decodeURIComponent(redirect);
        // Handle double-encoded URLs
        if (decoded.includes('%2F') || decoded.includes('%3F')) {
          decoded = decodeURIComponent(decoded);
        }
        const targetUrl = decoded.startsWith('http') 
          ? decoded 
          : `https://www.linkedin.com${decoded.startsWith('/') ? '' : '/'}${decoded}`;
        return cleanJobUrl(targetUrl);
      }
    }

    // 2. Convert LinkedIn email comm deep links to standard guest view links
    if (parsed.hostname.includes('linkedin.com') && parsed.pathname.includes('/comm/jobs/view/')) {
      parsed.pathname = parsed.pathname.replace('/comm/jobs/view/', '/jobs/view/');
    }

    // 3. Unwrap Glassdoor email tracking / match links to canonical job listing URLs
    if (parsed.hostname.includes('glassdoor.com')) {
      const jlId = parsed.searchParams.get('jobListingId') || parsed.searchParams.get('jl');
      if (jlId) {
        return `https://glassdoor.com/job-listing/?jl=${jlId}`;
      }
    }

    // 4. Unwrap Indeed email tracking / redirect links to canonical job URLs
    if (parsed.hostname.includes('indeed.com')) {
      const jk = parsed.searchParams.get('jk');
      if (jk) {
        return `https://indeed.com/viewjob?jk=${jk}`;
      }
    }

    // 5. Unwrap ZipRecruiter email tracking links to canonical job URLs
    if (parsed.hostname.includes('ziprecruiter.com')) {
      const jid = parsed.searchParams.get('jid') || parsed.searchParams.get('job_id');
      if (jid) {
        return `https://ziprecruiter.com/jobs/${jid}`;
      }
    }

    // 6. General redirect unwrapper (e.g. email tracking links with dest/target/redirect_url)
    if (parsed.searchParams.has('redirect_url') || parsed.searchParams.has('target_url') || parsed.searchParams.has('continue')) {
      const target = parsed.searchParams.get('redirect_url') || parsed.searchParams.get('target_url') || parsed.searchParams.get('continue');
      if (target && target.startsWith('http')) {
        return cleanJobUrl(decodeURIComponent(target));
      }
    }
    
    // 4. Strip tracking query params
    const trackingParams = [
        'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 
        'ref', 'trackingid', 'trackingId', 'gh_src', 'src', 'trk', 'refId',
        'midToken', 'midSig', 'trkEmail', 'eid', 'otpToken', 'lipi', 'session_redirect'
    ];
    trackingParams.forEach(param => parsed.searchParams.delete(param));

    // 5. Normalize www vs non-www to always use non-www for deduplication
    if (parsed.hostname.startsWith('www.')) {
        parsed.hostname = parsed.hostname.slice(4);
    }
    
    let cleaned = parsed.toString();
    if (cleaned.endsWith('/')) {
        cleaned = cleaned.slice(0, -1);
    }
    return cleaned;
  } catch {
    return rawUrl.trim();
  }
}

export const TRUSTED_JOB_DOMAINS = [
  'linkedin.com',
  'indeed.com',
  'glassdoor.com',
  'ziprecruiter.com',
  'wellfound.com',
  'angel.co',
  'greenhouse.io',
  'lever.co',
  'workday.com',
  'myworkdayjobs.com',
  'ashbyhq.com',
  'workable.com',
  'bamboohr.com',
  'icims.com',
  'smartrecruiters.com',
  'taleo.net',
  'breezy.hr',
  'applytojob.com',
];

export function isTrustedJobUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    // Remove www. just in case
    const hostname = parsed.hostname.replace(/^www\./, '');
    return TRUSTED_JOB_DOMAINS.some(domain => 
      hostname === domain || hostname.endsWith(`.${domain}`)
    );
  } catch {
    return false; // Invalid URLs are inherently untrusted
  }
}

/**
 * Validates that a given URL is safe for server-side fetching (prevents SSRF).
 * Ensures http/https protocol and blocks localhost, private IPs, link-local metadata endpoints.
 */
export function isSafePublicUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl.trim());
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return false;
    }

    const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, ''); // strip IPv6 brackets

    // Block localhost / internal hostnames
    if (
      hostname === 'localhost' ||
      hostname.endsWith('.localhost') ||
      hostname.endsWith('.local') ||
      hostname.endsWith('.internal') ||
      hostname.endsWith('.lan') ||
      hostname === '0.0.0.0'
    ) {
      return false;
    }

    // IPv4 checks
    const ipv4Match = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (ipv4Match) {
      const [_, o1, o2, o3, o4] = ipv4Match.map(Number);
      if (o1 > 255 || o2 > 255 || o3 > 255 || o4 > 255) return false;

      // 127.0.0.0/8 (Loopback)
      if (o1 === 127) return false;
      // 10.0.0.0/8 (Private)
      if (o1 === 10) return false;
      // 172.16.0.0/12 (Private)
      if (o1 === 172 && o2 >= 16 && o2 <= 31) return false;
      // 192.168.0.0/16 (Private)
      if (o1 === 192 && o2 === 168) return false;
      // 169.254.0.0/16 (Link-local / AWS / GCP / Azure / DO metadata)
      if (o1 === 169 && o2 === 254) return false;
      // 0.0.0.0/8 (Current network)
      if (o1 === 0) return false;
    }

    // IPv6 loopback / unique local / link-local
    if (
      hostname === '::1' ||
      hostname === '::' ||
      hostname.startsWith('fe80:') ||
      hostname.startsWith('fc00:') ||
      hostname.startsWith('fd00:')
    ) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

export const KNOWN_ATS_DOMAINS = [
  'myworkdayjobs.com',
  'wd1.myworkdayjobs.com',
  'wd2.myworkdayjobs.com',
  'wd3.myworkdayjobs.com',
  'wd5.myworkdayjobs.com',
  'greenhouse.io',
  'boards.greenhouse.io',
  'lever.co',
  'jobs.lever.co',
  'ashbyhq.com',
  'jobs.ashbyhq.com',
  'workable.com',
  'apply.workable.com',
  'smartrecruiters.com',
  'jobs.smartrecruiters.com',
  'icims.com',
  'taleo.net',
  'recruitee.com',
  'bamboohr.com',
  'workforcenow.adp.com',
  'adp.com',
  'paylocity.com',
  'ultipro.com',
  'jobvite.com',
  'applytojob.com',
  'breezy.hr',
  'hire.trakstar.com',
  'careers.peoplesoft.com',
  'successfactors.com',
  'jobs.workday.com',
];

export function isKnownATSUrl(url?: string | null): boolean {
  if (!url) return false;
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return KNOWN_ATS_DOMAINS.some(
      (domain) => hostname === domain || hostname.endsWith(`.${domain}`)
    );
  } catch {
    return KNOWN_ATS_DOMAINS.some((domain) => url.includes(domain));
  }
}

export const AGGREGATOR_DOMAINS = [
  'ziprecruiter.com',
  'indeed.com',
  'glassdoor.com',
  'linkedin.com',
  'builtin.com',
  'wellfound.com',
  'angel.co',
  'dice.com',
  'monster.com',
  'careerbuilder.com',
  'simplyhired.com',
  'joblist.com',
  'remote.co',
  'remoteok.com',
  'weworkremotely.com',
  'himalayas.app',
  'otta.com',
  'hiring.cafe',
  'levels.fyi',
  'builtinnyc.com',
  'builtinboston.com',
  'builtinla.com',
  'builtinsf.com',
  'builtinseattle.com',
  'builtinchicago.com',
  'builtincolorado.com',
  'builtintexas.com',
];

export function isAggregatorUrl(url?: string | null): boolean {
  if (!url) return false;
  try {
    const hostname = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
    return AGGREGATOR_DOMAINS.some(
      (domain) => hostname === domain || hostname.endsWith(`.${domain}`)
    );
  } catch {
    return AGGREGATOR_DOMAINS.some((domain) => url.includes(domain));
  }
}

/**
 * Detects whether a URL is a non-job listing (e.g. company profile, recruiter overview,
 * school page, or generic company directory) rather than an individual job opening.
 */
export function isNonJobUrl(url?: string | null): boolean {
  if (!url) return true;
  try {
    const parsed = new URL(url.trim());
    const path = parsed.pathname.toLowerCase();
    const host = parsed.hostname.toLowerCase().replace(/^www\./, '');

    // Dice company profiles & recruiter directory pages
    if (host.includes('dice.com') && (path.includes('/company-profile') || path.startsWith('/company/') || path.startsWith('/employers/'))) {
      return true;
    }
    // LinkedIn company/school/member pages
    if (host.includes('linkedin.com') && (path.startsWith('/company/') || path.startsWith('/school/') || path.startsWith('/in/'))) {
      return true;
    }
    // Indeed company review / overview pages
    if (host.includes('indeed.com') && (path.startsWith('/cmp/') || path.startsWith('/companies/'))) {
      return true;
    }
    // ZipRecruiter company overview pages (note: /c/{Company}/Job/{Title} with jid is a valid job)
    if (host.includes('ziprecruiter.com')) {
      if (path.startsWith('/companies/')) return true;
      if (path.startsWith('/c/') && !path.includes('/job/') && !parsed.searchParams.has('jid')) return true;
    }
    // Glassdoor company overview / reviews / salaries
    if (host.includes('glassdoor.com') && (path.includes('/overview/') || path.includes('/reviews/') || path.includes('/benefits/') || path.includes('/salary/') || path.includes('/interviews/'))) {
      return true;
    }
    // Built In company profile pages
    if (host.includes('builtin') && (path.startsWith('/company/') || path.startsWith('/companies/'))) {
      return true;
    }
    // Levels.fyi company directory pages
    if (host.includes('levels.fyi') && path.startsWith('/companies/')) {
      return true;
    }
    // Wellfound company profile pages
    if (host.includes('wellfound.com') && path.startsWith('/company/')) {
      return true;
    }

    return false;
  } catch {
    return false;
  }
}

