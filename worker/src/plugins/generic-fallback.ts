import {
  ATSPlatform,
  ATSDetectionResult,
  WorkflowContext,
  WorkflowResult,
  AutoApplyStatus,
  InterventionReason,
} from '../types';
import { ATSPlugin, InterventionError } from './base-plugin';
import { BrowserSession } from '../browser-session';
import { ExecutionLogger } from '../execution-logger';
import { pluginRegistry } from '../registry';
import { detectJobClosed } from '../utils/job-status-detector';
import { GenericApplicationAgent, GenericFormFiller } from '../generic-agent';

/**
 * GenericFallbackPlugin — operates on unknown ATS platforms and custom employer career portals.
 *
 * Detection: returns a baseline confidence score of 10 for UNKNOWN platform.
 *
 * Behavior: activates the Generic Application Agent to analyze page semantics, find application controls,
 * safely handle UI obstructions, advance through application steps, and fill application forms.
 */
export class GenericFallbackPlugin extends ATSPlugin {
  readonly platform = ATSPlatform.UNKNOWN;
  readonly displayName = 'Unknown ATS / Custom Portal';

  private readonly agent = new GenericApplicationAgent();
  private readonly formFiller = new GenericFormFiller();

  detect(_url: string, _html: string, _redirectChain: string[]): ATSDetectionResult {
    // Always returns a low-confidence match — acts as the catch-all
    return {
      platform: ATSPlatform.UNKNOWN,
      confidence: 10,
      detectedFeatures: ['fallback:no-known-ats-detected'],
      automationSupported: true,
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

    await logger.info('plugin_loaded', 'No specialized ATS adapter selected — Activating Generic Application Agent');

    // Initiate application transition via Generic Application Agent
    await this.agent.initiateApplication(browser, context, logger);
  }

  async apply(browser: BrowserSession, context: WorkflowContext, logger: ExecutionLogger): Promise<void> {
    await this.formFiller.fillForm(browser, context, logger);
  }

  async validate(browser: BrowserSession, context: WorkflowContext, logger: ExecutionLogger): Promise<{ valid: boolean; issues: string[] }> {
    return this.formFiller.validateForm(browser, context, logger);
  }

  async finalize(browser: BrowserSession, context: WorkflowContext, logger: ExecutionLogger): Promise<WorkflowResult> {
    return this.formFiller.finalize(browser, context, logger);
  }
}

pluginRegistry.register(new GenericFallbackPlugin());
