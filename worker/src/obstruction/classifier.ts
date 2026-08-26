/**
 * worker/src/obstruction/classifier.ts
 *
 * UI Obstruction Classifier — classifies detected obstruction elements
 * using multi-signal inspection of text, attributes, ARIA tags, and structural DOM signals.
 * Enforces safe vs unsafe dismissal policies.
 */

import {
  ElementHitTestInfo,
  ObstructionClassification,
  ObstructionType,
} from './types';

export interface ClassifierInput {
  blockingElement?: ElementHitTestInfo | null;
  modalContainer?: ElementHitTestInfo | null;
  pageText?: string;
  hasIframes?: boolean;
  iframeSources?: string[];
}

export class UIObstructionClassifier {
  /**
   * Classifies an obstruction into an ObstructionType and determines
   * whether it is safe to dismiss automatically.
   */
  static classify(input: ClassifierInput): ObstructionClassification {
    const { blockingElement, modalContainer, pageText = '', iframeSources = [] } = input;

    if (!blockingElement && !modalContainer) {
      return {
        type: ObstructionType.NONE,
        isSafeToDismiss: false,
        confidence: 100,
        reason: 'No obstruction element detected',
        detectedKeywords: [],
      };
    }

    const modalText = [
      blockingElement?.text || '',
      modalContainer?.text || '',
      blockingElement?.className || '',
      modalContainer?.className || '',
      blockingElement?.id || '',
      modalContainer?.id || '',
      blockingElement?.role || '',
      modalContainer?.role || '',
    ]
      .join(' ')
      .toLowerCase();

    const combinedText = [
      modalText,
      pageText,
    ]
      .join(' ')
      .toLowerCase();

    const iframeUrls = iframeSources.map((s) => s.toLowerCase()).join(' ');

    // ─── 1. Security & Bot Challenge Patterns (UNSAFE - NEVER BYPASS) ────────
    const captchaKeywords = [
      'recaptcha',
      'g-recaptcha',
      'hcaptcha',
      'cf-turnstile',
      'turnstile',
      'arkoselabs',
      'funcaptcha',
      'geetest',
      'captcha',
      'solve the puzzle',
      'security check',
      'security challenge',
    ];
    const matchedCaptcha = captchaKeywords.filter(
      (kw) => modalText.includes(kw) || iframeUrls.includes(kw) || combinedText.includes(kw)
    );
    if (matchedCaptcha.length > 0) {
      return {
        type: ObstructionType.CAPTCHA,
        isSafeToDismiss: false,
        confidence: 95,
        reason: `Detected CAPTCHA or security verification: ${matchedCaptcha.join(', ')}`,
        detectedKeywords: matchedCaptcha,
      };
    }

    const botKeywords = [
      'verify you are human',
      'verifying you are human',
      'checking your browser',
      'just a moment...',
      'ddos protection by cloudflare',
      'cloudflare challenge',
      'please enable cookies',
      'bot detection',
      'human verification',
      'press and hold',
      'access is temporarily restricted',
      'we detected unusual activity',
      'automated (bot) activity',
      'rapid taps or clicks',
      'use of developer or inspection tools',
    ];
    const matchedBot = botKeywords.filter(
      (kw) => modalText.includes(kw) || iframeUrls.includes(kw) || combinedText.includes(kw)
    );
    if (matchedBot.length > 0) {
      return {
        type: ObstructionType.BOT_CHALLENGE,
        isSafeToDismiss: false,
        confidence: 95,
        reason: `Detected bot challenge or Cloudflare verification: ${matchedBot.join(', ')}`,
        detectedKeywords: matchedBot,
      };
    }

    // ─── 2. Cookie & Privacy Consent Banners & Settings (SAFE TO DISMISS) ───
    // Check modalText and container attributes first so cookie modals are never mistaken for login gates
    const cookieKeywords = [
      'cookie',
      'cookies',
      'cookie policy',
      'cookie settings',
      'cookie preferences',
      'cookie notice',
      'cookie banner',
      'cookie consent',
      'cookie dialog',
      'cookies policy',
      'your privacy is important to us',
      'privacy is important to us',
      'tracking technologies',
      'cookies and other tracking technologies',
      'privacy preferences',
      'privacy settings',
      'privacy choices',
      'your privacy choices',
      'consent preferences',
      'consent settings',
      'consent manager',
      'manage cookies',
      'manage preferences',
      'manage consent',
      'we use cookies',
      'use cookies',
      'accept all cookies',
      'accept cookies',
      'reject all cookies',
      'reject all',
      'reject non-essential',
      'decline all',
      'refuse all',
      'strictly necessary',
      'necessary cookies',
      'functional cookies',
      'essential cookies',
      'onetrust',
      'usercentrics',
      'didomi',
      'quantcast',
      'trustarc',
      'cookiebot',
      'cookie-law-info',
      'osano',
      'ketch',
      'iubenda',
      'termly',
      'complianz',
      'civic',
      'clarip',
    ];
    const matchedCookie = cookieKeywords.filter((kw) => modalText.includes(kw));
    if (matchedCookie.length > 0) {
      return {
        type: ObstructionType.COOKIE_BANNER,
        isSafeToDismiss: true,
        confidence: 95,
        reason: `Detected cookie consent or settings banner: ${matchedCookie.join(', ')}`,
        detectedKeywords: matchedCookie,
      };
    }

    // ─── 3. Authentication & Login Gates (UNSAFE - DO NOT BYPASS) ───────────
    // Check modalText specifically so general page background headers/footers do not misclassify overlays
    const authKeywords = [
      'sign in to apply',
      'log in to apply',
      'sign in to continue',
      'log in to continue',
      'create an account to continue',
      'create an account or sign in to continue',
      'create an account or sign in',
      'sign in or create an account',
      'create an account to apply',
      'create an account or log in',
      'log in or create an account',
      'sign in or register',
      'register or sign in',
      "let's get you hired",
      'let’s get you hired',
      'please enter your email to sign in',
      'enter your email to sign in',
      'enter your email to continue',
      'continue with email',
      'continue with google',
      'continue with apple',
      'login to your account',
      'sign into your account',
      'enter your password',
      'password requirements',
      'verify new password',
      'forgot password',
      'sign in with google',
      'sign in with linkedin',
      'sign in with apple',
      'sign in to easy apply',
      'join now to apply',
      'join to apply',
      'join now',
      'agree & join',
      'sign in or join',
      'conversion-modal-signin',
      'conversion-modal-join',
      'session expired',
      'unauthorized',
    ];
    const matchedAuth = authKeywords.filter((kw) => modalText.includes(kw));
    if (matchedAuth.length > 0) {
      return {
        type: ObstructionType.LOGIN_MODAL,
        isSafeToDismiss: false,
        confidence: 90,
        reason: `Detected candidate login or authentication requirement: ${matchedAuth.join(', ')}`,
        detectedKeywords: matchedAuth,
      };
    }

    // ─── 4. Job Alert Prompts (SAFE TO DISMISS) ──────────────────────────────
    const jobAlertKeywords = [
      'job alert',
      'job alerts',
      'create a job alert',
      'get job alerts',
      'notify me of new jobs',
      'get notified about similar jobs',
      'subscribe to job alerts',
      'set up job alerts',
      'email me jobs like this',
      'receive job alerts',
    ];
    const matchedJobAlert = jobAlertKeywords.filter((kw) => combinedText.includes(kw));
    if (matchedJobAlert.length > 0) {
      return {
        type: ObstructionType.JOB_ALERT_MODAL,
        isSafeToDismiss: true,
        confidence: 90,
        reason: `Detected job alert popup: ${matchedJobAlert.join(', ')}`,
        detectedKeywords: matchedJobAlert,
      };
    }

    // ─── 5. Newsletter & Marketing Popups (SAFE TO DISMISS) ──────────────────
    const newsletterKeywords = [
      'newsletter',
      'subscribe to our newsletter',
      'join our mailing list',
      'join our email list',
      'get our newsletter',
      'sign up for updates',
      'stay in the loop',
      'stay up to date',
      'weekly digest',
      'receive updates',
    ];
    const matchedNewsletter = newsletterKeywords.filter((kw) => combinedText.includes(kw));
    if (matchedNewsletter.length > 0) {
      return {
        type: ObstructionType.NEWSLETTER_MODAL,
        isSafeToDismiss: true,
        confidence: 85,
        reason: `Detected newsletter subscription modal: ${matchedNewsletter.join(', ')}`,
        detectedKeywords: matchedNewsletter,
      };
    }

    const marketingKeywords = [
      'join our talent community',
      'talent community',
      'join our community',
      'join our network',
      'stay connected',
      'download our app',
      'get the app',
      'special offer',
      'save this job',
      'welcome to',
      'don\'t miss out',
      'before you go',
      'exclusive access',
    ];
    const matchedMarketing = marketingKeywords.filter((kw) => combinedText.includes(kw));
    if (matchedMarketing.length > 0) {
      return {
        type: ObstructionType.MARKETING_MODAL,
        isSafeToDismiss: true,
        confidence: 80,
        reason: `Detected marketing/promotional modal: ${matchedMarketing.join(', ')}`,
        detectedKeywords: matchedMarketing,
      };
    }

    // ─── 6. Location / Region Selection (SAFE TO DISMISS) ────────────────────
    const locationKeywords = [
      'select your region',
      'choose your location',
      'select country',
      'choose country',
      'country selector',
      'international site',
      'language preference',
    ];
    const matchedLocation = locationKeywords.filter((kw) => combinedText.includes(kw));
    if (matchedLocation.length > 0) {
      return {
        type: ObstructionType.LOCATION_PROMPT,
        isSafeToDismiss: true,
        confidence: 80,
        reason: `Detected location/region selector prompt: ${matchedLocation.join(', ')}`,
        detectedKeywords: matchedLocation,
      };
    }

    // ─── 7. Application Flow / Resume Choice Dialogs (MUST NOT CLOSE VIA X/ESCAPE) ──
    const appFlowKeywords = [
      'start your application',
      'start my application',
      'start application',
      'i have a resume',
      'i have an updated resume',
      'i need a resume',
      'how would you like to apply',
      'choose how to apply',
      'choose application method',
      'apply with resume',
      'upload resume to apply',
      'do you have a resume',
      'continue with resume',
    ];
    const matchedAppFlow = appFlowKeywords.filter((kw) => combinedText.includes(kw));
    if (matchedAppFlow.length > 0) {
      return {
        type: ObstructionType.APPLICATION_FLOW_MODAL,
        isSafeToDismiss: false,
        confidence: 95,
        reason: `Detected application flow / resume selection dialog: ${matchedAppFlow.join(', ')}`,
        detectedKeywords: matchedAppFlow,
      };
    }

    // ─── 8. Non-Critical Dialogs vs Unknown Overlays ─────────────────────────
    const isDialogStructure =
      blockingElement?.isDialog ||
      modalContainer?.isDialog ||
      blockingElement?.ariaModal ||
      modalContainer?.ariaModal ||
      blockingElement?.role === 'dialog' ||
      modalContainer?.role === 'dialog';

    if (isDialogStructure) {
      return {
        type: ObstructionType.NON_CRITICAL_DIALOG,
        isSafeToDismiss: true,
        confidence: 70,
        reason: 'Detected generic non-critical dialog with standard modal attributes',
        detectedKeywords: ['dialog', 'aria-modal'],
      };
    }

    const isFixedOverlay =
      (blockingElement?.position === 'fixed' || blockingElement?.position === 'absolute') &&
      blockingElement.zIndex >= 10;

    if (isFixedOverlay) {
      return {
        type: ObstructionType.UNKNOWN_OVERLAY,
        isSafeToDismiss: false,
        confidence: 60,
        reason: `Detected unknown fixed overlay (z-index: ${blockingElement?.zIndex}, position: ${blockingElement?.position})`,
        detectedKeywords: ['position:fixed', `z-index:${blockingElement?.zIndex}`],
      };
    }

    return {
      type: ObstructionType.UNKNOWN_MODAL,
      isSafeToDismiss: false,
      confidence: 50,
      reason: 'Detected unclassified modal obstruction',
      detectedKeywords: [],
    };
  }

  /**
   * Helper to determine if an obstruction type is considered safe to dismiss.
   */
  static isSafe(type: ObstructionType): boolean {
    switch (type) {
      case ObstructionType.MARKETING_MODAL:
      case ObstructionType.NEWSLETTER_MODAL:
      case ObstructionType.JOB_ALERT_MODAL:
      case ObstructionType.COOKIE_BANNER:
      case ObstructionType.PRIVACY_BANNER:
      case ObstructionType.LOCATION_PROMPT:
      case ObstructionType.NON_CRITICAL_DIALOG:
        return true;
      case ObstructionType.LOGIN_MODAL:
      case ObstructionType.AUTHENTICATION_REQUIRED:
      case ObstructionType.CAPTCHA:
      case ObstructionType.BOT_CHALLENGE:
      case ObstructionType.SECURITY_CHALLENGE:
      case ObstructionType.UNKNOWN_MODAL:
      case ObstructionType.UNKNOWN_OVERLAY:
      case ObstructionType.NONE:
      default:
        return false;
    }
  }
}
