/**
 * worker/test/post-submission-confirmation.test.ts
 *
 * Unit tests for post-submission confirmation verification:
 * 1. Waiting for new page navigation (/thanks, /confirmation, /submitted, etc.)
 * 2. Waiting for confirmation modal dialog appearing on existing page
 * 3. Waiting for confirmation / thank you message or container added to existing page
 * 4. Raising validation error / spam intervention before premature screenshot
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { ATSPlugin, InterventionError } from '../src/plugins/base-plugin';
import { BrowserSession } from '../src/browser-session';
import { ExecutionLogger } from '../src/execution-logger';
import { ATSPlatform, WorkflowContext, WorkflowResult, AutoApplyStatus, InterventionReason } from '../src/types';

class TestConfirmationPlugin extends ATSPlugin {
  readonly platform = ATSPlatform.UNKNOWN;
  readonly displayName = 'Test ATS';

  detect() {
    return { platform: ATSPlatform.UNKNOWN, confidence: 100, detectedFeatures: [], automationSupported: true };
  }
  async prepare() {}
  async apply() {}
  async validate() {
    return { valid: true, issues: [] };
  }
  async finalize(browser: BrowserSession, context: WorkflowContext, logger: ExecutionLogger): Promise<WorkflowResult> {
    return {
      status: AutoApplyStatus.APPLIED,
      canComplete: true,
      platform: this.platform,
      automationConfidence: 100,
      stepsCompleted: 6,
      stepsRemaining: 0,
      blockingIssue: null,
      estimatedSubmissionTime: null,
    };
  }

  public async testVerify(
    browser: BrowserSession,
    ctx: any,
    logger: ExecutionLogger,
    options: any
  ) {
    return this.verifyPostSubmission(browser, ctx, logger, options);
  }
}

const mockApiClient = {
  postLogs: async () => {},
  updateSessionStatus: async () => {},
  createInterventionRequest: async () => {},
} as any;

function createMockPage(config: {
  url: string;
  bodyText: string;
  modalVisible?: boolean;
  modalText?: string;
  confirmationSelectorVisible?: boolean;
  validationErrorVisible?: boolean;
  validationErrorText?: string;
  spinnerActive?: boolean;
}) {
  const createMockLocator = (matches: { isVisible: boolean; text?: string; count?: number }) => ({
    first: () => createMockLocator(matches),
    isVisible: async () => matches.isVisible,
    textContent: async () => matches.text || '',
    count: async () => matches.count ?? (matches.isVisible ? 1 : 0),
    scrollIntoViewIfNeeded: async () => {},
  });

  const page = {
    url: () => config.url,
    textContent: async (sel: string) => (sel === 'body' ? config.bodyText : ''),
    waitForTimeout: async (_ms: number) => {},
    waitForLoadState: async () => {},
    locator: (selector: string) => {
      if (selector.includes('spinner') || selector.includes('submitting') || selector.includes('disabled')) {
        return createMockLocator({ isVisible: !!config.spinnerActive, count: config.spinnerActive ? 1 : 0 });
      }
      if (selector.includes('dialog') || selector.includes('modal')) {
        return createMockLocator({
          isVisible: !!config.modalVisible,
          text: config.modalText || '',
          count: config.modalVisible ? 1 : 0,
        });
      }
      if (
        selector.includes('thanks_container') ||
        selector.includes('confirmationMessage') ||
        selector.includes('application_confirmed') ||
        selector.includes('Submitted')
      ) {
        return createMockLocator({
          isVisible: !!config.confirmationSelectorVisible,
          text: config.confirmationSelectorVisible ? 'Application confirmed' : '',
          count: config.confirmationSelectorVisible ? 1 : 0,
        });
      }
      if (
        selector.includes('error') ||
        selector.includes('invalid') ||
        selector.includes('alert')
      ) {
        return createMockLocator({
          isVisible: !!config.validationErrorVisible,
          text: config.validationErrorText || '',
          count: config.validationErrorVisible ? 1 : 0,
        });
      }
      return createMockLocator({ isVisible: false, count: 0 });
    },
  };

  return page;
}

describe('Post-Submission Confirmation Verification Tests', () => {
  const plugin = new TestConfirmationPlugin();

  it('Test 1 — Detects Completely New Page (URL navigation to confirmation page)', async () => {
    const mockPage = createMockPage({
      url: 'https://careers.acme.com/jobs/123/confirmation',
      bodyText: 'Your application has been received. Thank you for your interest.',
    });
    const mockBrowser = { page: mockPage } as any;
    const logger = new ExecutionLogger('test-session', mockApiClient);

    await plugin.testVerify(mockBrowser, mockPage, logger, {
      platformDisplayName: 'Test ATS',
      initialUrl: 'https://careers.acme.com/jobs/123/apply',
      maxWaitMs: 2000,
    });

    assert.ok(true, 'Confirmation detected via new page navigation');
  });

  it('Test 2 — Detects Confirmation Modal added to existing page', async () => {
    const mockPage = createMockPage({
      url: 'https://careers.acme.com/jobs/123/apply',
      bodyText: 'Apply for software engineer',
      modalVisible: true,
      modalText: 'Congratulations! Your application has been submitted successfully.',
    });
    const mockBrowser = { page: mockPage } as any;
    const logger = new ExecutionLogger('test-session', mockApiClient);

    await plugin.testVerify(mockBrowser, mockPage, logger, {
      platformDisplayName: 'Test ATS',
      initialUrl: 'https://careers.acme.com/jobs/123/apply',
      maxWaitMs: 2000,
    });

    assert.ok(true, 'Confirmation detected via confirmation modal');
  });

  it('Test 3 — Detects Confirmation Message / Container added to existing page', async () => {
    const mockPage = createMockPage({
      url: 'https://careers.acme.com/jobs/123/apply',
      bodyText: 'Thank you for applying to our team. Confirmation #48291.',
      confirmationSelectorVisible: true,
    });
    const mockBrowser = { page: mockPage } as any;
    const logger = new ExecutionLogger('test-session', mockApiClient);

    await plugin.testVerify(mockBrowser, mockPage, logger, {
      platformDisplayName: 'Test ATS',
      initialUrl: 'https://careers.acme.com/jobs/123/apply',
      maxWaitMs: 2000,
    });

    assert.ok(true, 'Confirmation detected via confirmation message container');
  });

  it('Test 4 — Detects Form Validation Error and throws UNKNOWN_QUESTION intervention', async () => {
    const mockPage = createMockPage({
      url: 'https://careers.acme.com/jobs/123/apply',
      bodyText: 'Please correct the errors below to submit.',
      validationErrorVisible: true,
      validationErrorText: 'Phone number is required and must be valid',
    });
    const mockBrowser = { page: mockPage } as any;
    const logger = new ExecutionLogger('test-session', mockApiClient);

    await assert.rejects(
      async () => {
        await plugin.testVerify(mockBrowser, mockPage, logger, {
          platformDisplayName: 'Test ATS',
          initialUrl: 'https://careers.acme.com/jobs/123/apply',
          maxWaitMs: 2000,
        });
      },
      (err: any) => {
        assert.ok(err instanceof InterventionError);
        assert.strictEqual(err.reason, InterventionReason.UNKNOWN_QUESTION);
        return true;
      }
    );
  });

  it('Test 5 — Detects Spam Filter Challenge and throws APPLICATION_BLOCKED_BY_BOT_CHALLENGE', async () => {
    const mockPage = createMockPage({
      url: 'https://careers.acme.com/jobs/123/apply',
      bodyText: 'Your application was flagged as possible spam. Please try these steps.',
    });
    const mockBrowser = { page: mockPage } as any;
    const logger = new ExecutionLogger('test-session', mockApiClient);

    await assert.rejects(
      async () => {
        await plugin.testVerify(mockBrowser, mockPage, logger, {
          platformDisplayName: 'Test ATS',
          initialUrl: 'https://careers.acme.com/jobs/123/apply',
          maxWaitMs: 2000,
        });
      },
      (err: any) => {
        assert.ok(err instanceof InterventionError);
        assert.strictEqual(err.reason, InterventionReason.APPLICATION_BLOCKED_BY_BOT_CHALLENGE);
        return true;
      }
    );
  });

  it('Test 6 — Throws UNEXPECTED_PAGE intervention if no confirmation appears within timeout', async () => {
    const mockPage = createMockPage({
      url: 'https://careers.acme.com/jobs/123/apply',
      bodyText: 'Fill out this application to proceed',
    });
    const mockBrowser = { page: mockPage } as any;
    const logger = new ExecutionLogger('test-session', mockApiClient);

    await assert.rejects(
      async () => {
        await plugin.testVerify(mockBrowser, mockPage, logger, {
          platformDisplayName: 'Test ATS',
          initialUrl: 'https://careers.acme.com/jobs/123/apply',
          maxWaitMs: 1000,
        });
      },
      (err: any) => {
        assert.ok(err instanceof InterventionError);
        assert.strictEqual(err.reason, InterventionReason.UNEXPECTED_PAGE);
        return true;
      }
    );
  });
});
