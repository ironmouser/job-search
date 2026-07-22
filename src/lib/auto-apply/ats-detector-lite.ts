import { ATSPlatform, ATSDetectionResult } from './types';

/**
 * ATSDetectorLite — lightweight, URL-based ATS detection for the Railway API.
 *
 * This runs on Railway (no browser, no Playwright).
 * It uses URL pattern matching against the job URL stored in the database.
 * Results are used in the pre-flight modal to show the detected ATS before
 * the user clicks Auto Apply.
 *
 * For accurate detection (following redirects, inspecting live DOM), the
 * worker uses the full ATSDetector with Playwright.
 */

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
    automationSupported: false,
    hostnamePatterns: [/^boards\.greenhouse\.io$/i, /\.greenhouse\.io$/i],
    urlKeywords: ['greenhouse.io', 'greenhouse', 'gh_jid'],
  },
  {
    platform: ATSPlatform.LEVER,
    automationSupported: false,
    hostnamePatterns: [/^jobs\.lever\.co$/i, /\.lever\.co$/i],
    urlKeywords: ['lever.co', '/lever/'],
  },
  {
    platform: ATSPlatform.ASHBY,
    automationSupported: false,
    hostnamePatterns: [/^jobs\.ashbyhq\.com$/i, /\.ashbyhq\.com$/i],
    urlKeywords: ['ashbyhq.com', 'ashbyhq', '/ashby/'],
  },
  {
    platform: ATSPlatform.SMARTRECRUITERS,
    automationSupported: false,
    hostnamePatterns: [/\.smartrecruiters\.com$/i, /^careers\.smartrecruiters\.com$/i],
    urlKeywords: ['smartrecruiters.com', 'smartrecruiters'],
  },
  {
    platform: ATSPlatform.TALEO,
    automationSupported: false,
    hostnamePatterns: [/\.taleo\.net$/i, /\.taleo\.com$/i],
    urlKeywords: ['taleo.net', 'taleo'],
  },
  {
    platform: ATSPlatform.ICIMS,
    automationSupported: false,
    hostnamePatterns: [/\.icims\.com$/i, /^careers-\w+\.icims\.com$/i],
    urlKeywords: ['icims.com', 'icims'],
  },
];


export function detectATSFromUrl(jobUrl: string): ATSDetectionResult {
  try {
    const parsed = new URL(jobUrl);
    const hostname = parsed.hostname.toLowerCase();
    const fullUrl = jobUrl.toLowerCase();

    for (const rule of DETECTION_RULES) {
      const hostnameMatch = rule.hostnamePatterns.some((p) => p.test(hostname));
      const keywordMatch = rule.urlKeywords.some((kw) => fullUrl.includes(kw));

      if (hostnameMatch || keywordMatch) {
        return {
          platform: rule.platform,
          confidence: hostnameMatch ? 85 : 60,
          detectedFeatures: [
            hostnameMatch ? `hostname:${hostname}` : `url-keyword:match`,
          ],
          automationSupported: rule.automationSupported,
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
