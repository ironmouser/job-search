import { ATSPlatform, ATSDetectionResult, WorkflowContext, WorkflowResult, AutoApplyStatus, InterventionReason } from '../types';
import { ATSPlugin, InterventionError } from './base-plugin';
import { BrowserSession } from '../browser-session';
import { ExecutionLogger } from '../execution-logger';
import { pluginRegistry } from '../registry';

/** Lever ATS plugin stub — detection functional, automation pending. */
export class LeverPlugin extends ATSPlugin {
  readonly platform = ATSPlatform.LEVER;
  readonly displayName = 'Lever';

  detect(url: string, html: string, redirectChain: string[]): ATSDetectionResult {
    let confidence = 0;
    const detectedFeatures: string[] = [];
    const allUrls = [url, ...redirectChain];

    for (const u of allUrls) {
      try {
        const hostname = new URL(u).hostname;
        if (hostname === 'jobs.lever.co' || hostname.endsWith('.lever.co')) {
          confidence += 85;
          detectedFeatures.push('hostname:lever.co');
          break;
        }
      } catch {}
    }

    if (html.includes('postings-group') || html.includes('posting-page')) {
      confidence += 10;
      detectedFeatures.push('html:.postings-group');
    }
    if (html.includes('lever-co.js') || html.toLowerCase().includes('lever')) {
      confidence += 5;
      detectedFeatures.push('js:lever-co.js');
    }

    return { platform: ATSPlatform.LEVER, confidence: Math.min(confidence, 100), detectedFeatures, automationSupported: false };
  }

  async prepare(browser: BrowserSession, context: WorkflowContext, logger: ExecutionLogger): Promise<void> {
    await logger.info('plugin_loaded', 'Lever plugin active — stub implementation');
    throw new InterventionError(InterventionReason.UNEXPECTED_PAGE, 'Lever automation is not yet implemented. Please apply manually.', context.jobUrl);
  }

  async apply(_b: BrowserSession, _c: WorkflowContext, _l: ExecutionLogger): Promise<void> {}

  async validate(_b: BrowserSession, _c: WorkflowContext, _l: ExecutionLogger): Promise<{ valid: boolean; issues: string[] }> {
    return { valid: false, issues: ['Lever automation not yet implemented'] };
  }

  async finalize(_b: BrowserSession, _c: WorkflowContext, _l: ExecutionLogger): Promise<WorkflowResult> {
    return { status: AutoApplyStatus.SKIPPED, canComplete: false, platform: ATSPlatform.LEVER, automationConfidence: 0, stepsCompleted: 0, stepsRemaining: 0, blockingIssue: 'Lever automation not yet implemented', estimatedSubmissionTime: null };
  }
}

pluginRegistry.register(new LeverPlugin());
