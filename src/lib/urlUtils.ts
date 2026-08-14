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

