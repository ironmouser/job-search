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
 * Humanized typing variant that types character-by-character with randomized delays
 * (35ms - 75ms) to satisfy anti-bot telemetry scripts (PerimeterX, Cloudflare Turnstile, DataDome).
 * Dispatches proper framework events upon completion.
 */
export async function replaceValueHumanized(locator: Locator, value: string): Promise<void> {
  await locator.scrollIntoViewIfNeeded().catch(() => {});
  await locator.focus().catch(() => {});
  await locator.click({ force: true }).catch(() => {});

  // Clear existing content safely
  await locator.evaluate((el) => {
    const target = el as HTMLInputElement | HTMLTextAreaElement;
    if (target) {
      target.value = '';
    }
  }).catch(() => {});

  try {
    // Type with natural randomized intervals
    for (const char of value) {
      await locator.page().keyboard.type(char, { delay: Math.floor(Math.random() * 40) + 35 });
    }
    await locator.dispatchEvent('input').catch(() => {});
    await locator.dispatchEvent('change').catch(() => {});
    await locator.dispatchEvent('blur').catch(() => {});
  } catch {
    // Fallback to prototype commit
    await commitValue(locator, value);
  }
}

/**
 * Settling pause to allow anti-bot client scripts to compute telemetry tokens
 * before submitting critical forms.
 */
export async function waitForSensorSettling(page: any, ms = 1200): Promise<void> {
  if (page && typeof page.waitForTimeout === 'function') {
    await page.waitForTimeout(ms).catch(() => {});
  }
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

/**
 * Normalize a free-form date string ("March 3, 2026", "03/05/2026", "2026-03-05")
 * to the ISO yyyy-mm-dd format required by native <input type="date"> fills.
 * Returns null when unparseable.
 */
export function toISODate(value: string): string | null {
  const v = value.trim();
  if (!v) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;

  let match = v.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (match) {
    const [, a, b, y] = match;
    // Assume US ordering (MM/DD/YYYY); fall back to DD/MM when first segment > 12
    const month = parseInt(a, 10) > 12 ? b : a;
    const day = parseInt(a, 10) > 12 ? a : b;
    return `${y.length === 2 ? `20${y}` : y}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  const parsed = new Date(v);
  if (!isNaN(parsed.getTime())) {
    return [
      parsed.getFullYear(),
      String(parsed.getMonth() + 1).padStart(2, '0'),
      String(parsed.getDate()).padStart(2, '0'),
    ].join('-');
  }
  return null;
}

/**
 * Normalize a free-form date string to the MM/DD/YYYY slash format expected by
 * placeholder-masked text date fields. Returns null when unparseable.
 */
export function toSlashDate(value: string): string | null {
  const iso = toISODate(value);
  if (!iso) return null;
  const [y, m, d] = iso.split('-');
  return `${m}/${d}/${y}`;
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
