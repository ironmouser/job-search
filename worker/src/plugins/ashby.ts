import { ATSPlatform, ATSDetectionResult, WorkflowContext, WorkflowResult, AutoApplyStatus, InterventionReason } from '../types';
import { ATSPlugin, InterventionError } from './base-plugin';
import { BrowserSession } from '../browser-session';
import { ExecutionLogger } from '../execution-logger';
import { pluginRegistry } from '../registry';

/** Ashby ATS plugin stub — detection functional, automation pending. */
export class AshbyPlugin extends ATSPlugin {
  readonly platform = ATSPlatform.ASHBY;
  readonly displayName = 'Ashby';

  detect(url: string, html: string, redirectChain: string[]): ATSDetectionResult {
    let confidence = 0;
    const detectedFeatures: string[] = [];
    const allUrls = [url, ...redirectChain];

    for (const u of allUrls) {
      try {
        const hostname = new URL(u).hostname;
        if (hostname === 'jobs.ashbyhq.com' || hostname.endsWith('.ashbyhq.com')) {
          confidence += 85;
          detectedFeatures.push('hostname:ashbyhq.com');
          break;
        }
      } catch {}
    }

    if (html.includes('data-ashby-job') || html.includes('ashby-embed')) {
      confidence += 10;
      detectedFeatures.push('html:data-ashby-job');
    }
    if (html.toLowerCase().includes('ashby')) {
      confidence += 5;
      detectedFeatures.push('html:ashby-reference');
    }

    return { platform: ATSPlatform.ASHBY, confidence: Math.min(confidence, 100), detectedFeatures, automationSupported: false };
  }

  async prepare(browser: BrowserSession, context: WorkflowContext, logger: ExecutionLogger): Promise<void> {
    await logger.info('plugin_loaded', 'Ashby plugin active — stub implementation');
    throw new InterventionError(InterventionReason.UNEXPECTED_PAGE, 'Ashby automation is not yet implemented. Please apply manually.', context.jobUrl);
  }

  async apply(_b: BrowserSession, _c: WorkflowContext, _l: ExecutionLogger): Promise<void> {}

  async validate(_b: BrowserSession, _c: WorkflowContext, _l: ExecutionLogger): Promise<{ valid: boolean; issues: string[] }> {
    return { valid: false, issues: ['Ashby automation not yet implemented'] };
  }

  async finalize(_b: BrowserSession, _c: WorkflowContext, _l: ExecutionLogger): Promise<WorkflowResult> {
    return { status: AutoApplyStatus.SKIPPED, canComplete: false, platform: ATSPlatform.ASHBY, automationConfidence: 0, stepsCompleted: 0, stepsRemaining: 0, blockingIssue: 'Ashby automation not yet implemented', estimatedSubmissionTime: null };
  }
}

pluginRegistry.register(new AshbyPlugin());
