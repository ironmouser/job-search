import { ATSPlatform, ATSDetectionResult, WorkflowContext, WorkflowResult, AutoApplyStatus, InterventionReason } from '../types';
import { ATSPlugin, InterventionError } from './base-plugin';
import { BrowserSession } from '../browser-session';
import { ExecutionLogger } from '../execution-logger';
import { pluginRegistry } from '../registry';

/**
 * GreenhousePlugin — automation plugin for Greenhouse ATS.
 *
 * Detection signals:
 *  - Hostname: boards.greenhouse.io, *.greenhouse.io
 *  - HTML: #grnhse_app, div.opening
 *  - JS: greenhouse.js
 *  - Meta: <meta name="generator" content="Greenhouse">
 *
 * Status: STUB — detection is functional; apply/finalize require implementation.
 */
export class GreenhousePlugin extends ATSPlugin {
  readonly platform = ATSPlatform.GREENHOUSE;
  readonly displayName = 'Greenhouse';

  detect(url: string, html: string, redirectChain: string[]): ATSDetectionResult {
    let confidence = 0;
    const detectedFeatures: string[] = [];
    const allUrls = [url, ...redirectChain];

    for (const u of allUrls) {
      try {
        const hostname = new URL(u).hostname;
        if (hostname === 'boards.greenhouse.io' || hostname.endsWith('.greenhouse.io')) {
          confidence += 80;
          detectedFeatures.push('hostname:greenhouse.io');
          break;
        }
      } catch {}
    }

    if (html.includes('id="grnhse_app"') || html.includes('id=\'grnhse_app\'')) {
      confidence += 15;
      detectedFeatures.push('html:#grnhse_app');
    }
    if (html.includes('div.opening') || html.includes('class="opening"')) {
      confidence += 5;
      detectedFeatures.push('html:.opening');
    }
    if (html.toLowerCase().includes('greenhouse')) {
      confidence += 5;
      detectedFeatures.push('html:greenhouse-reference');
    }
    if (html.includes('greenhouse.js')) {
      confidence += 10;
      detectedFeatures.push('js:greenhouse.js');
    }
    if (html.includes('generator" content="Greenhouse"')) {
      confidence += 10;
      detectedFeatures.push('meta:generator-greenhouse');
    }

    return {
      platform: ATSPlatform.GREENHOUSE,
      confidence: Math.min(confidence, 100),
      detectedFeatures,
      automationSupported: false, // TODO: enable when implemented
    };
  }

  async prepare(browser: BrowserSession, context: WorkflowContext, logger: ExecutionLogger): Promise<void> {
    await logger.info('plugin_loaded', 'Greenhouse plugin active — stub implementation');
    throw new InterventionError(
      InterventionReason.UNEXPECTED_PAGE,
      'Greenhouse automation is not yet implemented. Please apply manually.',
      context.jobUrl
    );
  }

  async apply(browser: BrowserSession, context: WorkflowContext, logger: ExecutionLogger): Promise<void> {
    // TODO: Implement Greenhouse form filling
  }

  async validate(browser: BrowserSession, context: WorkflowContext, logger: ExecutionLogger): Promise<{ valid: boolean; issues: string[] }> {
    return { valid: false, issues: ['Greenhouse automation not yet implemented'] };
  }

  async finalize(browser: BrowserSession, context: WorkflowContext, logger: ExecutionLogger): Promise<WorkflowResult> {
    return {
      status: AutoApplyStatus.SKIPPED,
      canComplete: false,
      platform: ATSPlatform.GREENHOUSE,
      automationConfidence: 0,
      stepsCompleted: 0,
      stepsRemaining: 0,
      blockingIssue: 'Greenhouse automation not yet implemented',
      estimatedSubmissionTime: null,
    };
  }
}

pluginRegistry.register(new GreenhousePlugin());
