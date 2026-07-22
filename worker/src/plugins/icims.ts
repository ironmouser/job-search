import { ATSPlatform, ATSDetectionResult, WorkflowContext, WorkflowResult, AutoApplyStatus, InterventionReason } from '../types';
import { ATSPlugin, InterventionError } from './base-plugin';
import { BrowserSession } from '../browser-session';
import { ExecutionLogger } from '../execution-logger';
import { pluginRegistry } from '../registry';

/** iCIMS ATS plugin stub — detection functional, automation pending. */
export class ICIMSPlugin extends ATSPlugin {
  readonly platform = ATSPlatform.ICIMS;
  readonly displayName = 'iCIMS';

  detect(url: string, html: string, redirectChain: string[]): ATSDetectionResult {
    let confidence = 0;
    const detectedFeatures: string[] = [];
    const allUrls = [url, ...redirectChain];

    for (const u of allUrls) {
      try {
        const hostname = new URL(u).hostname;
        if (hostname.endsWith('.icims.com') || hostname.startsWith('careers-')) {
          confidence += 80;
          detectedFeatures.push('hostname:icims.com');
          break;
        }
      } catch {}
    }

    if (html.includes('iCIMS_MainWrapper') || html.includes('iCIMS')) {
      confidence += 15;
      detectedFeatures.push('html:iCIMS_MainWrapper');
    }
    if (html.includes('icims.js')) {
      confidence += 5;
      detectedFeatures.push('js:icims.js');
    }

    return { platform: ATSPlatform.ICIMS, confidence: Math.min(confidence, 100), detectedFeatures, automationSupported: false };
  }

  async prepare(browser: BrowserSession, context: WorkflowContext, logger: ExecutionLogger): Promise<void> {
    await logger.info('plugin_loaded', 'iCIMS plugin active — stub implementation');
    throw new InterventionError(InterventionReason.UNEXPECTED_PAGE, 'iCIMS automation is not yet implemented. Please apply manually.', context.jobUrl);
  }

  async apply(_b: BrowserSession, _c: WorkflowContext, _l: ExecutionLogger): Promise<void> {}

  async validate(_b: BrowserSession, _c: WorkflowContext, _l: ExecutionLogger): Promise<{ valid: boolean; issues: string[] }> {
    return { valid: false, issues: ['iCIMS automation not yet implemented'] };
  }

  async finalize(_b: BrowserSession, _c: WorkflowContext, _l: ExecutionLogger): Promise<WorkflowResult> {
    return { status: AutoApplyStatus.SKIPPED, canComplete: false, platform: ATSPlatform.ICIMS, automationConfidence: 0, stepsCompleted: 0, stepsRemaining: 0, blockingIssue: 'iCIMS automation not yet implemented', estimatedSubmissionTime: null };
  }
}

pluginRegistry.register(new ICIMSPlugin());
