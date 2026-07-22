import { ATSPlatform, ATSDetectionResult, WorkflowContext, WorkflowResult, AutoApplyStatus, InterventionReason } from '../types';
import { ATSPlugin, InterventionError } from './base-plugin';
import { BrowserSession } from '../browser-session';
import { ExecutionLogger } from '../execution-logger';
import { pluginRegistry } from '../registry';

/** Taleo ATS plugin stub — detection functional, automation pending. */
export class TaleoPlugin extends ATSPlugin {
  readonly platform = ATSPlatform.TALEO;
  readonly displayName = 'Taleo';

  detect(url: string, html: string, redirectChain: string[]): ATSDetectionResult {
    let confidence = 0;
    const detectedFeatures: string[] = [];
    const allUrls = [url, ...redirectChain];

    for (const u of allUrls) {
      try {
        const hostname = new URL(u).hostname;
        if (hostname.endsWith('.taleo.net')) {
          confidence += 85;
          detectedFeatures.push('hostname:taleo.net');
          break;
        }
      } catch {}
    }

    if (html.includes('class="taleo"') || html.includes('data-taleo')) {
      confidence += 10;
      detectedFeatures.push('html:taleo');
    }
    if (html.includes('taleo.min.js')) {
      confidence += 10;
      detectedFeatures.push('js:taleo.min.js');
    }

    return { platform: ATSPlatform.TALEO, confidence: Math.min(confidence, 100), detectedFeatures, automationSupported: false };
  }

  async prepare(browser: BrowserSession, context: WorkflowContext, logger: ExecutionLogger): Promise<void> {
    await logger.info('plugin_loaded', 'Taleo plugin active — stub implementation');
    throw new InterventionError(InterventionReason.UNEXPECTED_PAGE, 'Taleo automation is not yet implemented. Please apply manually.', context.jobUrl);
  }

  async apply(_b: BrowserSession, _c: WorkflowContext, _l: ExecutionLogger): Promise<void> {}

  async validate(_b: BrowserSession, _c: WorkflowContext, _l: ExecutionLogger): Promise<{ valid: boolean; issues: string[] }> {
    return { valid: false, issues: ['Taleo automation not yet implemented'] };
  }

  async finalize(_b: BrowserSession, _c: WorkflowContext, _l: ExecutionLogger): Promise<WorkflowResult> {
    return { status: AutoApplyStatus.SKIPPED, canComplete: false, platform: ATSPlatform.TALEO, automationConfidence: 0, stepsCompleted: 0, stepsRemaining: 0, blockingIssue: 'Taleo automation not yet implemented', estimatedSubmissionTime: null };
  }
}

pluginRegistry.register(new TaleoPlugin());
