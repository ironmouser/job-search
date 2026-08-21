/**
 * worker/src/generic-agent/page-analyzer.ts
 *
 * GenericPageAnalyzer — inspects unknown employer portals using multi-signal analysis:
 * DOM structure, semantic reasoning, metadata, form detection, security/auth gates,
 * and application control candidate ranking.
 */

import { Frame, Page } from 'playwright';
import {
  ApplicationControlCandidate,
  ConfidenceTier,
  FormPresenceInfo,
  PageAnalysisResult,
  PageClassification,
  PageMetadataInfo,
  SecurityBlockerInfo,
} from './types';
import { ExecutionLogger } from '../execution-logger';
import { normalizeUrl } from '../utils/destination-validator';

const POSITIVE_APPLY_TEXT_REGEX = /\b(apply|apply now|apply for this job|apply on company site|apply directly|start application|begin application|submit application|continue to application|proceed to application|apply with resume|apply online|go to application|sign in to (easy )?apply|log in to (easy )?apply|login to (easy )?apply|sign up to (easy )?apply|register to (easy )?apply|create account to (easy )?apply|join to (easy )?apply|join now to apply)\b/i;

const NEGATIVE_TEXT_REGEX = /\b(apply (filter|filters|coupon|promo|code|discount|search|changes|settings|preferences|sort|tags)|clear filters|reset filters|save search|subscribe|job alerts?)\b/i;

const AUTH_TEXT_REGEX = /\b(sign in|log in|login|sign up|signup|create account|register|already have an account)\b/i;

const SECURITY_CAPTCHA_SELECTORS = [
  'iframe[src*="recaptcha" i]',
  'iframe[src*="hcaptcha" i]',
  'iframe[src*="turnstile" i]',
  'iframe[src*="arkoselabs" i]',
  'iframe[src*="funcaptcha" i]',
  '.g-recaptcha',
  '.h-captcha',
  '.cf-turnstile',
  '#captcha',
  '[data-sitekey]',
  '[id*="captcha" i]',
];

export class GenericPageAnalyzer {
  /**
   * Main entry point to perform complete multi-signal page analysis.
   */
  static async analyze(
    page: Page,
    logger?: ExecutionLogger
  ): Promise<PageAnalysisResult> {
    const currentUrl = page.url() || '';
    const reasons: string[] = [];

    // 1. Check Security and Auth Boundaries
    const securityBlocker = await this.detectSecurityBlocker(page);
    if (securityBlocker) {
      reasons.push(`Security/Auth boundary detected: ${securityBlocker.type} (${securityBlocker.reason})`);
      let classification = PageClassification.UNKNOWN;
      if (securityBlocker.type === 'CAPTCHA') classification = PageClassification.CAPTCHA_CHALLENGE;
      else if (securityBlocker.type === 'BOT_CHALLENGE') classification = PageClassification.BOT_CHALLENGE;
      else if (securityBlocker.type === 'AUTHENTICATION_REQUIRED') classification = PageClassification.AUTHENTICATION_REQUIRED;

      return {
        url: currentUrl,
        classification,
        confidence: 95,
        pageMetadata: await this.extractPageMetadata(page),
        formPresence: {
          hasForm: false,
          inputCount: 0,
          hasResumeUpload: false,
          hasCoverLetterUpload: false,
          hasEmailInput: false,
          hasNameInput: false,
          hasSubmitButton: false,
          hasWizardNextButton: false,
          frameContextsCount: page.frames().length,
        },
        securityBlocker,
        candidates: [],
        reasons,
      };
    }

    // 2. Extract Metadata & Schema.org JSON-LD
    const pageMetadata = await this.extractPageMetadata(page);

    // 3. Inspect Form & Input Presence
    const formPresence = await this.inspectFormPresence(page);

    // 4. Discover & Rank Application Controls
    const candidates = await this.discoverAndRankControls(page, currentUrl);
    const bestControl = candidates.length > 0 ? candidates[0] : undefined;

    // 5. Determine Overall Page Classification
    let classification = PageClassification.UNKNOWN;
    let confidence = 50;

    // Check if it's already an active application form
    if (formPresence.hasForm || (formPresence.hasResumeUpload && formPresence.inputCount >= 2) || (formPresence.hasEmailInput && formPresence.inputCount >= 3)) {
      classification = PageClassification.APPLICATION_FORM;
      confidence = formPresence.hasResumeUpload ? 90 : 80;
      reasons.push(`Application form detected: ${formPresence.inputCount} input(s), resume upload: ${formPresence.hasResumeUpload}`);
    } else if (formPresence.hasWizardNextButton && formPresence.inputCount >= 1) {
      classification = PageClassification.APPLICATION_CONTINUATION;
      confidence = 85;
      reasons.push('Wizard step detected with next/continue button');
    } else if (bestControl && bestControl.confidence >= 70) {
      const hasHeading = await page.evaluate(() => !!document.querySelector('h1, .job-title, .job-description, [class*="job" i]')).catch(() => false);
      if (pageMetadata.hasJobPostingSchema || currentUrl.toLowerCase().includes('/job') || currentUrl.toLowerCase().includes('/career') || hasHeading) {
        classification = PageClassification.JOB_DETAIL_PAGE;
        confidence = bestControl.confidence;
        reasons.push(`Job detail page detected with candidate apply control: "${bestControl.text}" (${bestControl.confidence}%)`);
      } else {
        classification = PageClassification.APPLICATION_START_PAGE;
        confidence = bestControl.confidence;
        reasons.push(`Application start page detected with control: "${bestControl.text}" (${bestControl.confidence}%)`);
      }
    } else if (candidates.length > 0 && bestControl && bestControl.confidence >= 40) {
      classification = PageClassification.JOB_DETAIL_PAGE;
      confidence = bestControl.confidence;
      reasons.push(`Candidate control found with moderate confidence: "${bestControl.text}" (${bestControl.confidence}%)`);
    } else {
      classification = PageClassification.UNSUPPORTED_PAGE;
      confidence = 30;
      reasons.push('No credible application controls or forms identified on page');
    }

    return {
      url: currentUrl,
      classification,
      confidence,
      pageMetadata,
      formPresence,
      candidates,
      bestControl,
      reasons,
    };
  }

  /**
   * Checks for security boundaries, bot challenges, and mandatory login walls.
   */
  static async detectSecurityBlocker(page: Page): Promise<SecurityBlockerInfo | null> {
    const pageTitle = (await page.title().catch(() => '')) || '';
    const currentUrl = (page.url() || '').toLowerCase();

    const domCheck = await page.evaluate(() => {
      const pageText = document.body?.innerText || '';
      
      const captchaSelectors = [
        'iframe[src*="recaptcha"]',
        'iframe[src*="hcaptcha"]',
        'iframe[src*="turnstile"]',
        'iframe[src*="arkoselabs"]',
        'iframe[src*="funcaptcha"]',
        '.g-recaptcha',
        '.h-captcha',
        '.cf-turnstile',
        '#captcha',
        '[data-sitekey]',
        '[id*="captcha"]',
      ];

      for (const sel of captchaSelectors) {
        if (document.querySelector(sel)) {
          return { type: 'CAPTCHA' as const, reason: `CAPTCHA element found (${sel})`, keyword: sel };
        }
      }

      if (/\b(solve the puzzle|verify you are human|complete the security check|enter the characters you see)\b/i.test(pageText)) {
        return { type: 'CAPTCHA' as const, reason: 'Human verification challenge text detected in page content', keyword: 'verify you are human' };
      }

      // Check for mandatory login wall (no guest apply)
      const hasPassword = !!document.querySelector('input[type="password"], [data-automation-id*="password" i], input[name*="password" i]');
      const hasEmailOrUserInput = !!document.querySelector('input[type="email"], input[name*="email" i], input[name*="user" i], input[name*="login" i], [data-automation-id*="email" i]');
      let hasSignInHeader = false;
      document.querySelectorAll('h1, h2, h3').forEach(h => {
        if (/sign in to apply|log in to apply|create account to apply/i.test(h.textContent || '')) {
          hasSignInHeader = true;
        }
      });

      let hasGuest = false;
      document.querySelectorAll('button, a').forEach(el => {
        if (/apply as guest|continue as guest|apply without account/i.test(el.textContent || '')) {
          hasGuest = true;
        }
      });

      // Actual authentication gate requires active credential inputs (password or email field on screen)
      if ((hasPassword || (hasSignInHeader && hasEmailOrUserInput)) && !hasGuest) {
        return { type: 'AUTHENTICATION_REQUIRED' as const, reason: 'Employer portal requires authentication / login with no guest option', keyword: 'password' };
      }

      return null;
    }).catch(() => null);

    if (domCheck) {
      return {
        type: domCheck.type,
        reason: domCheck.reason,
        detectedKeywords: [domCheck.keyword],
      };
    }

    // Bot / Cloudflare challenge detection via title / url / text
    if (
      pageTitle.toLowerCase().includes('just a moment') ||
      pageTitle.toLowerCase().includes('attention required') ||
      pageTitle.toLowerCase().includes('security check')
    ) {
      return {
        type: 'BOT_CHALLENGE',
        reason: 'Cloudflare / DDoS protection bot challenge detected',
        detectedKeywords: [pageTitle],
      };
    }

    return null;
  }

  /**
   * Extracts Schema.org and standard metadata from page.
   */
  static async extractPageMetadata(page: Page): Promise<PageMetadataInfo> {
    const url = page.url() || '';
    const title = (await page.title().catch(() => '')) || '';

    const metadata = await page.evaluate(() => {
      const description = (document.querySelector('meta[name="description"]') as HTMLMetaElement)?.content || '';
      const canonical = (document.querySelector('link[rel="canonical"]') as HTMLLinkElement)?.href || undefined;

      let hasSchema = false;
      let schemaTitle: string | undefined;
      let schemaUrl: string | undefined;

      const scripts = document.querySelectorAll('script[type="application/ld+json"]');
      for (const s of Array.from(scripts)) {
        try {
          const data = JSON.parse(s.textContent || '{}');
          if (data['@type'] === 'JobPosting') {
            hasSchema = true;
            schemaTitle = data.title;
            schemaUrl = data.url || data.directApply;
            break;
          }
        } catch {}
      }

      return { description, canonical, hasSchema, schemaTitle, schemaUrl };
    }).catch(() => ({ description: '', canonical: undefined, hasSchema: false, schemaTitle: undefined, schemaUrl: undefined }));

    return {
      url,
      title,
      description: metadata.description,
      hasJobPostingSchema: metadata.hasSchema,
      schemaJobTitle: metadata.schemaTitle,
      schemaApplyUrl: metadata.schemaUrl,
      canonicalUrl: metadata.canonical,
    };
  }

  /**
   * Evaluates form presence, input counts, resume file upload presence, and buttons.
   */
  static async inspectFormPresence(page: Page): Promise<FormPresenceInfo> {
    const presence = await page.evaluate(() => {
      let totalInputs = 0;
      let hasResume = false;
      let hasCL = false;
      let hasEmail = false;
      let hasName = false;
      let hasSubmit = false;
      let hasNext = false;

      const fileInputs = document.querySelectorAll('input[type="file"]');
      if (fileInputs.length > 0) {
        hasResume = true;
        if (fileInputs.length > 1) hasCL = true;
      }

      const emailInputs = document.querySelectorAll('input[type="email"], input[name*="email" i], input[id*="email" i]');
      if (emailInputs.length > 0) hasEmail = true;

      const nameInputs = document.querySelectorAll('input[name*="first" i], input[name*="last" i], input[name*="name" i], input[id*="name" i]');
      if (nameInputs.length > 0) hasName = true;

      const allInputs = document.querySelectorAll('input:not([type="hidden"]), select, textarea');
      totalInputs = allInputs.length;

      const submits = document.querySelectorAll('button[type="submit"], input[type="submit"]');
      if (submits.length > 0) hasSubmit = true;
      else {
        document.querySelectorAll('button, a[role="button"]').forEach(b => {
          const t = (b.textContent || '').trim().toLowerCase();
          if (t.includes('submit') || t.includes('complete application')) hasSubmit = true;
          if (t.includes('next') || t.includes('continue') || t.includes('save and continue')) hasNext = true;
        });
      }

      return {
        totalInputs,
        hasResume,
        hasCL,
        hasEmail,
        hasName,
        hasSubmit,
        hasNext,
      };
    }).catch(() => ({ totalInputs: 0, hasResume: false, hasCL: false, hasEmail: false, hasName: false, hasSubmit: false, hasNext: false }));

    const hasForm = (presence.hasResume && presence.totalInputs >= 2) || (presence.hasEmail && presence.totalInputs >= 3);

    return {
      hasForm,
      inputCount: presence.totalInputs,
      hasResumeUpload: presence.hasResume,
      hasCoverLetterUpload: presence.hasCL,
      hasEmailInput: presence.hasEmail,
      hasNameInput: presence.hasName,
      hasSubmitButton: presence.hasSubmit,
      hasWizardNextButton: presence.hasNext,
      frameContextsCount: page.frames().length,
    };
  }

  /**
   * Scans the page for candidate interactive controls (buttons, links, inputs)
   * and ranks them by application-intent confidence score (0–100).
   */
  static async discoverAndRankControls(
    page: Page,
    currentUrl: string
  ): Promise<ApplicationControlCandidate[]> {
    const rawCandidates = await page.evaluate(() => {
      const results: Array<{
        index: number;
        tagName: string;
        text: string;
        ariaLabel: string;
        role: string;
        href: string | null;
        isButton: boolean;
        isSubmit: boolean;
        isInsideFooter: boolean;
        isInsideNav: boolean;
        isInsideHeader: boolean;
        className: string;
        id: string;
        dataAutomation: string;
      }> = [];

      const elements = Array.from(document.querySelectorAll('button, a, input[type="button"], input[type="submit"], [role="button"]'));

      elements.forEach((el, idx) => {
        const text = (el.textContent || (el as HTMLInputElement).value || '').trim();
        const ariaLabel = el.getAttribute('aria-label') || el.getAttribute('title') || '';
        const role = el.getAttribute('role') || '';
        const tagName = el.tagName.toLowerCase();
        const href = (el as HTMLAnchorElement).href || null;
        const isButton = tagName === 'button' || (tagName === 'input' && ((el as HTMLInputElement).type === 'button' || (el as HTMLInputElement).type === 'submit')) || role === 'button';
        const isSubmit = (el as HTMLButtonElement).type === 'submit' || (el as HTMLInputElement).type === 'submit';

        const isInsideFooter = !!el.closest('footer, .footer, #footer');
        const isInsideNav = !!el.closest('nav, .nav, .navigation, .navbar, #nav, #navigation');
        const isInsideHeader = !!el.closest('header, .header, #header');

        const className = el.className || '';
        const id = el.id || '';
        const dataAutomation = el.getAttribute('data-automation-id') || el.getAttribute('data-testid') || '';

        // Ignore empty elements with no text and no aria-label
        if (!text && !ariaLabel && !dataAutomation && !href) return;

        results.push({
          index: idx,
          tagName,
          text,
          ariaLabel,
          role,
          href,
          isButton,
          isSubmit,
          isInsideFooter,
          isInsideNav,
          isInsideHeader,
          className: typeof className === 'string' ? className : '',
          id,
          dataAutomation,
        });
      });

      return results;
    }).catch(() => []);

    const rankedCandidates: ApplicationControlCandidate[] = [];

    for (let i = 0; i < rawCandidates.length; i++) {
      const c = rawCandidates[i];
      const allText = `${c.text} ${c.ariaLabel} ${c.dataAutomation}`.trim();
      const allAttrs = `${c.className} ${c.id} ${c.dataAutomation}`.toLowerCase();

      // Negative check: Discard obvious non-apply controls
      if (NEGATIVE_TEXT_REGEX.test(allText)) continue;
      if (AUTH_TEXT_REGEX.test(allText) && !/apply/i.test(allText)) continue;

      let score = 0;
      const positiveSignals: string[] = [];
      const negativeSignals: string[] = [];

      // 1. Positive semantic text check
      if (POSITIVE_APPLY_TEXT_REGEX.test(allText)) {
        if (/apply now|start application|begin application|apply for this job|apply directly/i.test(allText)) {
          score += 65;
          positiveSignals.push('text:explicit_apply_action');
        } else {
          score += 45;
          positiveSignals.push('text:contains_apply');
        }
      } else if (/apply/i.test(allText)) {
        score += 35;
        positiveSignals.push('text:apply_keyword');
      } else if (/submit application|submit/i.test(allText) && c.isSubmit) {
        score += 50;
        positiveSignals.push('text:submit_application');
      }

      // 2. Element type signals
      if (c.isButton) {
        score += 15;
        positiveSignals.push('element:button_or_role_button');
      }
      if (c.isSubmit) {
        score += 10;
        positiveSignals.push('element:type_submit');
      }

      // 3. Attr signals (class, id, data-testid, data-automation-id)
      if (/apply|job-action|btn-apply|apply-btn/i.test(allAttrs)) {
        score += 15;
        positiveSignals.push('attr:apply_context');
      }

      // 4. Href signals
      if (c.href) {
        const hrefLower = c.href.toLowerCase();
        if (hrefLower.includes('/apply') || hrefLower.includes('/application') || hrefLower.includes('/job/apply')) {
          score += 20;
          positiveSignals.push('href:application_path');
        }
        if (hrefLower.includes('mailto:') || hrefLower.includes('tel:') || hrefLower.includes('javascript:void(0)')) {
          score -= 30;
          negativeSignals.push('href:non_actionable_scheme');
        }
      }

      // 5. Layout penalties (footer/nav/header)
      if (c.isInsideFooter) {
        score -= 40;
        negativeSignals.push('layout:inside_footer');
      }
      if (c.isInsideNav && !POSITIVE_APPLY_TEXT_REGEX.test(allText)) {
        score -= 30;
        negativeSignals.push('layout:inside_nav');
      }

      // If no positive apply signals were found at all, skip
      if (positiveSignals.length === 0) continue;

      const finalScore = Math.max(0, Math.min(score, 100));
      let confidenceTier: ConfidenceTier = 'LOW';
      if (finalScore >= 75) confidenceTier = 'HIGH';
      else if (finalScore >= 50) confidenceTier = 'MEDIUM';

      rankedCandidates.push({
        index: c.index,
        text: c.text,
        ariaLabel: c.ariaLabel,
        role: c.role,
        tagName: c.tagName,
        href: c.href,
        resolvedHref: c.href,
        confidence: finalScore,
        confidenceTier,
        positiveSignals,
        negativeSignals,
        isButton: c.isButton,
        isVisible: true,
        isEnabled: true,
        isInViewport: true,
      });
    }

    // Sort descending by confidence score
    rankedCandidates.sort((a, b) => b.confidence - a.confidence);

    return rankedCandidates;
  }
}
