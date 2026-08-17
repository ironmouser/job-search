import { BrowserSession } from '../browser-session';
import { ExecutionLogger } from '../execution-logger';

export interface JobClosedDetectionResult {
  isClosed: boolean;
  reason: string;
  matchedText?: string;
}

// High-confidence patterns safe for banners, alerts, and HTML fallback
const STRICT_CLOSED_PATTERNS: RegExp[] = [
  /no longer accepting applications/i,
  /no longer accepting submissions/i,
  /no longer open for applications/i,
  /not accepting applications at this time/i,
  /we are no longer accepting applications/i,
  /applications are (?:now )?closed/i,
  /applications for this (?:position|role|job) are (?:now )?closed/i,
  /this (?:position|role|job|opening|posting|vacancy|listing|requisition) (?:is|has been) (?:no longer available|closed|filled|expired|archived|paused|removed|cancelled)/i,
  /this (?:position|role|job|opening|posting|vacancy|listing|requisition) is no longer (?:accepting applications|active|open|available)/i,
  /the (?:job|position|role|posting) you are (?:looking for|trying to view) (?:has closed|is no longer available|has expired|is no longer active)/i,
  /the job posting you are looking for has closed or expired/i,
  /the job you selected is no longer open for applications/i,
  /job (?:posting|listing) has expired/i,
  /posting has expired/i,
  /position (?:has been )?filled/i,
  /role (?:has been )?filled/i,
  /vacancy (?:closed|expired)/i,
  /sorry,\s*(?:this\s*)?(?:job|position|role|opening)\s*(?:is no longer available|has expired|is no longer open|is closed)/i,
  /this publication is closed/i,
  /this opening has been closed/i,
  /this job is no longer open/i,
];

// Short standalone badge/chip patterns (matched against trimmed text in dedicated status elements)
const STANDALONE_BADGE_PATTERNS: RegExp[] = [
  /^\s*(?:this\s+)?(?:position|job|listing|role|vacancy|posting|requisition)\s+(?:is\s+)?closed\s*$/i,
  /^\s*closed\s*$/i,
  /^\s*expired\s*$/i,
  /^\s*filled\s*$/i,
  /^\s*position filled\s*$/i,
  /^\s*job closed\s*$/i,
  /^\s*position closed\s*$/i,
];

/**
 * Detects if the current web page indicates that the job posting has closed,
 * expired, been filled, paused, or is no longer accepting applications.
 */
export async function detectJobClosed(
  browser: BrowserSession,
  logger?: ExecutionLogger
): Promise<JobClosedDetectionResult> {
  const page = browser.page;
  if (!page) {
    return { isClosed: false, reason: '' };
  }

  try {
    // 1. Evaluate DOM elements (banners, alerts, status chips, headings, error containers)
    const domDetection = await page.evaluate(() => {
      const bannerSnippets: string[] = [];
      const badgeSnippets: string[] = [];

      // Dedicated status/badge elements
      const badgeSelectors = [
        '[class*="closed"]',
        '[class*="status"]',
        '[class*="badge"]',
        '[class*="chip"]',
        '[class*="tag"]',
        '.artdeco-inline-feedback',
        '.jobs-details__top-card',
      ];

      for (const sel of badgeSelectors) {
        try {
          const els = document.querySelectorAll(sel);
          els.forEach(el => {
            const text = ((el as HTMLElement).innerText || el.textContent || '').trim();
            if (text && text.length < 100) {
              badgeSnippets.push(text);
            }
          });
        } catch {}
      }

      // General alert/banner elements
      const highSignalSelectors = [
        '[class*="closed"]',
        '[class*="alert"]',
        '[class*="banner"]',
        '[class*="warning"]',
        '[class*="error"]',
        '[role="alert"]',
        '[role="status"]',
        'header',
        'h1', 'h2', 'h3',
        '.posting-header',
        '.job-header',
      ];

      for (const sel of highSignalSelectors) {
        try {
          const els = document.querySelectorAll(sel);
          els.forEach(el => {
            const text = ((el as HTMLElement).innerText || el.textContent || '').trim();
            if (text && text.length < 500) {
              bannerSnippets.push(text);
            }
          });
        } catch {}
      }

      return { bannerSnippets, badgeSnippets };
    }).catch(() => ({ bannerSnippets: [] as string[], badgeSnippets: [] as string[] }));

    // Check standalone badge elements
    for (const text of domDetection.badgeSnippets) {
      for (const pattern of STANDALONE_BADGE_PATTERNS) {
        if (pattern.test(text)) {
          if (logger) {
            await logger.warn('job_closed_detected_badge', `Detected closed job badge: "${text}"`);
          }
          return {
            isClosed: true,
            reason: `This job is no longer accepting applications (${text}).`,
            matchedText: text,
          };
        }
      }
    }

    // Check banner elements with strict patterns
    for (const text of domDetection.bannerSnippets) {
      for (const pattern of STRICT_CLOSED_PATTERNS) {
        const match = text.match(pattern);
        if (match) {
          const matchedText = match[0];
          if (logger) {
            await logger.warn('job_closed_detected', `Detected closed job posting: "${matchedText}"`);
          }
          return {
            isClosed: true,
            reason: `This job is no longer accepting applications (${matchedText}).`,
            matchedText,
          };
        }
      }
    }

    // 2. Fallback to raw page HTML scan with strict patterns
    const html = await browser.getHtml().catch(() => '');
    if (html) {
      for (const pattern of STRICT_CLOSED_PATTERNS) {
        const match = html.match(pattern);
        if (match) {
          const matchedText = match[0];
          if (logger) {
            await logger.warn('job_closed_detected_html', `Detected closed job status in HTML: "${matchedText}"`);
          }
          return {
            isClosed: true,
            reason: `This job is no longer accepting applications (${matchedText}).`,
            matchedText,
          };
        }
      }
    }

    return { isClosed: false, reason: '' };
  } catch (err: any) {
    if (logger) {
      await logger.warn('job_status_check_error', `Could not evaluate job closed status: ${err.message}`);
    }
    return { isClosed: false, reason: '' };
  }
}
