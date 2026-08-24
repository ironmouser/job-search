/**
 * src/lib/email/verification-parser.ts
 *
 * Extracts account activation URLs, verification links, and OTP codes
 * from incoming automated emails sent by ATS portals (Workday, Taleo,
 * SuccessFactors, SmartRecruiters, iCIMS, Greenhouse, etc.).
 */

export interface ParsedVerificationEmail {
  urls: string[];
  primaryUrl: string | null;
  otp: string | null;
  token: string | null;
  atsPlatformGuess?: string;
}

// Known activation link regex patterns across ATS platforms
const ACTIVATION_URL_PATTERNS = [
  // Workday account activation & password set
  /https?:\/\/[a-z0-9.-]*myworkdayjobs\.com\/[^\s"'<>)]*(?:activate|verify|token|confirm|reset|auth)[^\s"'<>)]*/gi,
  /https?:\/\/[a-z0-9.-]*workday\.com\/[^\s"'<>)]*(?:activate|verify|token|confirm)[^\s"'<>)]*/gi,
  // Taleo account verification
  /https?:\/\/[a-z0-9.-]*taleo\.net\/[^\s"'<>)]*(?:activate|verify|token|confirm|userRegistration)[^\s"'<>)]*/gi,
  /https?:\/\/[a-z0-9.-]*oraclecloud\.com\/[^\s"'<>)]*(?:activate|verify|confirm|hcmUI)[^\s"'<>)]*/gi,
  // SAP SuccessFactors
  /https?:\/\/[a-z0-9.-]*successfactors\.com\/[^\s"'<>)]*(?:activate|verify|token|confirm)[^\s"'<>)]*/gi,
  // SmartRecruiters
  /https?:\/\/[a-z0-9.-]*smartrecruiters\.com\/[^\s"'<>)]*(?:activate|verify|token|confirm)[^\s"'<>)]*/gi,
  // iCIMS
  /https?:\/\/[a-z0-9.-]*icims\.com\/[^\s"'<>)]*(?:activate|verify|token|confirm)[^\s"'<>)]*/gi,
  // Greenhouse / Lever / Ashby candidate portals
  /https?:\/\/[a-z0-9.-]*(?:greenhouse|lever|ashby|workable)[^\s"'<>)]*(?:verify|confirm|token|activate)[^\s"'<>)]*/gi,
  // Generic activation / verify URLs
  /https?:\/\/[^\s"'<>]+\/(?:verify|verification|activate|activation|confirm|confirmation|auth\/callback)[^\s"'<>]*/gi,
  /https?:\/\/[^\s"'<>]+[?&](?:token|code|verification_token|auth_token|activation_code)=[a-zA-Z0-9_-]+/gi,
];

// OTP Extraction Patterns
const OTP_PATTERNS = [
  /(?:verification|security|confirmation|one-time|login|auth|pin|access)\s*(?:code|pin|password|number)?\s*(?:is|:)?\s*["':]?\s*([0-9]{4,8})\b/i,
  /\bcode\s*[:=]\s*([0-9]{4,8})\b/i,
  /\benter\s*([0-9]{4,8})\s*to\s*(?:verify|confirm|continue)/i,
  /\b([0-9]{3}-[0-9]{3})\b/, // E.g. 123-456
  /\b([0-9]{6})\b/,           // Standard 6-digit standalone code
];

/**
 * Extracts verification URLs from email text and HTML.
 */
export function extractVerificationUrls(text: string, html?: string): string[] {
  const combined = `${text}\n${html || ''}`;
  const found = new Set<string>();

  for (const pattern of ACTIVATION_URL_PATTERNS) {
    const matches = combined.match(pattern);
    if (matches) {
      for (const match of matches) {
        // Clean trailing punctuation
        const cleaned = match.replace(/[.,;)]+$/, '');
        try {
          const parsed = new URL(cleaned);
          // Avoid generic homepages or tracking pixels
          if (parsed.pathname.length > 1 || parsed.search.length > 1) {
            found.add(cleaned);
          }
        } catch {
          // Invalid URL format
        }
      }
    }
  }

  // Also check HTML href attributes if provided
  if (html) {
    const hrefRegex = /href=["'](https?:\/\/[^"']+)["']/gi;
    let match: RegExpExecArray | null;
    while ((match = hrefRegex.exec(html)) !== null) {
      const urlStr = match[1];
      const lower = urlStr.toLowerCase();
      if (
        lower.includes('verify') ||
        lower.includes('activate') ||
        lower.includes('confirm') ||
        lower.includes('token') ||
        lower.includes('candidate')
      ) {
        found.add(urlStr);
      }
    }
  }

  return Array.from(found);
}

/**
 * Extracts numeric or alphanumeric OTP codes from email content.
 */
export function extractOtpCode(text: string, html?: string): string | null {
  const combined = `${text}\n${html ? html.replace(/<[^>]+>/g, ' ') : ''}`;

  for (const pattern of OTP_PATTERNS) {
    const match = combined.match(pattern);
    if (match && match[1]) {
      const code = match[1].replace('-', '').trim();
      // Ensure it's not a year (1990-2030) or zip code unless explicitly matching OTP pattern
      if (/^\d{4,8}$/.test(code)) {
        return code;
      }
    }
  }

  return null;
}

/**
 * Parse an incoming email payload into structured verification data.
 */
export function parseVerificationEmail(payload: {
  subject?: string;
  text?: string;
  html?: string;
}): ParsedVerificationEmail {
  const text = payload.text || '';
  const html = payload.html || '';
  const subject = payload.subject || '';

  const urls = extractVerificationUrls(`${subject}\n${text}`, html);
  const otp = extractOtpCode(`${subject}\n${text}`, html);

  // Guess ATS platform
  let atsPlatformGuess: string | undefined;
  const lowerAll = `${subject} ${text} ${html}`.toLowerCase();
  if (lowerAll.includes('myworkdayjobs') || lowerAll.includes('workday')) {
    atsPlatformGuess = 'workday';
  } else if (lowerAll.includes('taleo') || lowerAll.includes('oraclecloud')) {
    atsPlatformGuess = 'taleo';
  } else if (lowerAll.includes('successfactors')) {
    atsPlatformGuess = 'successfactors';
  } else if (lowerAll.includes('smartrecruiters')) {
    atsPlatformGuess = 'smartrecruiters';
  } else if (lowerAll.includes('icims')) {
    atsPlatformGuess = 'icims';
  }

  return {
    urls,
    primaryUrl: urls[0] || null,
    otp,
    token: urls[0] ? extractTokenParam(urls[0]) : null,
    atsPlatformGuess,
  };
}

function extractTokenParam(urlStr: string): string | null {
  try {
    const url = new URL(urlStr);
    return (
      url.searchParams.get('token') ||
      url.searchParams.get('code') ||
      url.searchParams.get('verification_token') ||
      url.searchParams.get('activation_code') ||
      null
    );
  } catch {
    return null;
  }
}
