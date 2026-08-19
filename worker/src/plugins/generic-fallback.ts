import { ATSPlatform, ATSDetectionResult, WorkflowContext, WorkflowResult, AutoApplyStatus, InterventionReason } from '../types';
import { ATSPlugin, InterventionError } from './base-plugin';
import { BrowserSession } from '../browser-session';
import { ExecutionLogger } from '../execution-logger';
import { pluginRegistry } from '../registry';
import { detectJobClosed } from '../utils/job-status-detector';

/**
 * GenericFallbackPlugin — catches any platform not identified by other plugins.
 *
 * Detection: always returns a low confidence score of 10 for UNKNOWN platform.
 * This ensures the registry always returns a match, even for unrecognized platforms.
 *
 * Behavior: immediately signals for human intervention rather than attempting automation.
 */
export class GenericFallbackPlugin extends ATSPlugin {
  readonly platform = ATSPlatform.UNKNOWN;
  readonly displayName = 'Unknown ATS';

  detect(_url: string, _html: string, _redirectChain: string[]): ATSDetectionResult {
    // Always returns a low-confidence match — acts as the catch-all
    return {
      platform: ATSPlatform.UNKNOWN,
      confidence: 10,
      detectedFeatures: ['fallback:no-known-ats-detected'],
      automationSupported: false,
    };
  }

  async prepare(browser: BrowserSession, context: WorkflowContext, logger: ExecutionLogger): Promise<void> {
    const closedCheck = await detectJobClosed(browser, logger);
    if (closedCheck.isClosed) {
      throw new InterventionError(
        InterventionReason.JOB_CLOSED,
        closedCheck.reason || 'This position is no longer accepting applications or has been closed by the employer.',
        browser.page.url() || context.jobUrl
      );
    }

    const currentUrl = (browser.page.url() || context.jobUrl || '').toLowerCase();
    if (
      currentUrl.includes('linkedin.com/signup') ||
      currentUrl.includes('linkedin.com/checkpoint') ||
      currentUrl.includes('linkedin.com/jobs/view') ||
      currentUrl.includes('linkedin.com/uas')
    ) {
      throw new InterventionError(
        InterventionReason.LOGIN_REQUIRED,
        'This role uses LinkedIn "Easy Apply" which requires signing into your personal LinkedIn account. Please click the link to apply directly with your profile.',
        browser.page.url() || context.jobUrl
      );
    }

    if (
      currentUrl.includes('indeed.com/auth') ||
      currentUrl.includes('indeed.com/account') ||
      currentUrl.includes('indeed.com/viewjob')
    ) {
      throw new InterventionError(
        InterventionReason.LOGIN_REQUIRED,
        'This role uses Indeed "Apply" which requires signing into your personal Indeed account. Please click the link to apply directly with your profile.',
        browser.page.url() || context.jobUrl
      );
    }

    await logger.warn('plugin_loaded', 'No known ATS detected — generic fallback active');
    throw new InterventionError(
      InterventionReason.UNEXPECTED_PAGE,
      'This application uses a custom careers portal that Auto Apply does not currently support. Please apply manually using the link above.',
      context.jobUrl
    );
  }

  async apply(_b: BrowserSession, _c: WorkflowContext, _l: ExecutionLogger): Promise<void> {}

  async validate(_b: BrowserSession, _c: WorkflowContext, _l: ExecutionLogger): Promise<{ valid: boolean; issues: string[] }> {
    return { valid: false, issues: ['Unknown ATS — cannot automate'] };
  }

  async finalize(_b: BrowserSession, _c: WorkflowContext, _l: ExecutionLogger): Promise<WorkflowResult> {
    return {
      status: AutoApplyStatus.SKIPPED,
      canComplete: false,
      platform: ATSPlatform.UNKNOWN,
      automationConfidence: 0,
      stepsCompleted: 0,
      stepsRemaining: 0,
      blockingIssue: 'Unknown ATS platform — automation not supported',
      estimatedSubmissionTime: null,
    };
  }
}

pluginRegistry.register(new GenericFallbackPlugin());
