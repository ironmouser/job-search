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

    // 3. General redirect unwrapper (e.g. email tracking links with dest/target)
    if (parsed.searchParams.has('redirect_url') || parsed.searchParams.has('target_url')) {
      const target = parsed.searchParams.get('redirect_url') || parsed.searchParams.get('target_url');
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
