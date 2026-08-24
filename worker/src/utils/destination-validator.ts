/**
 * destination-validator.ts
 *
 * Classifies candidate links and buttons found on job board pages / modals,
 * and validates whether a destination URL is a legitimate application target.
 *
 * Used by AggregatorHandler to filter legal/nav/auth links before following any URL.
 */

// ─── Enums ────────────────────────────────────────────────────────────────────

export enum CandidateClassification {
  DIRECT_ATS_LINK         = 'DIRECT_ATS_LINK',       // Known ATS domain (Greenhouse, Lever, etc.)
  AGGREGATOR_REDIRECT     = 'AGGREGATOR_REDIRECT',    // Job board redirect to external apply URL
  APPLICATION_LINK        = 'APPLICATION_LINK',       // External link with apply context indicators
  APPLICATION_ACTION_BUTTON = 'APPLICATION_ACTION_BUTTON', // Button: "Apply on company site"
  MODAL_CONTINUE_BUTTON   = 'MODAL_CONTINUE_BUTTON',  // "Continue to application", "Proceed"
  IFRAME_APPLICATION      = 'IFRAME_APPLICATION',     // Iframe embedding an application form
  LEGAL_LINK              = 'LEGAL_LINK',             // Privacy policy, terms, cookies, etc.
  AUTH_LINK               = 'AUTH_LINK',              // Login, signup, sign in, account gates
  SOCIAL_LINK             = 'SOCIAL_LINK',            // Social media profiles
  NAV_LINK                = 'NAV_LINK',               // Site navigation, about, contact, footer
  UNKNOWN                 = 'UNKNOWN',
}

export interface CandidateInfo {
  text: string;
  href: string;
  ariaLabel: string;
  title: string;
  dataTracking: string;
  id: string;
  className: string;
  tagName: string;
  role: string;
  dataUrl?: string;
  onclick?: string;
}

export interface ClassificationResult {
  classification: CandidateClassification;
  accepted: boolean;
  reason: string;
  /** Resolved href after extracting redirect URL parameters (if applicable) */
  resolvedHref: string;
}

// ─── Known Patterns ───────────────────────────────────────────────────────────

const KNOWN_ATS_DOMAINS = [
  'greenhouse.io',
  'lever.co',
  'ashbyhq.com',
  'myworkdayjobs.com',
  'workday.com',
  'workable.com',
  'smartrecruiters.com',
  'icims.com',
  'taleo.net',
  'taleo.com',
  'oraclecloud.com',
  'recruitee.com',
  'bamboohr.com',
  'workforcenow.adp.com',
  'jobvite.com',
  'applytojob.com',
  'breezy.hr',
  'successfactors.com',
  'hire.trakstar.com',
  'ultipro.com',
  'paylocity.com',
  'dayforce.com',
  'ceridian.com',
];

const AGGREGATOR_DOMAINS = [
  'builtin.com',
  'builtinnyc.com',
  'builtinboston.com',
  'builtinla.com',
  'builtinsf.com',
  'builtinseattle.com',
  'builtinchicago.com',
  'builtincolorado.com',
  'builtintexas.com',
  'linkedin.com',
  'indeed.com',
  'glassdoor.com',
  'ziprecruiter.com',
  'dice.com',
  'monster.com',
  'careerbuilder.com',
  'simplyhired.com',
  'snagajob.com',
  'jooble.org',
  'linkup.com',
  'lensa.com',
  'talent.com',
  'salary.com',
  'usajobs.gov',
  'adzuna.com',
  'wellfound.com',
  'angel.co',
  'remote.co',
  'remoteok.com',
  'weworkremotely.com',
  'himalayas.app',
  'otta.com',
  'hiring.cafe',
  'levels.fyi',
];

const LEGAL_PATHS = [
  '/privacy',
  '/privacy-policy',
  '/terms',
  '/terms-of-service',
  '/terms-of-use',
  '/cookie',
  '/cookie-policy',
  '/cookies',
  '/legal',
  '/gdpr',
  '/ccpa',
  '/accessibility',
  '/disclaimer',
  '/dmca',
];

const LEGAL_TEXT_REGEX = /\b(privacy policy|terms of service|terms of use|terms and conditions|cookie policy|cookies|legal notice|disclaimer|privacy notice|data policy|gdpr|accessibility statement)\b/i;

const SOCIAL_DOMAINS = [
  'facebook.com', 'fb.com',
  'twitter.com', 'x.com',
  'instagram.com',
  'youtube.com',
  'linkedin.com/company',
  'tiktok.com',
  'reddit.com',
  'pinterest.com',
  'snapchat.com',
  'threads.net',
];

const AUTH_PATHS = [
  '/login', '/signin', '/sign-in',
  '/signup', '/sign-up', '/register', '/join',
  '/auth', '/oauth', '/sso',
  '/checkpoint', '/uas/', '/authwall',
  '/cold-join', '/start',
];

const AUTH_TEXT_REGEX = /\b(sign in|sign up|log in|log out|login|register|create account|join now|create a profile)\b/i;
const APPLY_AUTH_TEXT_REGEX = /\b(sign in to (easy )?apply|log in to (easy )?apply|login to (easy )?apply|sign up to (easy )?apply|register to (easy )?apply|create account to (easy )?apply|join to (easy )?apply|join now to apply)\b/i;

const NAV_PATHS = [
  '/about', '/about-us', '/company',
  '/contact', '/contact-us',
  '/pricing', '/plans',
  '/blog', '/news', '/press',
  '/careers', '/jobs', // job listing pages (not the apply link itself)
  '/faq', '/help', '/support',
  '/home', '/',
  '/companies',
];

const NAV_TEXT_REGEX = /\b(about us|contact us|home|pricing|our team|our story|browse jobs|view all jobs|back to jobs|back to search|create job alert|share this job|report this job|follow company|bookmark)\b/i;

const APPLY_TEXT_REGEX = /\b(apply|apply now|apply for this job|apply on company (website|site)|apply on (employer|company) site|apply externally|apply directly|start application|submit application|continue to (application|employer|company)|proceed to application|apply with resume|apply online|go to application|sign in to (easy )?apply|log in to (easy )?apply|login to (easy )?apply|sign up to (easy )?apply|register to (easy )?apply|create account to (easy )?apply|join to (easy )?apply|join now to apply)\b/i;

const AGGREGATOR_REDIRECT_URL_REGEX = /(externalApply|\/apply-redirect|\/rc\/clk|\/job\/apply|apply-link-offsite|\/jobs\/view\/apply)/i;
const APPLICATION_INDICATOR_REGEX = /(\/apply|\/application|\/jobs\/apply|\/careers\/apply|\/job-application|\/job\/apply)/i;
const REDIRECT_PARAM_NAMES = ['url', 'redirect_url', 'redirect', 'dest', 'destination', 'to', 'continue', 'next', 'target', 'link', 'href'];

// ─── Redirect URL Extraction ──────────────────────────────────────────────────

/**
 * Attempts to extract a real destination URL from common redirect query parameters.
 * e.g. https://builtin.com/redirect?url=https://boards.greenhouse.io/acme/jobs/123
 */
export function extractRedirectDestination(href: string): string | null {
  try {
    const parsed = new URL(href);
    for (const param of REDIRECT_PARAM_NAMES) {
      const val = parsed.searchParams.get(param);
      if (val && (val.startsWith('http://') || val.startsWith('https://'))) {
        return val;
      }
    }
  } catch {
    // Not a valid URL
  }
  return null;
}

export function normalizeUrl(rawUrl: string): string {
  try {
    const u = new URL(rawUrl);
    const hostname = u.hostname.toLowerCase().replace(/^www\./, '');
    let pathname = u.pathname.replace(/\/+$/, '') || '/';
    const searchParams = new URLSearchParams();
    u.searchParams.forEach((value, key) => {
      if (!key.startsWith('utm_') && key !== 'ref' && key !== 'trk') {
        searchParams.append(key, value);
      }
    });
    const search = searchParams.toString();
    return `${u.protocol}//${hostname}${pathname}${search ? '?' + search : ''}`;
  } catch {
    return rawUrl.trim().toLowerCase().replace(/\/+$/, '');
  }
}

function getHostname(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
}

function getPathname(url: string): string {
  try {
    return new URL(url).pathname.toLowerCase();
  } catch {
    return url.toLowerCase();
  }
}

function isKnownATSDomain(url: string): boolean {
  const hostname = getHostname(url);
  return KNOWN_ATS_DOMAINS.some(d => hostname === d || hostname.endsWith(`.${d}`));
}

export function isAggregatorDomain(url: string): boolean {
  const hostname = getHostname(url);
  return AGGREGATOR_DOMAINS.some(d => hostname === d || hostname.endsWith(`.${d}`));
}

function isSocialDomain(url: string): boolean {
  const href = url.toLowerCase();
  return SOCIAL_DOMAINS.some(d => href.includes(d));
}

/**
 * Extracts destination URL from an inline onclick handler string.
 * Supports window.open('...'), location.href = '...', etc.
 */
export function extractUrlFromOnclick(onclick: string): string | null {
  if (!onclick) return null;
  const match = onclick.match(/(?:window\.open|location\.href|location\.assign|window\.location)\s*\(\s*['"]([^'"]+)['"]/i)
    || onclick.match(/(?:location\.href|window\.location)\s*=\s*['"]([^'"]+)['"]/i);
  if (match && match[1] && (match[1].startsWith('http://') || match[1].startsWith('https://') || match[1].startsWith('/'))) {
    return match[1];
  }
  return null;
}

// ─── Candidate Classifier ─────────────────────────────────────────────────────

/**
 * Classifies a single candidate element (link or button) found on a job board page or modal.
 * Returns the classification, whether it's accepted, the reason, and the resolved href.
 */
export function classifyCandidate(
  info: Pick<CandidateInfo, 'text' | 'href' | 'ariaLabel' | 'title' | 'dataTracking' | 'className' | 'id' | 'tagName' | 'role'> & Partial<Pick<CandidateInfo, 'dataUrl' | 'onclick'>>,
  sourceBoardUrl: string
): ClassificationResult {
  let rawHref = (info.href || '').trim();
  if (!rawHref || rawHref === '#' || rawHref.startsWith('javascript:')) {
    if (info.dataUrl && info.dataUrl.trim()) {
      rawHref = info.dataUrl.trim();
    } else if (info.onclick) {
      const onclickUrl = extractUrlFromOnclick(info.onclick);
      if (onclickUrl) rawHref = onclickUrl;
    }
  }

  const text = (info.text || '').trim();
  const allText = `${text} ${info.ariaLabel || ''} ${info.title || ''}`.trim();
  const allAttrs = `${info.dataTracking || ''} ${info.className || ''} ${info.id || ''}`.toLowerCase();

  // Attempt to resolve redirect params first
  const redirectDest = rawHref ? extractRedirectDestination(rawHref) : null;
  const resolvedHref = redirectDest || rawHref;
  const pathname = getPathname(resolvedHref);

  // ── 1. Legal links ────────────────────────────────────────────────────────
  if (LEGAL_PATHS.some(p => pathname === p || pathname.startsWith(`${p}/`)) || LEGAL_TEXT_REGEX.test(allText)) {
    return { classification: CandidateClassification.LEGAL_LINK, accepted: false, reason: 'Matches known legal/privacy policy path or text', resolvedHref };
  }

  // ── 2. Auth / signup gates (reject general login links, but allow "Sign In to Apply" action buttons) ───
  const isApplyAuthAction = APPLY_AUTH_TEXT_REGEX.test(allText);
  if (!isApplyAuthAction && (AUTH_PATHS.some(p => pathname.startsWith(p)) || AUTH_TEXT_REGEX.test(allText))) {
    return { classification: CandidateClassification.AUTH_LINK, accepted: false, reason: 'Matches auth/signup path or text', resolvedHref };
  }

  // ── 3. Social media ───────────────────────────────────────────────────────
  if (resolvedHref && isSocialDomain(resolvedHref)) {
    return { classification: CandidateClassification.SOCIAL_LINK, accepted: false, reason: 'Matches social media domain', resolvedHref };
  }

  // ── 4. Direct ATS link ────────────────────────────────────────────────────
  if (resolvedHref && isKnownATSDomain(resolvedHref)) {
    return { classification: CandidateClassification.DIRECT_ATS_LINK, accepted: true, reason: 'Points to known ATS domain', resolvedHref };
  }

  // ── 5. Aggregator redirect URL pattern ────────────────────────────────────
  if (resolvedHref && AGGREGATOR_REDIRECT_URL_REGEX.test(resolvedHref)) {
    return { classification: CandidateClassification.AGGREGATOR_REDIRECT, accepted: true, reason: 'Matches aggregator external apply redirect pattern', resolvedHref };
  }

  // ── 6. Navigation links ───────────────────────────────────────────────────
  if (NAV_PATHS.some(p => pathname === p || pathname.startsWith(`${p}/`)) || NAV_TEXT_REGEX.test(allText)) {
    return { classification: CandidateClassification.NAV_LINK, accepted: false, reason: 'Matches navigation page path or text', resolvedHref };
  }

  // ── 7. Application action buttons (with or without extractable URL) ──────
  if (APPLY_TEXT_REGEX.test(allText) || /apply/i.test(allAttrs)) {
    // If it has an external href pointing away from the job board, it's an APPLICATION_LINK
    if (resolvedHref && !isAggregatorDomain(resolvedHref) && resolvedHref.startsWith('http')) {
      return { classification: CandidateClassification.APPLICATION_LINK, accepted: true, reason: 'External link with apply-context text', resolvedHref };
    }
    // If it has an aggregator redirect URL
    if (resolvedHref && AGGREGATOR_REDIRECT_URL_REGEX.test(resolvedHref)) {
      return { classification: CandidateClassification.AGGREGATOR_REDIRECT, accepted: true, reason: 'Apply action with redirect URL', resolvedHref };
    }
    // Otherwise it's an action button (will click to trigger navigation if no direct URL exists)
    return { classification: CandidateClassification.APPLICATION_ACTION_BUTTON, accepted: true, reason: 'Apply-context button — will click to trigger navigation if direct URL not found', resolvedHref };
  }

  // ── 8. Continue to application buttons ───────────────────────────────────
  const continueApplyRegex = /\b(continue to (application|employer|company|apply)|proceed to application|go to application|take me to application)\b/i;
  if (continueApplyRegex.test(allText)) {
    if (resolvedHref && !isAggregatorDomain(resolvedHref) && resolvedHref.startsWith('http')) {
      return { classification: CandidateClassification.APPLICATION_LINK, accepted: true, reason: 'Continue link with external application URL', resolvedHref };
    }
    return { classification: CandidateClassification.MODAL_CONTINUE_BUTTON, accepted: true, reason: 'Application-context continue/proceed button', resolvedHref };
  }

  // ── 9. External link with application path indicators ────────────────────
  if (resolvedHref && !isAggregatorDomain(resolvedHref) && APPLICATION_INDICATOR_REGEX.test(pathname)) {
    return { classification: CandidateClassification.APPLICATION_LINK, accepted: true, reason: 'External URL with application path indicator', resolvedHref };
  }

  // ── 10. Same-domain job board link (not useful) ───────────────────────────
  if (resolvedHref && isAggregatorDomain(resolvedHref)) {
    const sourceDomain = getHostname(sourceBoardUrl);
    const destDomain = getHostname(resolvedHref);
    if (sourceDomain === destDomain) {
      return { classification: CandidateClassification.NAV_LINK, accepted: false, reason: `Same-domain link on job board (${destDomain})`, resolvedHref };
    }
  }

  return { classification: CandidateClassification.UNKNOWN, accepted: false, reason: 'Could not determine purpose of this element', resolvedHref };
}

// ─── Destination Validator ────────────────────────────────────────────────────

/**
 * Validates whether a resolved URL is a legitimate application destination.
 * Used as a gate before running ATS detection.
 */
export function isLegitimateApplicationDestination(
  targetUrl: string,
  sourceBoardUrl: string
): { valid: boolean; reason: string } {
  if (!targetUrl || (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://'))) {
    return { valid: false, reason: 'Not a valid absolute URL' };
  }

  const pathname = getPathname(targetUrl);
  const targetHostname = getHostname(targetUrl);
  const sourceHostname = getHostname(sourceBoardUrl);

  // Reject legal/nav/auth paths
  if (LEGAL_PATHS.some(p => pathname === p || pathname.startsWith(`${p}/`))) {
    return { valid: false, reason: `URL path matches known legal/navigation page (${pathname})` };
  }
  if (AUTH_PATHS.some(p => pathname.startsWith(p))) {
    return { valid: false, reason: `URL path matches auth/login page (${pathname})` };
  }
  if (isSocialDomain(targetUrl)) {
    return { valid: false, reason: 'URL points to a social media profile' };
  }

  // Reject raw API endpoints (e.g. /api/jobs/..., /graphql) that are not web pages
  if (pathname.startsWith('/api/') || pathname.startsWith('/graphql') || targetHostname.startsWith('api.')) {
    if (!isKnownATSDomain(targetUrl)) {
      return { valid: false, reason: `URL points to an internal API endpoint (${pathname}) rather than a web page` };
    }
  }

  // Reject same-domain URLs when starting from an aggregator (unless it's an explicit redirect endpoint)
  const isSourceAggregator = isAggregatorDomain(sourceBoardUrl);
  const isTargetAggregator = isAggregatorDomain(targetUrl);

  if (isSourceAggregator || isTargetAggregator) {
    if (targetHostname === sourceHostname || targetHostname.endsWith(`.${sourceHostname}`)) {
      if (!AGGREGATOR_REDIRECT_URL_REGEX.test(targetUrl)) {
        return { valid: false, reason: `Same domain as job board (${targetHostname}) and not a recognized apply redirect` };
      }
    }
  }

  // Accept known ATS domains immediately
  if (isKnownATSDomain(targetUrl)) {
    return { valid: true, reason: `Recognized ATS domain (${targetHostname})` };
  }

  // Accept external application URLs
  if (APPLICATION_INDICATOR_REGEX.test(pathname)) {
    return { valid: true, reason: `External URL with application path indicator (${pathname})` };
  }

  // Accept any external non-aggregator domain — could be a company careers portal
  if (!isAggregatorDomain(targetUrl)) {
    return { valid: true, reason: `External company domain (${targetHostname})` };
  }

  return { valid: false, reason: `Could not confirm this URL is a legitimate application destination` };
}

const APPLICATION_JSON_KEYS = [
  'howToApply', 'how_to_apply', 'howToApplyUrl', 'how_to_apply_url',
  'applyUrl', 'apply_url', 'applicationUrl', 'application_url',
  'externalUrl', 'external_url', 'redirectUrl', 'redirect_url',
  'externalApplyUrl', 'external_apply_url', 'companyApplyUrl', 'company_apply_url',
  'jobApplyUrl', 'job_apply_url', 'jobApplicationUrl', 'job_application_url',
  'targetUrl', 'target_url', 'destUrl', 'dest_url', 'applyLink', 'apply_link',
];

/**
 * Attempts to extract an application URL from a JSON string or parsed object.
 * Performs deep recursive scanning across nested objects and schema graphs (e.g. JobPosting).
 */
export function extractApplicationUrlFromJson(bodyOrObj: string | any): string | null {
  try {
    const data = typeof bodyOrObj === 'string' ? JSON.parse(bodyOrObj) : bodyOrObj;
    if (!data || typeof data !== 'object') return null;

    const searchObj = (obj: any, depth = 0): string | null => {
      if (!obj || typeof obj !== 'object' || depth > 5) return null;

      // 1. Check known application keys
      for (const key of APPLICATION_JSON_KEYS) {
        const val = obj[key];
        if (typeof val === 'string' && (val.startsWith('http://') || val.startsWith('https://'))) {
          return unescapeUrl(val);
        }
      }

      // 2. Check schema.org JobPosting entities
      if (obj['@type'] === 'JobPosting') {
        if (typeof obj.url === 'string' && (obj.url.startsWith('http://') || obj.url.startsWith('https://')) && !isAggregatorDomain(obj.url)) {
          return unescapeUrl(obj.url);
        }
        if (typeof obj.sameAs === 'string' && (obj.sameAs.startsWith('http://') || obj.sameAs.startsWith('https://')) && !isAggregatorDomain(obj.sameAs)) {
          return unescapeUrl(obj.sameAs);
        }
        if (typeof obj.isBasedOn === 'string' && (obj.isBasedOn.startsWith('http://') || obj.isBasedOn.startsWith('https://'))) {
          return unescapeUrl(obj.isBasedOn);
        }
      }

      // 3. Search children
      if (Array.isArray(obj)) {
        for (const item of obj) {
          const res = searchObj(item, depth + 1);
          if (res) return res;
        }
      } else {
        for (const k of Object.keys(obj)) {
          if (typeof obj[k] === 'object' && obj[k] !== null) {
            const res = searchObj(obj[k], depth + 1);
            if (res) return res;
          }
        }
      }
      return null;
    };

    return searchObj(data);
  } catch {
    // Not valid JSON
  }
  return null;
}

export function unescapeUrl(rawUrl: string): string {
  return rawUrl
    .replace(/\\u0026/g, '&')
    .replace(/\\u002F/g, '/')
    .replace(/\\u003A/g, ':')
    .replace(/\\u003F/g, '?')
    .replace(/\\u003D/g, '=')
    .replace(/\\/g, '')
    .trim();
}

/**
 * Extracts candidate application destination URLs embedded inside <script> tags or raw HTML,
 * including BuiltIn jobPostInit, Next.js / Nuxt data payloads, and common job board variables.
 */
export function extractEmbeddedScriptUrls(scriptContents: string[]): string[] {
  const foundUrls: string[] = [];

  const SCRIPT_URL_PATTERNS = [
    /["']howToApply["']\s*:\s*["']([^"']+)["']/gi,
    /["']how_to_apply["']\s*:\s*["']([^"']+)["']/gi,
    /["']applyUrl["']\s*:\s*["']([^"']+)["']/gi,
    /["']apply_url["']\s*:\s*["']([^"']+)["']/gi,
    /["']applicationUrl["']\s*:\s*["']([^"']+)["']/gi,
    /["']externalApplyUrl["']\s*:\s*["']([^"']+)["']/gi,
    /["']external_apply_url["']\s*:\s*["']([^"']+)["']/gi,
    /["']companyApplyUrl["']\s*:\s*["']([^"']+)["']/gi,
    /["']jobApplyUrl["']\s*:\s*["']([^"']+)["']/gi,
    /Builtin\.jobPostInit\s*\(\s*({[\s\S]*?})\s*\)/gi,
  ];

  for (const script of scriptContents) {
    if (!script) continue;

    // 1. Check for JSON parseable scripts (e.g. Next.js / JSON-LD / Nuxt data)
    try {
      const parsed = JSON.parse(script);
      const urlFromJson = extractApplicationUrlFromJson(parsed);
      if (urlFromJson && !foundUrls.includes(urlFromJson)) {
        foundUrls.push(urlFromJson);
      }
    } catch {
      // Not pure JSON, proceed to regex scanning
    }

    // 2. Specific regex patterns
    for (const pattern of SCRIPT_URL_PATTERNS) {
      pattern.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(script)) !== null) {
        const raw = match[1];
        if (!raw) continue;

        // If match was the BuiltIn init object
        if (raw.startsWith('{')) {
          try {
            const parsedObj = JSON.parse(raw);
            const extracted = extractApplicationUrlFromJson(parsedObj);
            if (extracted && !foundUrls.includes(extracted)) {
              foundUrls.push(extracted);
            }
          } catch {
            // Regex inside the object
            const innerMatch = raw.match(/["']howToApply["']\s*:\s*["']([^"']+)["']/i);
            if (innerMatch && innerMatch[1]) {
              const unescaped = unescapeUrl(innerMatch[1]);
              if (unescaped.startsWith('http') && !foundUrls.includes(unescaped)) {
                foundUrls.push(unescaped);
              }
            }
          }
          continue;
        }

        const unescaped = unescapeUrl(raw);
        if ((unescaped.startsWith('http://') || unescaped.startsWith('https://')) && !foundUrls.includes(unescaped)) {
          foundUrls.push(unescaped);
        }
      }
    }
  }

  return foundUrls;
}

