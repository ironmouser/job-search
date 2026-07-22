import { ATSPlatform, ATSDetectionResult, WorkflowContext, WorkflowResult, AutoApplyStatus, InterventionReason } from '../types';
import { ATSPlugin, InterventionError } from './base-plugin';
import { BrowserSession } from '../browser-session';
import { ExecutionLogger } from '../execution-logger';
import { pluginRegistry } from '../registry';

/** SmartRecruiters ATS plugin stub — detection functional, automation pending. */
export class SmartRecruitersPlugin extends ATSPlugin {
  readonly platform = ATSPlatform.SMARTRECRUITERS;
  readonly displayName = 'SmartRecruiters';

  detect(url: string, html: string, redirectChain: string[]): ATSDetectionResult {
    let confidence = 0;
    const detectedFeatures: string[] = [];
    const allUrls = [url, ...redirectChain];

    for (const u of allUrls) {
      try {
        const hostname = new URL(u).hostname;
        if (hostname.endsWith('.smartrecruiters.com') || hostname === 'careers.smartrecruiters.com') {
          confidence += 80;
          detectedFeatures.push('hostname:smartrecruiters.com');
          break;
        }
      } catch {}
    }

    if (html.includes('st-apply-form') || html.includes('id="st-apply"')) {
      confidence += 15;
      detectedFeatures.push('html:st-apply-form');
    }
    if (html.toLowerCase().includes('smartrecruiters')) {
      confidence += 5;
      detectedFeatures.push('html:smartrecruiters-reference');
    }

    return { platform: ATSPlatform.SMARTRECRUITERS, confidence: Math.min(confidence, 100), detectedFeatures, automationSupported: false };
  }

  async prepare(browser: BrowserSession, context: WorkflowContext, logger: ExecutionLogger): Promise<void> {
    await logger.info('plugin_loaded', 'SmartRecruiters plugin active — stub implementation');
    throw new InterventionError(InterventionReason.UNEXPECTED_PAGE, 'SmartRecruiters automation is not yet implemented. Please apply manually.', context.jobUrl);
  }

  async apply(_b: BrowserSession, _c: WorkflowContext, _l: ExecutionLogger): Promise<void> {}

  async validate(_b: BrowserSession, _c: WorkflowContext, _l: ExecutionLogger): Promise<{ valid: boolean; issues: string[] }> {
    return { valid: false, issues: ['SmartRecruiters automation not yet implemented'] };
  }

  async finalize(_b: BrowserSession, _c: WorkflowContext, _l: ExecutionLogger): Promise<WorkflowResult> {
    return { status: AutoApplyStatus.SKIPPED, canComplete: false, platform: ATSPlatform.SMARTRECRUITERS, automationConfidence: 0, stepsCompleted: 0, stepsRemaining: 0, blockingIssue: 'SmartRecruiters automation not yet implemented', estimatedSubmissionTime: null };
  }
}

pluginRegistry.register(new SmartRecruitersPlugin());
