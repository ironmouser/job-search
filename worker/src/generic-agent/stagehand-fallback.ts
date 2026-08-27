/**
 * worker/src/generic-agent/stagehand-fallback.ts
 *
 * StagehandFallback — Self-healing browser automation fallback layer.
 *
 * Provides resilient form filling, dynamic dropdown selection, and action
 * execution when deterministic DOM selectors fail. Uses targeted page.evaluate()
 * with React-compatible synthetic event dispatch as the primary mechanism.
 */

import { Page } from 'playwright';
import { ExecutionLogger } from '../execution-logger';

export interface StagehandActionOptions {
  timeoutMs?: number;
  useCache?: boolean;
}

export class StagehandFallback {
  /**
   * Always available — no external API key required. The fallback operates
   * entirely via Playwright page.evaluate() with React-compatible event dispatch.
   */
  static isConfigured(): boolean {
    return true;
  }


  /**
   * Fallback action to fill a specific form field when deterministic selectors fail.
   */
  static async fillField(
    page: Page,
    fieldLabel: string,
    value: string,
    logger?: ExecutionLogger
  ): Promise<boolean> {
    if (!value) return false;

    try {
      if (logger) {
        await logger.info(
          'stagehand_fallback_invoked',
          `Attempting self-healing fallback for field: "${fieldLabel}"`
        );
      }

      // Uses React-compatible nativeInputValueSetter trick so synthetic onChange fires
      // correctly in React/Vue/Angular apps that control their own input state.
      const filled = await page.evaluate(
        ({ label, val }: { label: string; val: string }) => {
          const searchTerms = label.toLowerCase().split(/\s+/);
          const inputs = Array.from(
            document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
              'input:not([type="hidden"]):not([type="submit"]):not([type="button"]), textarea'
            )
          );

          for (const input of inputs) {
            const inputLabel =
              input.getAttribute('aria-label') ||
              input.getAttribute('placeholder') ||
              input.getAttribute('name') ||
              input.id ||
              '';
            const parentText = input.parentElement?.textContent || '';
            const combined = `${inputLabel} ${parentText}`.toLowerCase();

            if (searchTerms.some((term) => term.length > 2 && combined.includes(term))) {
              input.focus();
              // React tracks value via its own internal fiber. Bypass it using the
              // native setter so React's synthetic onChange fires on the next event.
              const nativeSetter =
                Object.getOwnPropertyDescriptor(
                  input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype,
                  'value'
                )?.set;
              if (nativeSetter) {
                nativeSetter.call(input, val);
              } else {
                input.value = val;
              }
              input.dispatchEvent(new Event('input', { bubbles: true }));
              input.dispatchEvent(new Event('change', { bubbles: true }));
              input.dispatchEvent(new Event('blur', { bubbles: true }));
              return true;
            }
          }
          return false;
        },
        { label: fieldLabel, val: value }
      );

      if (filled) {
        if (logger) {
          await logger.info(
            'field_filled_fallback',
            `Successfully populated "${fieldLabel}" via self-healing fallback`
          );
        }
        return true;
      }

      return false;
    } catch (err: any) {
      if (logger) {
        await logger.warn(
          'stagehand_fallback_error',
          `Self-healing fallback failed for "${fieldLabel}": ${err.message}`
        );
      }
      return false;
    }
  }

  /**
   * Fallback action to select an option from a custom React / Angular / Vue dropdown.
   */
  static async selectDropdown(
    page: Page,
    dropdownLabel: string,
    optionText: string,
    logger?: ExecutionLogger
  ): Promise<boolean> {
    if (!optionText) return false;

    try {
      if (logger) {
        await logger.info(
          'stagehand_dropdown_fallback',
          `Attempting self-healing dropdown selection for "${dropdownLabel}": "${optionText}"`
        );
      }

      // Step 1: Click the trigger — synchronous evaluate (no async/await inside evaluate;
      // page.evaluate() cannot serialize Promise-returning functions that use real timers).
      const triggerClicked = await page.evaluate(
        ({ label }: { label: string }) => {
          const lowerLabel = label.toLowerCase();
          const triggers = Array.from(
            document.querySelectorAll<HTMLElement>(
              'button, [role="combobox"], [role="button"], .select2-choice, [class*="-control"], [class*="select" i]'
            )
          );

          for (const el of triggers) {
            const text = (el.textContent || el.getAttribute('aria-label') || '').toLowerCase();
            const parentText = (el.parentElement?.textContent || '').toLowerCase();
            if (text.includes(lowerLabel) || parentText.includes(lowerLabel)) {
              el.click();
              return true;
            }
          }
          return false;
        },
        { label: dropdownLabel }
      );

      if (!triggerClicked) return false;

      // Step 2: Wait in Node-land for the popup to open (page.evaluate is synchronous;
      // setTimeout inside it does not suspend execution as intended).
      await page.waitForTimeout(400);

      // Step 3: Find and click the matching option
      const selected = await page.evaluate(
        ({ opt }: { opt: string }) => {
          const lowerOpt = opt.toLowerCase();
          const options = Array.from(
            document.querySelectorAll<HTMLElement>(
              '[role="option"], [role="menuitem"], li, .select2-result-label, [class*="option" i]'
            )
          );

          for (const optEl of options) {
            const optContent = (optEl.textContent || '').trim().toLowerCase();
            if (optContent && (optContent.includes(lowerOpt) || lowerOpt.includes(optContent))) {
              optEl.click();
              return true;
            }
          }
          return false;
        },
        { opt: optionText }
      );

      if (selected) {
        if (logger) {
          await logger.info(
            'dropdown_selected_fallback',
            `Successfully selected "${optionText}" for "${dropdownLabel}"`
          );
        }
        return true;
      }

      return false;
    } catch (err: any) {
      if (logger) {
        await logger.warn(
          'stagehand_dropdown_error',
          `Self-healing dropdown selection error for "${dropdownLabel}": ${err.message}`
        );
      }
      return false;
    }
  }

  /**
   * Fallback action to click a dynamic action button (e.g. Next Step, Continue, Submit).
   */
  static async clickAction(
    page: Page,
    actionDescription: string,
    logger?: ExecutionLogger
  ): Promise<boolean> {

    try {
      if (logger) {
        await logger.info(
          'stagehand_click_action',
          `Attempting Stagehand AI click for action: "${actionDescription}"`
        );
      }

      const clicked = await page.evaluate(
        ({ desc }: { desc: string }) => {
          const lowerDesc = desc.toLowerCase();
          const buttons = Array.from(
            document.querySelectorAll<HTMLElement>(
              'button, a, input[type="button"], input[type="submit"], [role="button"]'
            )
          );

          for (const btn of buttons) {
            const text = (btn.textContent || btn.getAttribute('aria-label') || (btn as HTMLInputElement).value || '').toLowerCase().trim();
            if (text && (text.includes(lowerDesc) || lowerDesc.includes(text))) {
              btn.scrollIntoView({ behavior: 'instant', block: 'center' });
              btn.click();
              return true;
            }
          }
          return false;
        },
        { desc: actionDescription }
      );

      return clicked;
    } catch (err: any) {
      if (logger) {
        await logger.warn(
          'stagehand_click_error',
          `Stagehand click failed for "${actionDescription}": ${err.message}`
        );
      }
      return false;
    }
  }
}
