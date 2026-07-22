import { ATSPlatform, ATSDetectionResult, WorkflowContext, WorkflowResult, AutoApplyStatus, InterventionReason } from '../types';
import { ATSPlugin, InterventionError } from './base-plugin';
import { BrowserSession } from '../browser-session';
import { ExecutionLogger } from '../execution-logger';
import { pluginRegistry } from '../registry';

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
    await logger.warn('plugin_loaded', 'No known ATS detected — generic fallback active');
    throw new InterventionError(
      InterventionReason.UNEXPECTED_PAGE,
      'This job application uses an ATS platform that is not currently supported by Auto Apply. Please apply manually.',
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
