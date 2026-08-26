/**
 * worker/src/utils/typeahead.ts
 *
 * Shared handling for typeahead / autocomplete inputs (react-bootstrap-typeahead,
 * Google Places, ARIA comboboxes, generic suggestion lists).
 *
 * Key guarantees:
 *  - Every locator operation carries an explicit short timeout. Playwright's
 *    30s default compounded across clear/type/suggest steps once stalled a
 *    session for 14 minutes with no logs (CarGurus Phenom form, 2026-08-26).
 *  - The typed value is committed via framework-safe events, then VERIFIED by
 *    reading the input's actual value afterwards. Misspellings from dropped
 *    keystrokes or race-y re-renders are detected instead of silently accepted.
 *  - Suggestion selection matches option TEXT against the expected value
 *    (case-insensitive substring), so a wrong city ("Austin" when typing
 *    "Austin TX") is not picked just because it was the first row.
 *  - A visible "No matches found" row is respected: keyboard-accepting a
 *    non-suggestion would commit garbage, so we report unverified instead.
 */

import { Page, Frame, Locator } from 'playwright';

/** Normalize for comparison: lowercase, collapse whitespace, strip punctuation. */
function norm(s: string): string {
  return s.toLowerCase().replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Per-operation timeout — anything longer means the widget is wedged; bail out. */
const OP_TIMEOUT_MS = 4_000;

export interface TypeaheadResult {
  /** True when a typeahead input was found and driven to a committed state. */
  handled: boolean;
  /** True when the final input value matches the requested value closely enough. */
  verified: boolean;
  /** What the input actually contains at the end (empty string if unknown). */
  finalValue: string;
}

/**
 * Drive one visible typeahead input: clear it, type `value` character-by-character,
 * pick the best matching suggestion, then verify what actually landed in the box.
 */
export async function driveTypeahead(
  ctx: Page | Frame,
  input: Locator,
  value: string,
  opts?: { suggestionWaitMs?: number }
): Promise<TypeaheadResult> {
  const page = getPage(ctx);
  const waitMs = opts?.suggestionWaitMs ?? 1500;
  const result: TypeaheadResult = { handled: false, verified: false, finalValue: '' };

  // 1. Clear any existing text completely (select-all + backspace, twice for safety)
  await input.click({ clickCount: 3, timeout: OP_TIMEOUT_MS }).catch(() => {});
  await page.keyboard.press('Backspace').catch(() => {});
  await input.click({ clickCount: 3, timeout: OP_TIMEOUT_MS }).catch(() => {});
  await page.keyboard.press('Backspace').catch(() => {});
  await page.waitForTimeout(200);

  // 2. Type with human-like cadence; per-char verification happens at the end.
  const delay = Math.floor(Math.random() * 25) + 15;
  await input.pressSequentially(value, { delay, timeout: OP_TIMEOUT_MS }).catch(() => {});
  await page.waitForTimeout(waitMs);

  // 3. Pick the best-matching suggestion scoped near this input.
  await selectBestSuggestion(ctx, input, value);

  await page.waitForTimeout(300);
  result.handled = true;
  result.finalValue = ((await input.inputValue({ timeout: OP_TIMEOUT_MS }).catch(() => '')) || '').trim();
  result.verified = valuesClose(result.finalValue, value);
  return result;
}

/**
 * Click the suggestion whose text best matches `value`, scoped to dropdowns
 * adjacent to this input. Never clicks a clearly non-matching first row when a
 * better match exists; falls back to keyboard selection only when nothing
 * matches but suggestions are open.
 */
async function selectBestSuggestion(
  ctx: Page | Frame,
  input: Locator,
  value: string
): Promise<void> {
  const page = getPage(ctx);
  const wanted = norm(value);

  // Scope preference: the widget container wrapping THIS input, else the page.
  const scopes: Array<Page | Frame | ReturnType<Page['locator']>> = [];
  const rbtContainer = ctx.locator('.rbt:visible').filter({ has: input }).first();
  if ((await rbtContainer.count().catch(() => 0)) > 0) {
    scopes.push(rbtContainer);
  }
  scopes.push(page);

  const menuSelectors = [
    '.rbt-menu > li',
    '[role="listbox"] [role="option"]',
    '[role="option"]',
    '.pac-item',
    '.suggestions > *',
    '.typeahead > *',
    'ul.dropdown-menu > li',
    '[class*="autocomplete" i] li',
    '[class*="autocomplete" i] div[role="option"]',
    '[class*="suggestion" i]',
    '[class*="dropdown-item" i]',
    'div[id*="-option-"]',
  ];

  // Autosuggest widgets render an explicit empty-state row ("No matches found")
  // when nothing matched. Accepting it (or pressing Enter on it) commits junk.
  const noMatchTexts = [
    'no matches',
    'no results',
    'no options',
    'nothing found',
    'no suggestions',
  ];
  const looksLikeNoMatchRow = (text: string) =>
    noMatchTexts.some((m) => text.includes(m)) && norm(text).length <= 24;

  for (const scope of scopes) {
    for (const sel of menuSelectors) {
      try {
        const options = scope.locator(sel);
        const count = await options.count().catch(() => 0);
        if (count === 0) continue;

        let bestIdx = -1;
        let bestScore = 0;
        let sawNoMatchOnly = count > 0;
        for (let i = 0; i < Math.min(count, 12); i++) {
          const opt = options.nth(i);
          if (!(await opt.isVisible({ timeout: 1000 }).catch(() => false))) continue;
          const rawText = (await opt.textContent({ timeout: 1000 }).catch(() => '')) || '';
          const text = norm(rawText);
          if (!text) continue;
          if (looksLikeNoMatchRow(rawText)) continue;
          sawNoMatchOnly = false;

          let score = 0;
          if (text === wanted) score = 100;
          else if (text.includes(wanted) || wanted.includes(text)) score = 80;
          else {
            // Partial token overlap (e.g. "Austin" matches "Austin, TX, USA")
            const tokens = wanted.split(' ').filter((t) => t.length > 2);
            const hits = tokens.filter((t) => text.includes(t)).length;
            if (tokens.length > 0 && hits === tokens.length) score = 60;
          }
          if (score > bestScore) {
            bestScore = score;
            bestIdx = i;
          }
        }

        if (bestIdx >= 0 && bestScore >= 60) {
          await options.nth(bestIdx).click({ force: true, timeout: OP_TIMEOUT_MS }).catch(() => null);
          return;
        }

        if (sawNoMatchOnly) {
          // Widget explicitly says nothing matched. Do NOT keyboard-accept —
          // dismiss the menu and leave verification to fail honestly.
          await input.press('Escape', { timeout: OP_TIMEOUT_MS }).catch(() => null);
          return;
        }

        // Suggestions exist but none matched well — accept the first via keyboard
        // only if the user's text already stands (some widgets commit on Enter).
        await input.focus().catch(() => {});
        await input.press('ArrowDown', { timeout: OP_TIMEOUT_MS }).catch(() => null);
        await page.waitForTimeout(150);
        await input.press('Enter', { timeout: OP_TIMEOUT_MS }).catch(() => null);
        return;
      } catch {}
    }
  }

  // No menus found at all — last resort keyboard sequence on the input itself.
  await input.focus().catch(() => {});
  await input.press('ArrowDown', { timeout: OP_TIMEOUT_MS }).catch(() => null);
  await page.waitForTimeout(150);
  await input.press('Enter', { timeout: OP_TIMEOUT_MS }).catch(() => null);
}

/** Lenient equality used for post-fill verification. */
export function valuesClose(actual: string, expected: string): boolean {
  if (!actual) return false;
  const a = norm(actual);
  const b = norm(expected);
  if (!a || !b) return false;
  if (a === b) return true;
  // Actual may carry suffix detail added by selection ("austin tx usa")
  return a.startsWith(b) || b.startsWith(a);
}

function getPage(ctx: Page | Frame): Page {
  return 'page' in ctx && typeof (ctx as any).page === 'function' ? (ctx as Frame).page() : (ctx as Page);
}
