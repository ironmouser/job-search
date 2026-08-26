/**
 * worker/test/demographic-interventions.test.ts
 *
 * Automated verification that:
 * 1. Demographic questions (sexual orientation, transgender, gender identity, pronouns, etc.)
 *    are accurately detected.
 * 2. If the user does not have answers saved in userProfile / customAnswers,
 *    the bot triggers an intervention rather than guessing or answering.
 * 3. The intervention payload preserves exact field types ('select', 'radio') and options.
 * 4. When answers ARE provided in customAnswers / profile, the bot fills them accurately.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { chromium, Browser } from 'playwright';
import * as http from 'http';
import * as path from 'path';
import { readFileSync } from 'fs';
import { UniversalQuestionResolver, isDemographicQuestion } from '../src/plugins/question-resolver';
import { BrowserSession } from '../src/browser-session';
import { ExecutionLogger } from '../src/execution-logger';
import { WorkflowContext, InterventionReason } from '../src/types';
import { InterventionError } from '../src/plugins/base-plugin';

const FIXTURE_PATH = path.join(__dirname, 'fixtures', 'demographic-questions.html');

describe('Demographic question detection & intervention flow', () => {
  let browser: Browser;
  let server: http.Server;
  let baseUrl: string;

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

  describe('isDemographicQuestion classification unit tests', () => {
    it('correctly identifies sexual orientation questions', () => {
      assert.strictEqual(isDemographicQuestion('What is your sexual orientation?'), true);
      assert.strictEqual(isDemographicQuestion('Sexual Orientation (Optional)'), true);
      assert.strictEqual(isDemographicQuestion('Sexual Identity'), true);
      assert.strictEqual(isDemographicQuestion('Sexuality', 'sexual_orientation'), true);
    });

    it('correctly identifies transgender and gender identity questions', () => {
      assert.strictEqual(isDemographicQuestion('Do you identify as transgender?'), true);
      assert.strictEqual(isDemographicQuestion('Transgender Status'), true);
      assert.strictEqual(isDemographicQuestion('Gender Identity'), true);
      assert.strictEqual(isDemographicQuestion('Gender Expression'), true);
      assert.strictEqual(isDemographicQuestion('Cisgender or Transgender'), true);
    });

    it('correctly identifies pronouns questions', () => {
      assert.strictEqual(isDemographicQuestion('Preferred Pronouns'), true);
      assert.strictEqual(isDemographicQuestion('What are your pronouns?'), true);
      assert.strictEqual(isDemographicQuestion('Pronouns'), true);
    });

    it('correctly identifies race and ethnicity questions', () => {
      assert.strictEqual(isDemographicQuestion('Race / Ethnicity'), true);
      assert.strictEqual(isDemographicQuestion('Are you of Hispanic or Latino origin?'), true);
      assert.strictEqual(isDemographicQuestion('Racial background'), true);
    });

    it('correctly identifies veteran and disability questions', () => {
      assert.strictEqual(isDemographicQuestion('Protected Veteran Status'), true);
      assert.strictEqual(isDemographicQuestion('Voluntary Self-Identification of Disability'), true);
      assert.strictEqual(isDemographicQuestion('Do you have a physical or mental impairment?'), true);
    });

    it('does not falsely classify standard non-demographic application questions', () => {
      assert.strictEqual(isDemographicQuestion('Years of experience with React'), false);
      assert.strictEqual(isDemographicQuestion('What is your desired salary?'), false);
      assert.strictEqual(isDemographicQuestion('Are you willing to relocate?'), false);
      assert.strictEqual(isDemographicQuestion('Earliest available start date'), false);
      assert.strictEqual(isDemographicQuestion('First Name'), false);
      assert.strictEqual(isDemographicQuestion('Lead generation experience'), false);
    });
  });

  describe('Intervention trigger when demographic answers are missing', () => {
    it('triggers intervention containing exact ATS form controls and options', async () => {
      const page = await browser.newPage();
      await page.goto(`${baseUrl}/apply`);
      const session = Object.create(BrowserSession.prototype) as BrowserSession;
      Object.defineProperty(session, 'page', { get: () => page });

      const logs: Array<{ event: string; message: string }> = [];
      const context: WorkflowContext = {
        sessionId: 'test-demo-session',
        userProfile: {
          name: 'Jane Doe',
          email: 'jane.doe@example.com',
          phone: '+1 555 123 4567',
          customAnswers: {
            'Years of Experience with TypeScript *': '5',
          },
        },
      } as unknown as WorkflowContext;

      let caughtError: any = null;
      try {
        await UniversalQuestionResolver.resolveAndFillQuestions(
          page,
          session,
          context,
          {
            info: async (event: string, message: string) => logs.push({ event, message }),
            warn: async (event: string, message: string) => logs.push({ event, message }),
          } as unknown as ExecutionLogger
        );
      } catch (err) {
        caughtError = err;
      }

      assert.ok(caughtError, 'Expected InterventionError to be thrown');
      assert.strictEqual(caughtError instanceof InterventionError, true);
      assert.strictEqual(caughtError.reason, InterventionReason.UNKNOWN_QUESTION);

      // Verify QUESTION_DATA JSON payload format
      const match = caughtError.description.match(/\[QUESTION_DATA:(.*?)\]/);
      assert.ok(match, 'Error description must include [QUESTION_DATA:...] payload');
      const questionData = JSON.parse(match[1]);
      assert.ok(Array.isArray(questionData), 'QUESTION_DATA must be an array of fields');

      // Check that sexual orientation field is captured with type 'select' and all options
      const sexualOrientationField = questionData.find((q: any) => /sexual orientation/i.test(q.label));
      assert.ok(sexualOrientationField, 'Sexual orientation question must be present in intervention');
      assert.strictEqual(sexualOrientationField.fieldType, 'select');
      assert.ok(sexualOrientationField.options.includes('Heterosexual / Straight'));
      assert.ok(sexualOrientationField.options.includes('Gay / Lesbian'));
      assert.ok(sexualOrientationField.options.includes('Prefer not to say'));

      // Check that transgender field is captured with type 'radio' and all options
      const transgenderField = questionData.find((q: any) => /transgender/i.test(q.label));
      assert.ok(transgenderField, 'Transgender question must be present in intervention');
      assert.strictEqual(transgenderField.fieldType, 'radio');
      assert.ok(transgenderField.options.includes('Yes'));
      assert.ok(transgenderField.options.includes('No'));
      assert.ok(transgenderField.options.includes('Decline to state'));

      // Check that gender identity field is captured with type 'select' and options
      const genderIdentityField = questionData.find((q: any) => /gender identity/i.test(q.label));
      assert.ok(genderIdentityField, 'Gender identity question must be present in intervention');
      assert.strictEqual(genderIdentityField.fieldType, 'select');
      assert.ok(genderIdentityField.options.includes('Non-binary'));

      await page.close();
    });

    it('fills demographic questions automatically when answers are present in customAnswers', async () => {
      const page = await browser.newPage();
      await page.goto(`${baseUrl}/apply`);
      const session = Object.create(BrowserSession.prototype) as BrowserSession;
      Object.defineProperty(session, 'page', { get: () => page });

      const logs: Array<{ event: string; message: string }> = [];
      const context: WorkflowContext = {
        sessionId: 'test-demo-session-2',
        userProfile: {
          name: 'Jane Doe',
          email: 'jane.doe@example.com',
          phone: '+1 555 123 4567',
          customAnswers: {
            'What is your sexual orientation? *': 'Heterosexual / Straight',
            'Do you identify as transgender? *': 'No',
            'Gender Identity *': 'Woman',
            'Preferred Pronouns': 'she/her',
            'Years of Experience with TypeScript *': '5',
          },
        },
      } as unknown as WorkflowContext;

      await UniversalQuestionResolver.resolveAndFillQuestions(
        page,
        session,
        context,
        {
          info: async (event: string, message: string) => logs.push({ event, message }),
          warn: async (event: string, message: string) => logs.push({ event, message }),
        } as unknown as ExecutionLogger
      );

      // Verify all fields got filled correctly
      const orientationVal = await page.$eval('#sexual-orientation', (el: any) => el.value);
      assert.strictEqual(orientationVal, 'Heterosexual / Straight');

      const transgenderChecked = await page.$eval('input[name="transgender_status"][value="No"]', (el: any) => el.checked);
      assert.strictEqual(transgenderChecked, true);

      const genderVal = await page.$eval('#gender-identity', (el: any) => el.value);
      assert.strictEqual(genderVal, 'Woman');

      const pronounsVal = await page.$eval('#pronouns', (el: any) => el.value);
      assert.strictEqual(pronounsVal, 'she/her');

      const expVal = await page.$eval('#years-exp', (el: any) => el.value);
      assert.strictEqual(expVal, '5');

      await page.close();
    });
  });
});
