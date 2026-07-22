import { ATSPlatform, ATSDetectionResult, WorkflowContext, WorkflowResult } from '../types';
import { ExecutionLogger } from '../execution-logger';
import { BrowserSession } from '../browser-session';

/**
 * ATSPlugin — Abstract base class for all ATS platform automation plugins.
 *
 * Every supported ATS (Workday, Greenhouse, Lever, etc.) extends this class
 * and provides platform-specific implementations of each lifecycle method.
 *
 * The lifecycle is: detect → prepare → apply → validate → finalize
 *
 * The WorkflowEngine calls these methods in sequence.
 * Plugins should throw InterventionError when they need human help.
 */
export abstract class ATSPlugin {
  /** The ATS platform this plugin handles */
  abstract readonly platform: ATSPlatform;

  /** Human-readable platform name for logging */
  abstract readonly displayName: string;

  /**
   * Detect whether a given page belongs to this ATS.
   * Uses URL patterns, HTML signatures, JS assets, and meta tags.
   * Called synchronously during the detection phase.
   *
   * @param url      The current page URL (after redirects)
   * @param html     The page HTML content
   * @param redirectChain  All URLs visited before reaching the final page
   */
  abstract detect(
    url: string,
    html: string,
    redirectChain: string[]
  ): ATSDetectionResult;

  /**
   * Prepare the browser session for this ATS.
   * Handle login, navigate to the application form, dismiss popups, etc.
   * Should leave the browser on the first page of the application form.
   */
  abstract prepare(
    browser: BrowserSession,
    context: WorkflowContext,
    logger: ExecutionLogger
  ): Promise<void>;

  /**
   * Fill in the application form.
   * Upload resume and cover letter, answer standard and dynamic questions.
   * Should NOT click the final submit button.
   */
  abstract apply(
    browser: BrowserSession,
    context: WorkflowContext,
    logger: ExecutionLogger
  ): Promise<void>;

  /**
   * Validate the form is ready to submit.
   * Check for required fields, validation errors, file upload confirmations.
   * Returns { valid: true } if ready, { valid: false, issues: [...] } otherwise.
   */
  abstract validate(
    browser: BrowserSession,
    context: WorkflowContext,
    logger: ExecutionLogger
  ): Promise<{ valid: boolean; issues: string[] }>;

  /**
   * Finalize the application.
   * In simulation mode: stop at the confirmation page and report canComplete.
   * In live mode: click submit and verify the confirmation.
   */
  abstract finalize(
    browser: BrowserSession,
    context: WorkflowContext,
    logger: ExecutionLogger
  ): Promise<WorkflowResult>;
}

/**
 * InterventionError — thrown by plugins when human help is required.
 * The WorkflowEngine catches this and creates an InterventionRequest via the API.
 */
export class InterventionError extends Error {
  constructor(
    public readonly reason: string,
    public readonly description: string,
    public readonly pageUrl?: string
  ) {
    super(`Intervention needed [${reason}]: ${description}`);
    this.name = 'InterventionError';
  }
}
