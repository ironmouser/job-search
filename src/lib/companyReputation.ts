/**
 * Universal Company & Job URL Reputation Engine
 *
 * Evaluates job URLs for legitimacy, anti-spoofing, and domain health
 * across companies of ALL sizes (early-stage startups, small businesses,
 * mid-market companies, and large enterprises) without restricting to a rigid whitelist.
 */

export interface UrlReputationResult {
  isLegitimate: boolean;
  confidence: 'high' | 'medium' | 'low' | 'suspicious';
  isKnownATS: boolean;
  isCareerPath: boolean;
  flags: string[];
  reasons: string[];
  suggestedCompanyName?: string;
}

// Known Application Tracking Systems & Job Boards (Instant High Confidence)
export const KNOWN_ATS_DOMAINS = [
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
  'recruitee.com',
  'rippling-ats.com',
  'jobvite.com',
  'pinpointhq.com',
  'personio.com',
  'teamtailor.com',
  'jazzhr.com',
  'polywork.com',
  'workatastartup.com',
  'linkedin.com',
  'indeed.com',
  'glassdoor.com',
  'ziprecruiter.com',
  'wellfound.com',
  'angel.co',
  'dice.com',
  'monster.com',
  'hired.com',
];

// High-risk TLDs predominantly associated with disposable scams / malware
const HIGH_RISK_TLDS = new Set([
  'tk', 'ml', 'ga', 'cf', 'gq', 'top', 'work', 'loan', 'men', 'click', 'buzz',
  'surf', 'stream', 'party', 'gdn', 'review', 'country', 'kim', 'science',
]);

// Suspicious URL substrings indicating credential theft, phishing, or crypto scams
const SUSPICIOUS_PATTERNS = [
  /wallet[-_]?connect/i,
  /claim[-_]?(airdrop|token|reward|bonus|crypto)/i,
  /account[-_]?(verify|verification|update|secure|suspended)/i,
  /login[-_]?(checkpoint|secure|pass|auth|session)/i,
  /giftcard/i,
  /paypal[-_]?verify/i,
  /banking[-_]?security/i,
];

// Typical career and job path patterns
const CAREER_PATH_REGEX = /(?:^|\/)(careers?|jobs?|openings|positions|vacancies|join-us|work-with-us|join|opportunities|employment|requisition|posting|hiring|apply)(?:$|[/?#_-])/i;

/**
 * Checks if a hostname uses punycode or homoglyph character spoofing.
 */
export function isHomoglyphOrPunycode(hostname: string): boolean {
  if (hostname.toLowerCase().includes('xn--')) {
    return true;
  }
  // Check for mixed non-ASCII scripts in what should be standard Latin domains
  // eslint-disable-next-line no-control-regex
  return /[^\u0000-\u007F]/.test(hostname);
}

/**
 * Checks if a URL path matches typical career, job, or application patterns.
 */
export function isCareerPath(pathname: string): boolean {
  return CAREER_PATH_REGEX.test(pathname);
}

/**
 * Extracts a readable company name guess from domain name.
 */
export function guessCompanyNameFromDomain(hostname: string): string {
  const cleanHost = hostname.replace(/^www\./, '').toLowerCase();
  const parts = cleanHost.split('.');
  if (parts.length >= 2) {
    const mainPart = parts[0] === 'jobs' || parts[0] === 'careers' ? parts[1] : parts[0];
    return mainPart.charAt(0).toUpperCase() + mainPart.slice(1);
  }
  return 'Company';
}

/**
 * Evaluates the reputation and legitimacy of any job URL.
 * Supports small companies, startups, and large enterprises.
 */
export function evaluateUrlReputation(rawUrl: string): UrlReputationResult {
  const flags: string[] = [];
  const reasons: string[] = [];

  if (!rawUrl || typeof rawUrl !== 'string') {
    return {
      isLegitimate: false,
      confidence: 'suspicious',
      isKnownATS: false,
      isCareerPath: false,
      flags: ['EMPTY_OR_INVALID_URL'],
      reasons: ['URL string is missing or empty.'],
    };
  }

  let parsed: URL;
  try {
    const normalized = rawUrl.trim().startsWith('http') ? rawUrl.trim() : `https://${rawUrl.trim()}`;
    parsed = new URL(normalized);
  } catch {
    return {
      isLegitimate: false,
      confidence: 'suspicious',
      isKnownATS: false,
      isCareerPath: false,
      flags: ['MALFORMED_URL'],
      reasons: ['URL could not be parsed as a valid web address.'],
    };
  }

  const hostname = parsed.hostname.toLowerCase().replace(/^www\./, '');
  const pathname = parsed.pathname;
  const fullUrlString = parsed.toString();

  // 1. IP address hostname check (SSRF / Scam prevention)
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(hostname) || hostname === 'localhost' || hostname === '0.0.0.0') {
    flags.push('IP_OR_LOCAL_HOST');
    reasons.push('Raw IP addresses or local endpoints are not permitted.');
    return {
      isLegitimate: false,
      confidence: 'suspicious',
      isKnownATS: false,
      isCareerPath: false,
      flags,
      reasons,
    };
  }

  // 2. Punycode & Homoglyph check
  if (isHomoglyphOrPunycode(hostname)) {
    flags.push('HOMOGLYPH_OR_PUNYCODE');
    reasons.push('Domain contains punycode or lookalike homoglyph characters.');
    return {
      isLegitimate: false,
      confidence: 'suspicious',
      isKnownATS: false,
      isCareerPath: false,
      flags,
      reasons,
    };
  }

  // 3. Phishing / credential theft pattern check
  for (const pattern of SUSPICIOUS_PATTERNS) {
    if (pattern.test(fullUrlString)) {
      flags.push('SUSPICIOUS_PHISHING_PATTERN');
      reasons.push('URL contains keywords associated with phishing or account takeover.');
      return {
        isLegitimate: false,
        confidence: 'suspicious',
        isKnownATS: false,
        isCareerPath: false,
        flags,
        reasons,
      };
    }
  }

  // 4. High-risk disposable TLD check
  const hostParts = hostname.split('.');
  const tld = hostParts[hostParts.length - 1];
  if (HIGH_RISK_TLDS.has(tld)) {
    flags.push('HIGH_RISK_TLD');
    reasons.push(`The domain uses a high-risk TLD (.${tld}) frequently used in disposable scam sites.`);
    return {
      isLegitimate: false,
      confidence: 'suspicious',
      isKnownATS: false,
      isCareerPath: false,
      flags,
      reasons,
    };
  }

  // 5. Check if it's a recognized ATS or major job board (Tier 1 Verified)
  const isKnownATS = KNOWN_ATS_DOMAINS.some(ats => hostname === ats || hostname.endsWith(`.${ats}`));
  const hasCareerPath = isCareerPath(pathname) || isCareerPath(hostname);

  const suggestedCompanyName = guessCompanyNameFromDomain(hostname);

  if (isKnownATS) {
    return {
      isLegitimate: true,
      confidence: 'high',
      isKnownATS: true,
      isCareerPath: true,
      flags: ['VERIFIED_ATS_OR_BOARD'],
      reasons: ['Domain is a recognized Applicant Tracking System or verified job board.'],
      suggestedCompanyName,
    };
  }

  // 6. Legitimate Company Domain (Startups, Small Businesses, Mid-Market & Enterprise)
  // If the domain is well-structured, has a valid business TLD, and no red flags:
  if (hasCareerPath) {
    return {
      isLegitimate: true,
      confidence: 'high',
      isKnownATS: false,
      isCareerPath: true,
      flags: ['COMPANY_CAREER_PORTAL'],
      reasons: ['Valid company domain with standard career/job path structure.'],
      suggestedCompanyName,
    };
  }

  // Even if the path doesn't explicitly contain /careers/ or /jobs/ (e.g. custom permalink or requisition ID):
  // As long as there are no malicious flags, we mark it as legitimate for content evaluation
  return {
    isLegitimate: true,
    confidence: 'medium',
    isKnownATS: false,
    isCareerPath: false,
    flags: ['COMPANY_CUSTOM_PATH'],
    reasons: ['Valid company domain. Content will be analyzed for job posting details.'],
    suggestedCompanyName,
  };
}
