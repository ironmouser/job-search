/**
 * worker/test/question-resolver-shapes.test.ts
 *
 * Local validation for the multi-checkbox group and date input support added
 * in commit 59eb657. Runs UniversalQuestionResolver against a local fixture
 * page covering all three new shapes plus negative controls:
 *
 *   1. Multi-select checkbox group  -> extracted as type 'text' with options,
 *      fill path checks exactly the boxes matching a comma-separated answer.
 *   2. Native <input type="date">   -> extracted when empty, filled with ISO.
 *   3. Placeholder-masked MM/DD/YYYY-> extracted when empty, normalized to
 *      slash format via toSlashDate().
 *
 * Controls verify no false-positive extraction of already-filled or
 * unrelated checkboxes/dates, and that React-style controlled inputs only
 * accept framework-safe commits (state must actually update).
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { chromium, Browser } from 'playwright';
import * as http from 'http';
import * as path from 'path';
import { readFileSync } from 'fs';
import { UniversalQuestionResolver } from '../src/plugins/question-resolver';
import { BrowserSession } from '../src/browser-session';
import { ExecutionLogger } from '../src/execution-logger';
import { WorkflowContext } from '../src/types';
import { toISODate, toSlashDate } from '../src/utils/form-commit';

const FIXTURE_PATH = path.join(__dirname, 'fixtures', 'question-resolver-shapes.html');

describe('Question resolver: multi-checkbox groups and date inputs', () => {
  let browser: Browser;
  let server: http.Server;
  let baseUrl: string;
  let logs: Array<{ event: string; message: string }>;

  before(async () => {
    browser = await chromium.launch({ headless: true });

    server = http.createServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(readFileSync(FIXTURE_PATH));
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const addr = server.address() as { port: number };
    baseUrl = `http://127.0.0.1:${addr.port}`;
  });

  after(async () => {
    await browser?.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  // ---------- Date normalization helpers ----------

  it('toISODate normalizes free-form dates to ISO', () => {
    assert.strictEqual(toISODate('2026-03-05'), '2026-03-05');
    assert.strictEqual(toISODate('03/05/2026'), '2026-03-05');       // US MM/DD
    assert.strictEqual(toISODate('25/03/2026'), '2026-03-25');        // DD/MM fallback
    assert.strictEqual(toISODate('March 3, 2026'), '2026-03-03');
    assert.strictEqual(toISODate('3-5-26'), '2026-03-05');            // two-digit year
    assert.strictEqual(toISODate('not a date'), null);
  });

  it('toSlashDate converts ISO to MM/DD/YYYY', () => {
    assert.strictEqual(toSlashDate('2026-11-09'), '11/09/2026');
    assert.strictEqual(toSlashDate('garbage'), null);
  });

  it('toISODate output round-trips through toSlashDate', () => {
    for (const input of ['03/05/2026', 'March 3, 2026', '2026-12-31']) {
      const iso = toISODate(input);
      assert.ok(iso);
      assert.strictEqual(toSlashDate(iso), `${iso.slice(5, 7)}/${iso.slice(8, 10)}/${iso.slice(0, 4)}`);
    }
  });

  // ---------- Full resolver flow against the fixture page ----------

  describe('against fixture page', () => {
    let session: BrowserSession;
    let context: ReturnType<typeof makeContext>;

    before(async () => {
      const page = await browser.newPage();
      await page.goto(`${baseUrl}/apply`);
      session = Object.create(BrowserSession.prototype) as BrowserSession;
      Object.defineProperty(session, 'page', { get: () => page });
      logs = [];
      context = makeContext();
    });

    async function runResolver() {
      return UniversalQuestionResolver.resolveAndFillQuestions(
        session.page,
        session,
        context as unknown as WorkflowContext,
        {
          info: async (event: string, message: string) => logs.push({ event, message }),
          warn: async (event: string, message: string) => logs.push({ event, message }),
        } as unknown as ExecutionLogger,
        undefined // no apiClient -> exercises profile/customAnswers fallbacks
      );
    }

    async function checkedValues(name: string): Promise<string[]> {
      return session.page.$$eval(
        `input[type="checkbox"][name="${name}"]:checked`,
        (els) => els.map((el) => (el as HTMLInputElement).value)
      );
    }

    // Group boxes may carry different name attrs per option (real ATS behavior),
    // so query the whole fieldset rather than one name.
    async function groupBoxStates(): Promise<Record<string, boolean>> {
      return session.page.$$eval(
        '.field-wrapper input[name="scheduling_tools"], .field-wrapper input[name="multicheck"]',
        (els) => Object.fromEntries(els.map((el) => [
          (el as HTMLInputElement).value,
          (el as HTMLInputElement).checked,
        ]))
      );
    }

    it('extracts and fills all three new shapes; skips controls', async () => {
      await runResolver();

      // 1. Multi-checkbox group: exactly the matched boxes are checked
      const states = await groupBoxStates();
      assert.deepStrictEqual(states, { cron: true, temporal: false, airflow: true, quartz: true });

      // 2. Native date: committed in ISO and reflected in component state
      assert.strictEqual(await session.page.inputValue('#earliest-start'), '2026-04-01');

      const state = await session.page.evaluate(() => (window as any).__filled);
      assert.ok(state, 'change handler should have recorded commits');
      assert.strictEqual(state.start_date, '2026-04-01');

      // 3. Placeholder-masked date: normalized to slash format
      assert.strictEqual(await session.page.inputValue('#last-review'), '02/15/2026');
      assert.strictEqual(state.last_review_date, '02/15/2026');

      // Control: pre-checked single consent checkbox is left untouched by
      // the group fill (not treated as part of the multi-select group)
      assert.deepStrictEqual(await checkedValues('relocation_consent'), ['yes']);

      // Controls: prefilled dates were not re-extracted or overwritten
      assert.strictEqual(await session.page.inputValue('#birth-date'), '1992-06-15');
      assert.strictEqual(await session.page.inputValue('#grad-date'), '05/20/2018');

      // Sanity: resolver reported answering the expected questions
      const answered = logs.filter((l) => l.event === 'question_answered_ai').map((l) => l.message).join('\n');
      assert.match(answered, /scheduling tools/i);
      assert.match(answered, /start date/i);
      assert.match(answered, /performance review/i);
    });

    it('does not throw when nothing is left unfilled on second pass', async () => {
      logs = [];
      await runResolver(); // everything already filled -> zero questions found
      const scan = logs.find((l) => l.event === 'question_resolver_scan');
      assert.strictEqual(scan, undefined, 'no questions should be extracted on second pass');
    });
  });
});

// ---------- Test doubles ----------

function makeContext(): { userProfile: Record<string, unknown>; sessionId: string } {
  return {
    sessionId: 'test-session',
    userProfile: {
      name: 'Kurt Charles',
      email: 'kurt.charles@example.com',
      phone: '+1 512 555 0100',
      customAnswers: {
        'Which scheduling tools have you used? (select all that apply)': 'Cron, Apache Airflow, Quartz Scheduler',
        'Earliest start date': 'April 1, 2026',
        'Date of last performance review': 'February 15, 2026',
        'Portfolio URL': 'https://kurtcharles.dev',
      },
    },
  };
}
