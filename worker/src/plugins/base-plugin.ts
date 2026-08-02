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

  // ─── Shared Helpers ────────────────────────────────────────────────────────

  /**
   * Locates the final submit button within a frame/page using a priority-ordered
   * strategy that balances precision against resilience to CSS-Module hash changes
   * and ATS-specific markup quirks.
   *
   * Priority:
   *  1. Platform-specific semantic selector(s) — passed in via `semanticSelectors`.
   *     These are intentionally stable identifiers the ATS vendor adds for their
   *     own tooling (e.g. `.ashby-application-form-submit-button`, `#submit_app`).
   *  2. Standard HTML `type="submit"` attribute on <button> or <input>.
   *  3. Fuzzy: any <button> or <input> whose class, id, name, data-testid, or
   *     aria-label *contains* "submit" (case-insensitive). Each candidate is
   *     validated against a blocklist so that "Next Step" / "Continue" / "Save
   *     Draft" buttons are never matched.
   *  4. Text-content fallback: any <button> or <a> whose visible text contains
   *     "submit" (case-insensitive), again blocklist-validated.
   *
   * @param ctx               The Playwright Frame or Page to search within.
   * @param logger            ExecutionLogger for audit trail entries.
   * @param semanticSelectors Optional ordered list of platform-specific CSS
   *                          selectors to try before falling back to generic tiers.
   */
  protected async findSubmitButton(
    ctx: import('playwright').Frame | import('playwright').Page,
    logger: ExecutionLogger,
    semanticSelectors: string[] = []
  ): Promise<import('playwright').ElementHandle | null> {
    // Words that disqualify a fuzzy or text match — these appear on navigation
    // and save-draft buttons, not on final-submission buttons.
    const BLOCKLIST = /\b(next|continue|back|previous|save|cancel|skip|draft)\b/i;

    // ── Tier 1: platform-specific semantic selectors ───────────────────────
    for (const sel of semanticSelectors) {
      const el = await ctx.$(sel).catch(() => null);
      if (el) {
        await logger.info('submit_btn_found', `Submit button located via semantic selector: "${sel}"`);
        return el;
      }
    }

    // ── Tier 2: standard HTML submit attribute ─────────────────────────────
    const tier2 = await ctx.$('button[type="submit"], input[type="submit"]').catch(() => null);
    if (tier2) {
      await logger.info('submit_btn_found', 'Submit button located via type="submit"');
      return tier2;
    }

    // ── Tier 3: fuzzy attribute/class contains "submit", text-validated ────
    // CSS attribute selectors support case-insensitive matching via the `i` flag.
    const FUZZY_SELECTOR = [
      'button[class*="submit" i]',
      'button[id*="submit" i]',
      'button[name*="submit" i]',
      'button[data-testid*="submit" i]',
      'button[aria-label*="submit" i]',
      'input[id*="submit" i]',
      'input[name*="submit" i]',
      'input[data-testid*="submit" i]',
    ].join(', ');

    const candidates = await ctx.$$(FUZZY_SELECTOR).catch(() => []);
    for (const candidate of candidates) {
      const text = ((await candidate.textContent().catch(() => null)) ?? '').trim();
      if (!BLOCKLIST.test(text)) {
        await logger.info('submit_btn_found', `Submit button located via fuzzy attr/class match (text: "${text}")`);
        return candidate;
      }
    }

    // ── Tier 4: visible text contains "submit", blocklist-validated ─────────
    const allClickable = await ctx.$$('button, a[role="button"]').catch(() => []);
    for (const el of allClickable) {
      const text = ((await el.textContent().catch(() => null)) ?? '').trim();
      if (/submit/i.test(text) && !BLOCKLIST.test(text)) {
        await logger.info('submit_btn_found', `Submit button located via text-content scan (text: "${text}")`);
        return el;
      }
    }

    await logger.warn('submit_btn_not_found', 'All four tiers exhausted — submit button not found');
    return null;
  }
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
