import { BrowserSession } from '../browser-session';
import { ExecutionLogger } from '../execution-logger';

export interface JobClosedDetectionResult {
  isClosed: boolean;
  reason: string;
  matchedText?: string;
}

// High-confidence patterns safe for page text, banners, alerts, and HTML fallback
const STRICT_CLOSED_PATTERNS: RegExp[] = [
  /no longer accepting (?:applications|submissions|candidates|resumes)/i,
  /no longer open for applications/i,
  /not accepting applications at this time/i,
  /not currently accepting applications/i,
  /we are no longer accepting/i,
  /applications are (?:now |currently )?closed/i,
  /applications for this (?:position|role|job|opening) are (?:now |currently )?closed/i,
  /this (?:position|role|job|opening|posting|vacancy|listing|requisition) (?:is|has been) (?:no longer available|closed|filled|expired|archived|paused|removed|cancelled|inactive|ended)/i,
  /this (?:position|role|job|opening|posting|vacancy|listing|requisition) is no longer (?:accepting applications|active|open|available|taking applications)/i,
  /the (?:job|position|role|posting) you are (?:looking for|trying to view) (?:has closed|is no longer available|has expired|is no longer active|is closed)/i,
  /the job posting you are looking for has closed or expired/i,
  /the job you selected is no longer open for applications/i,
  /job (?:posting|listing) has expired/i,
  /posting has expired/i,
  /listing has expired/i,
  /position (?:has been )?filled/i,
  /role (?:has been )?filled/i,
  /job (?:has been )?filled/i,
  /vacancy (?:closed|expired|filled)/i,
  /sorry,\s*(?:this\s*)?(?:job|position|role|opening)\s*(?:is no longer available|has expired|is no longer open|is closed)/i,
  /this publication is closed/i,
  /this opening has been closed/i,
  /this job is no longer open/i,
  /this job is closed/i,
  /this position is closed/i,
  /this role is closed/i,
  /application deadline has passed/i,
  /deadline for applications has passed/i,
  /submissions are closed/i,
  /this job has been archived/i,
  /job is inactive/i,
  /this posting is inactive/i,
  /this listing is inactive/i,
  /the (?:job|page|opening|position) you are (?:looking for|trying to view) (?:does not exist|cannot be found|could not be found)/i,
  /the job posting you are looking for does not exist/i,
  /this job is no longer accepting responses/i,
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
  /^\s*no longer available\s*$/i,
  /^\s*no longer accepting applications\s*$/i,
  /^\s*applications closed\s*$/i,
  /^\s*inactive\s*$/i,
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
    // Check URL parameters (e.g. ?error=true on Greenhouse boards or /job-closed)
    const currentUrl = page.url() || '';
    if (/[?&]error=true/i.test(currentUrl) || /[?&]job_closed=true/i.test(currentUrl)) {
      if (logger) {
        await logger.warn('job_closed_detected_url', `Detected error/closed query param in URL: "${currentUrl}"`);
      }
      return {
        isClosed: true,
        reason: 'This job is no longer available or the listing has expired.',
        matchedText: currentUrl,
      };
    }

    // 1. Evaluate DOM elements & clean innerText directly from the browser context
    const domDetection = await page.evaluate(() => {
      const docTitle = document.title || '';
      const bodyText = document.body ? (document.body.innerText || document.body.textContent || '') : '';
      
      const badgeSnippets: string[] = [];
      const bannerSnippets: string[] = [];

      // Dedicated status/badge elements
      const badgeSelectors = [
        '[class*="closed"]',
        '[class*="status"]',
        '[class*="badge"]',
        '[class*="chip"]',
        '[class*="tag"]',
        '[data-test*="closed"]',
        '[data-testid*="closed"]',
        '.artdeco-inline-feedback',
        '.artdeco-inline-feedback__message',
        '.jobs-details__top-card',
        '.jobs-box__html-content',
        'figcaption',
      ];

      for (const sel of badgeSelectors) {
        try {
          const els = document.querySelectorAll(sel);
          els.forEach(el => {
            const text = ((el as HTMLElement).innerText || el.textContent || '').trim();
            if (text && text.length < 300) {
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
        '[class*="notice"]',
        '[class*="message"]',
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
            if (text && text.length < 1000) {
              bannerSnippets.push(text);
            }
          });
        } catch {}
      }

      return { docTitle, bodyText, badgeSnippets, bannerSnippets };
    }).catch(() => ({ docTitle: '', bodyText: '', badgeSnippets: [] as string[], bannerSnippets: [] as string[] }));

    // Check document title (e.g. "Job Closed - Company")
    if (domDetection.docTitle) {
      for (const pattern of STRICT_CLOSED_PATTERNS) {
        const match = domDetection.docTitle.match(pattern);
        if (match) {
          const matchedText = match[0];
          if (logger) {
            await logger.warn('job_closed_detected_title', `Detected closed job status in title: "${matchedText}"`);
          }
          return {
            isClosed: true,
            reason: `This job is no longer accepting applications (${matchedText}).`,
            matchedText,
          };
        }
      }
    }

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

    // Check banner/alert elements with strict patterns
    for (const text of domDetection.bannerSnippets) {
      for (const pattern of STRICT_CLOSED_PATTERNS) {
        const match = text.match(pattern);
        if (match) {
          const matchedText = match[0];
          if (logger) {
            await logger.warn('job_closed_detected_banner', `Detected closed job posting banner: "${matchedText}"`);
          }
          return {
            isClosed: true,
            reason: `This job is no longer accepting applications (${matchedText}).`,
            matchedText,
          };
        }
      }
    }

    // Check full visible rendered page text (document.body.innerText)
    if (domDetection.bodyText) {
      for (const pattern of STRICT_CLOSED_PATTERNS) {
        const match = domDetection.bodyText.match(pattern);
        if (match) {
          const matchedText = match[0];
          if (logger) {
            await logger.warn('job_closed_detected_body', `Detected closed job status in body text: "${matchedText}"`);
          }
          return {
            isClosed: true,
            reason: `This job is no longer accepting applications (${matchedText}).`,
            matchedText,
          };
        }
      }
    }

    // Note: We intentionally do NOT scan raw unrendered HTML (page source)
    // because modern SPAs (Phenom, Workday, Greenhouse, etc.) embed error message
    // templates and localization dictionaries in <script> tags and JSON bundles,
    // which would cause false positives for closed jobs.
    // The checks above on document.title, badgeSnippets, bannerSnippets, and
    // document.body.innerText already capture all visible rendered content.

    return { isClosed: false, reason: '' };
  } catch (err: any) {
    if (logger) {
      await logger.warn('job_status_check_error', `Could not evaluate job closed status: ${err.message}`);
    }
    return { isClosed: false, reason: '' };
  }
}
