/**
 * worker/test/obstruction-classifier.test.ts
 *
 * Unit tests for UIObstructionClassifier logic and safety policy matrix.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { UIObstructionClassifier } from '../src/obstruction/classifier';
import { ObstructionType } from '../src/obstruction/types';

describe('UIObstructionClassifier', () => {
  it('classifies empty/null input as NONE', () => {
    const res = UIObstructionClassifier.classify({});
    assert.strictEqual(res.type, ObstructionType.NONE);
    assert.strictEqual(res.isSafeToDismiss, false);
  });

  it('classifies marketing modals correctly as safe to dismiss', () => {
    const res = UIObstructionClassifier.classify({
      blockingElement: {
        tag: 'div',
        role: 'dialog',
        id: 'promo-modal',
        className: 'marketing-modal-wrapper',
        text: 'Join our talent community and stay connected with our team! Exclusive opportunities await.',
        zIndex: 9999,
        position: 'fixed',
        opacity: 1,
        pointerEvents: 'auto',
        ariaModal: true,
        isDialog: true,
        isInViewport: true,
        boundingBox: { x: 100, y: 100, width: 400, height: 300 },
      },
    });

    assert.strictEqual(res.type, ObstructionType.MARKETING_MODAL);
    assert.strictEqual(res.isSafeToDismiss, true);
    assert.strictEqual(UIObstructionClassifier.isSafe(res.type), true);
  });

  it('classifies newsletter subscription popups correctly as safe to dismiss', () => {
    const res = UIObstructionClassifier.classify({
      blockingElement: {
        tag: 'div',
        role: null,
        id: null,
        className: 'newsletter-popup',
        text: 'Subscribe to our newsletter! Enter your email to stay in the loop with weekly updates.',
        zIndex: 5000,
        position: 'fixed',
        opacity: 1,
        pointerEvents: 'auto',
        ariaModal: false,
        isDialog: false,
        isInViewport: true,
        boundingBox: { x: 100, y: 100, width: 400, height: 300 },
      },
    });

    assert.strictEqual(res.type, ObstructionType.NEWSLETTER_MODAL);
    assert.strictEqual(res.isSafeToDismiss, true);
  });

  it('classifies job alert popups correctly as safe to dismiss', () => {
    const res = UIObstructionClassifier.classify({
      blockingElement: {
        tag: 'div',
        role: 'dialog',
        id: 'job-alert-dialog',
        className: 'job-alert-modal',
        text: 'Create a job alert! Notify me of new jobs matching this position.',
        zIndex: 9999,
        position: 'fixed',
        opacity: 1,
        pointerEvents: 'auto',
        ariaModal: true,
        isDialog: true,
        isInViewport: true,
        boundingBox: { x: 100, y: 100, width: 400, height: 300 },
      },
    });

    assert.strictEqual(res.type, ObstructionType.JOB_ALERT_MODAL);
    assert.strictEqual(res.isSafeToDismiss, true);
  });

  it('classifies cookie consent banners correctly as safe to dismiss', () => {
    const res = UIObstructionClassifier.classify({
      blockingElement: {
        tag: 'div',
        role: 'dialog',
        id: 'onetrust-banner-sdk',
        className: 'cookie-banner',
        text: 'We use cookies to enhance your experience. Accept all cookies or manage privacy preferences.',
        zIndex: 2147483647,
        position: 'fixed',
        opacity: 1,
        pointerEvents: 'auto',
        ariaModal: true,
        isDialog: true,
        isInViewport: true,
        boundingBox: { x: 0, y: 500, width: 1200, height: 200 },
      },
    });

    assert.strictEqual(res.type, ObstructionType.COOKIE_BANNER);
    assert.strictEqual(res.isSafeToDismiss, true);
  });

  it('classifies cookie settings messages and preference overlays as safe to dismiss', () => {
    const res = UIObstructionClassifier.classify({
      blockingElement: {
        tag: 'div',
        role: 'dialog',
        id: 'usercentrics-root',
        className: 'consent-manager-overlay',
        text: 'Cookie Settings & Privacy Choices: Select which functional or strictly necessary cookies you allow.',
        zIndex: 99999,
        position: 'fixed',
        opacity: 1,
        pointerEvents: 'auto',
        ariaModal: true,
        isDialog: true,
        isInViewport: true,
        boundingBox: { x: 50, y: 50, width: 500, height: 400 },
      },
    });

    assert.strictEqual(res.type, ObstructionType.COOKIE_BANNER);
    assert.strictEqual(res.isSafeToDismiss, true);
  });

  it('classifies location/region selection prompts as safe to dismiss', () => {
    const res = UIObstructionClassifier.classify({
      blockingElement: {
        tag: 'div',
        role: 'dialog',
        id: 'country-modal',
        className: 'region-selector',
        text: 'Choose your location or country to see local job openings.',
        zIndex: 999,
        position: 'fixed',
        opacity: 1,
        pointerEvents: 'auto',
        ariaModal: true,
        isDialog: true,
        isInViewport: true,
        boundingBox: { x: 100, y: 100, width: 400, height: 300 },
      },
    });

    assert.strictEqual(res.type, ObstructionType.LOCATION_PROMPT);
    assert.strictEqual(res.isSafeToDismiss, true);
  });

  it('classifies generic non-critical dialogs as safe to dismiss', () => {
    const res = UIObstructionClassifier.classify({
      blockingElement: {
        tag: 'dialog',
        role: 'dialog',
        id: 'notice-dialog',
        className: 'info-popup',
        text: 'Important career announcement for prospective applicants.',
        zIndex: 100,
        position: 'fixed',
        opacity: 1,
        pointerEvents: 'auto',
        ariaModal: true,
        isDialog: true,
        isInViewport: true,
        boundingBox: { x: 100, y: 100, width: 400, height: 300 },
      },
    });

    assert.strictEqual(res.type, ObstructionType.NON_CRITICAL_DIALOG);
    assert.strictEqual(res.isSafeToDismiss, true);
  });

  it('classifies CAPTCHA barriers as UNSAFE (never bypass)', () => {
    const res = UIObstructionClassifier.classify({
      blockingElement: {
        tag: 'div',
        role: null,
        id: 'g-recaptcha-response',
        className: 'hcaptcha-box',
        text: 'Please solve the puzzle or complete security verification to proceed.',
        zIndex: 9999,
        position: 'fixed',
        opacity: 1,
        pointerEvents: 'auto',
        ariaModal: false,
        isDialog: false,
        isInViewport: true,
        boundingBox: { x: 100, y: 100, width: 300, height: 200 },
      },
      iframeSources: ['https://www.google.com/recaptcha/api2/anchor'],
    });

    assert.strictEqual(res.type, ObstructionType.CAPTCHA);
    assert.strictEqual(res.isSafeToDismiss, false);
    assert.strictEqual(UIObstructionClassifier.isSafe(res.type), false);
  });

  it('classifies bot/Cloudflare challenges as UNSAFE (never bypass)', () => {
    const res = UIObstructionClassifier.classify({
      blockingElement: {
        tag: 'div',
        role: null,
        id: 'cf-challenge',
        className: 'cf-wrapper',
        text: 'Verifying you are human. Checking your browser before accessing the site. DDoS protection by Cloudflare.',
        zIndex: 9999,
        position: 'fixed',
        opacity: 1,
        pointerEvents: 'auto',
        ariaModal: false,
        isDialog: false,
        isInViewport: true,
        boundingBox: { x: 0, y: 0, width: 800, height: 600 },
      },
    });

    assert.strictEqual(res.type, ObstructionType.BOT_CHALLENGE);
    assert.strictEqual(res.isSafeToDismiss, false);
    assert.strictEqual(UIObstructionClassifier.isSafe(res.type), false);
  });

  it('classifies login/authentication gates as UNSAFE (do not bypass)', () => {
    const res = UIObstructionClassifier.classify({
      blockingElement: {
        tag: 'div',
        role: 'dialog',
        id: 'login-modal',
        className: 'auth-modal',
        text: 'Sign in to continue. Enter your password or create an account to apply for this job.',
        zIndex: 9999,
        position: 'fixed',
        opacity: 1,
        pointerEvents: 'auto',
        ariaModal: true,
        isDialog: true,
        isInViewport: true,
        boundingBox: { x: 100, y: 100, width: 400, height: 300 },
      },
    });

    assert.strictEqual(res.type, ObstructionType.LOGIN_MODAL);
    assert.strictEqual(res.isSafeToDismiss, false);
    assert.strictEqual(UIObstructionClassifier.isSafe(res.type), false);
  });

  it('classifies unknown fixed overlays as UNSAFE unknown overlays', () => {
    const res = UIObstructionClassifier.classify({
      blockingElement: {
        tag: 'div',
        role: null,
        id: 'custom-unnamed-overlay',
        className: 'layer-mask',
        text: 'random unclassified content without dialog semantics',
        zIndex: 100,
        position: 'fixed',
        opacity: 0.8,
        pointerEvents: 'auto',
        ariaModal: false,
        isDialog: false,
        isInViewport: true,
        boundingBox: { x: 0, y: 0, width: 1000, height: 800 },
      },
    });

    assert.strictEqual(res.type, ObstructionType.UNKNOWN_OVERLAY);
    assert.strictEqual(res.isSafeToDismiss, false);
  });

  it('classifies application onboarding / resume choice modals as APPLICATION_FLOW_MODAL (must not dismiss via X/Escape)', () => {
    const res = UIObstructionClassifier.classify({
      blockingElement: {
        tag: 'div',
        role: 'dialog',
        id: 'start-app-modal',
        className: 'modal-dialog focus-modal',
        text: 'Start your application\nI have a resume >\nI need a resume >',
        zIndex: 9999,
        position: 'fixed',
        opacity: 1,
        pointerEvents: 'auto',
        ariaModal: true,
        isDialog: true,
        isInViewport: true,
        boundingBox: { x: 200, y: 200, width: 400, height: 250 },
      },
    });

    assert.strictEqual(res.type, ObstructionType.APPLICATION_FLOW_MODAL);
    assert.strictEqual(res.isSafeToDismiss, false);
    assert.strictEqual(UIObstructionClassifier.isSafe(res.type), false);
  });

  it('classifies Dice-style cookie and privacy dialog as safe to dismiss even when page contains login links', () => {
    const res = UIObstructionClassifier.classify({
      blockingElement: {
        tag: 'div',
        role: 'dialog',
        id: 'privacy-consent-box',
        className: 'privacy-banner',
        text: 'Your privacy is important to us! We use cookies and other tracking technologies on our site, through which Dice and other third parties may collect information about your visit. By clicking Accept All you agree to our use of these technologies. Cookie settings Reject all Accept all',
        zIndex: 99999,
        position: 'fixed',
        opacity: 1,
        pointerEvents: 'auto',
        ariaModal: true,
        isDialog: true,
        isInViewport: true,
        boundingBox: { x: 100, y: 400, width: 450, height: 250 },
      },
      pageText: 'To see how well you match this job, please log in or create an account. Sign in to apply.',
    });

    assert.strictEqual(res.type, ObstructionType.COOKIE_BANNER);
    assert.strictEqual(res.isSafeToDismiss, true);
    assert.strictEqual(UIObstructionClassifier.isSafe(res.type), true);
  });
});
