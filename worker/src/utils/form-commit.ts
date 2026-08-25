/**
 * worker/src/utils/form-commit.ts
 *
 * Framework-safe value committing for form controls rendered by React, Vue,
 * Angular, Svelte, or jQuery.
 *
 * Playwright's fill() sets .value directly, which bypasses the native property
 * setter that React 16+ controlled components rely on — the DOM shows the text
 * but component state never updates, so validation/submission silently fails.
 * These helpers invoke the prototype's native setter inside the page, then fire
 * the standard event sequence (input → change) so every framework commits state.
 */

import { Locator } from 'playwright';

/**
 * Set the value of an <input> or <textarea> through its native prototype setter
 * and dispatch input/change events so React/Vue/Angular state reconciles.
 */
export async function commitValue(locator: Locator, value: string): Promise<void> {
  await locator.evaluate((el, val) => {
    const target = el as HTMLInputElement | HTMLTextAreaElement;

    if (target instanceof HTMLTextAreaElement || target instanceof HTMLInputElement) {
      const proto = target instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;

      const descriptor = Object.getOwnPropertyDescriptor(proto, 'value');
      if (descriptor && descriptor.set) {
        descriptor.set.call(target, val);
      } else {
        target.value = val;
      }
    } else {
      (target as HTMLInputElement).value = val;
    }

    target.dispatchEvent(new Event('input', { bubbles: true }));
    target.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);
}

/**
 * Append-free variant that clears first (triple-click + Backspace equivalent),
 * then commits the new value. Safe for masked inputs.
 */
export async function replaceValue(locator: Locator, value: string): Promise<void> {
  await locator.focus().catch(() => {});
  await locator.evaluate((el) => {
    const target = el as HTMLInputElement | HTMLTextAreaElement;
    target.select?.();
  }).catch(() => {});
  await commitValue(locator, value);
}

/**
 * Insert text into a contenteditable element with framework-safe events.
 * Replaces existing content.
 */
export async function commitContenteditable(locator: Locator, text: string): Promise<void> {
  await locator.focus().catch(() => {});
  await locator.evaluate((el, val) => {
    const editable = el as HTMLElement;
    editable.focus();

    const selection = window.getSelection();
    if (selection) {
      const range = document.createRange();
      range.selectNodeContents(editable);
      selection.removeAllRanges();
      selection.addRange(range);
    }

    // Prefer execCommand so undo stacks / beforeinput listeners stay consistent
    let inserted = false;
    try {
      inserted = document.execCommand('insertText', false, val);
    } catch {
      inserted = false;
    }

    if (!inserted) {
      editable.innerText = val;
    }

    editable.dispatchEvent(new InputEvent('input', { bubbles: true, data: val }));
    editable.dispatchEvent(new Event('change', { bubbles: true }));
    editable.blur();
  }, text);
}

/**
 * Toggle an ARIA switch / checkbox-like control to the desired state,
 * clicking only when current state differs from the target.
 * Returns the resulting state, or null when the element exposes no state.
 */
export async function setSwitchState(
  locator: Locator,
  desired: boolean
): Promise<boolean | null> {
  const current = await readSwitchState(locator);
  if (current === null) return null;
  if (current === desired) return desired;

  await locator.click({ force: true }).catch(() => {});

  // Some widgets animate / defer state; re-read briefly.
  // Note: Locator has no waitForTimeout — resolve the page from the locator's frame.
  const page = locator.page();
  for (let i = 0; i < 5; i++) {
    await page.waitForTimeout(200);
    const now = await readSwitchState(locator);
    if (now === desired) return desired;
  }
  return readSwitchState(locator);
}

/** Read aria-checked / checked state from a switch-like element. */
export async function readSwitchState(locator: Locator): Promise<boolean | null> {
  return locator.evaluate((el) => {
    const target = el as HTMLElement & { ariaChecked?: string };
    const attr = target.getAttribute('aria-checked');
    if (attr === 'true') return true;
    if (attr === 'false') return false;
    if ((el as HTMLInputElement).type === 'checkbox') return (el as HTMLInputElement).checked;
    if (target.classList.contains('is-checked') || target.classList.contains('checked')) return true;
    return null;
  }).catch(() => null);
}
