/**
 * worker/src/plugins/question-resolver.ts
 *
 * UniversalQuestionResolver — detects, answers, and fills custom screening questions
 * and complex form inputs across all ATS plugins (Greenhouse, Lever, Ashby, Workday, etc.).
 *
 * Automatically leverages AI question answering with the candidate's resume and profile,
 * and seamlessly requests structured human intervention if a required question cannot be answered.
 */

import { Frame, Page, Locator } from 'playwright';
import { BrowserSession } from '../browser-session';
import { ExecutionLogger } from '../execution-logger';
import { InterventionReason, QuestionInterventionData, WorkflowContext } from '../types';
import { InterventionError } from './base-plugin';
import { RailwayAPIClient } from '../api-client';
import {
  replaceValue,
  commitContenteditable,
  setSwitchState,
  readSwitchState,
} from '../utils/form-commit';

export interface ExtractedQuestion {
  id: string;
  fieldKey: string;
  label: string;
  type: 'text' | 'textarea' | 'select' | 'radio' | 'checkbox';
  options: string[];
  required: boolean;
  container: Locator;
}

export class UniversalQuestionResolver {
  /**
   * Scan the active form context for custom screening questions,
   * request AI-generated answers, fill them in, and trigger rich user interventions if needed.
   */
  static async resolveAndFillQuestions(
    ctx: Page | Frame,
    browser: BrowserSession,
    context: WorkflowContext,
    logger: ExecutionLogger,
    apiClient?: RailwayAPIClient
  ): Promise<void> {
    const page = browser.page;
    const questions = await this.extractUnfilledQuestions(ctx);

    if (questions.length === 0) {
      return;
    }

    await logger.info(
      'question_resolver_scan',
      `Found ${questions.length} custom/screening question(s) to process`
    );

    // Prepare payload for AI question answering
    const questionsPayload = questions.map((q) => ({
      id: q.id,
      label: q.label,
      type: q.type,
      options: q.options,
      required: q.required,
    }));

    let aiAnswers: Array<{ id: string; answer: string | null; confidence: number; requiresHumanInput: boolean }> = [];

    if (apiClient && context.sessionId) {
      try {
        aiAnswers = await apiClient.answerQuestions(context.sessionId, questionsPayload);
      } catch (err: any) {
        await logger.warn('ai_question_error', `AI question answering service failed: ${err.message}`);
      }
    }

    for (const q of questions) {
      const match = aiAnswers.find((a) => a.id === q.id);
      let answer = match?.answer;
      let requiresHuman = match?.requiresHumanInput || !answer;

      // Profile and customAnswers fallback if AI did not return an answer
      if (!answer) {
        const lowerQ = q.label.toLowerCase();
        const lowerKey = q.fieldKey.toLowerCase();
        const customAnswers = context.userProfile.customAnswers || {};
        const customVal = customAnswers[q.fieldKey] || customAnswers[q.label] || customAnswers[q.label.trim()];

        if (customVal !== undefined && customVal !== null && String(customVal).trim().length > 0) {
          answer = String(customVal).trim();
          requiresHuman = false;
        } else if (/salary|compensation|desired pay|expected pay|pay expectation|target salary/i.test(lowerQ) && context.userProfile.expectedSalary) {
          answer = context.userProfile.expectedSalary;
          requiresHuman = false;
        } else if (/start date|availability|notice period|available to start|when can you start/i.test(lowerQ) && (context.userProfile as any).startDate) {
          answer = (context.userProfile as any).startDate;
          requiresHuman = false;
        } else if (/relocat/i.test(lowerQ) && (context.userProfile as any).willingToRelocate) {
          answer = (context.userProfile as any).willingToRelocate;
          requiresHuman = false;
        } else if (/address\s*(?:line\s*1)?|street\s*address/i.test(lowerQ) || /address\s*line\s*1|street\s*address|address1/i.test(lowerKey)) {
          const addr = context.userProfile.streetAddress || context.userProfile.location;
          if (addr) {
            answer = addr;
            requiresHuman = false;
          }
        } else if (/address\s*line\s*2|apt|suite|unit/i.test(lowerQ) || /address\s*line\s*2|address2/i.test(lowerKey)) {
          answer = context.userProfile.streetAddress2 || '';
          requiresHuman = false;
        } else if (/^city\b|\bcity\b/i.test(lowerQ) || /^city\b/i.test(lowerKey)) {
          const c = context.userProfile.city || (context.userProfile.location ? context.userProfile.location.split(',')[0]?.trim() : '');
          if (c) {
            answer = c;
            requiresHuman = false;
          }
        } else if (/^state\b|\bstate\b|province|region/i.test(lowerQ) || /^state\b/i.test(lowerKey)) {
          const s = context.userProfile.state || (context.userProfile.location ? context.userProfile.location.split(',')[1]?.trim() : '');
          if (s) {
            answer = s;
            requiresHuman = false;
          }
        } else if (/postal|zip\s*code/i.test(lowerQ) || /postal|zip/i.test(lowerKey)) {
          if (context.userProfile.postalCode) {
            answer = context.userProfile.postalCode;
            requiresHuman = false;
          }
        } else if (/^country\b|\bcountry\b/i.test(lowerQ) || /^country\b/i.test(lowerKey)) {
          answer = context.userProfile.country || 'United States';
          requiresHuman = false;
        } else if (/first\s*name/i.test(lowerQ) || /first\s*name/i.test(lowerKey)) {
          answer = context.userProfile.name?.split(' ')[0] || '';
          if (answer) requiresHuman = false;
        } else if (/last\s*name/i.test(lowerQ) || /last\s*name/i.test(lowerKey)) {
          answer = context.userProfile.name?.split(' ').slice(1).join(' ') || '';
          if (answer) requiresHuman = false;
        } else if (/phone|mobile|tel/i.test(lowerQ) || /phone|mobile/i.test(lowerKey)) {
          if (context.userProfile.phone) {
            answer = context.userProfile.phone;
            requiresHuman = false;
          }
        } else if (/email/i.test(lowerQ) || /email/i.test(lowerKey)) {
          if (context.userProfile.email) {
            answer = context.userProfile.email;
            requiresHuman = false;
          }
        } else if (/linkedin/i.test(lowerQ) || /linkedin/i.test(lowerKey)) {
          if (context.userProfile.linkedinUrl) {
            answer = context.userProfile.linkedinUrl;
            requiresHuman = false;
          }
        } else if (/website|portfolio/i.test(lowerQ) || /website|portfolio/i.test(lowerKey)) {
          if (context.userProfile.websiteUrl) {
            answer = context.userProfile.websiteUrl;
            requiresHuman = false;
          }
        } else if (/authorized to work|work authorization/i.test(lowerQ)) {
          answer = context.userProfile.usWorkAuthorization === 'No' ? 'No' : 'Yes';
          requiresHuman = false;
        } else if (/require sponsorship|visa sponsorship/i.test(lowerQ)) {
          answer = context.userProfile.visaSponsorship === 'Yes' ? 'Yes' : 'No';
          requiresHuman = false;
        }
      }

      if (answer) {
        const filled = await this.fillSingleQuestion(ctx, q, answer, logger);
        if (filled) {
          await logger.info(
            'question_answered_ai',
            `Answered question (${q.type}): "${q.label.slice(0, 60)}" -> "${answer.slice(0, 40)}..."`
          );
          continue;
        }
      }

      // If answer failed or requires human input
      if (q.required || requiresHuman) {
        await logger.warn(
          'question_requires_input',
          `Required custom question could not be answered automatically: "${q.label.slice(0, 80)}"`
        );

        const questionData: QuestionInterventionData = {
          fieldKey: q.fieldKey,
          label: q.label,
          fieldType: q.type,
          options: q.options.length > 0 ? q.options : undefined,
          required: q.required,
        };

        throw new InterventionError(
          InterventionReason.UNKNOWN_QUESTION,
          `[QUESTION_DATA:${JSON.stringify(questionData)}] Application question requires your input: "${q.label.slice(0, 100)}"`,
          page.url()
        );
      }
    }
  }

  /**
   * Extract all interactive question fields from the form container.
   */
  private static async extractUnfilledQuestions(ctx: Page | Frame): Promise<ExtractedQuestion[]> {
    const extracted: ExtractedQuestion[] = [];

    // Common containers across Greenhouse, Lever, Ashby, Workday, SmartRecruiters, etc.
    const containerSelectors = [
      '.field-wrapper',
      '.field',
      '.custom-field',
      '.application-question',
      '.application--questions > div',
      '[data-automation-id*="formField"]',
      'div.select',
      '.form-group',
      '.form-field',
      '.question',
      // Workday
      '[data-automation-id*="questionItem"], [data-automation-id="checkbox"], [data-automation-id*="radioGroup"]',
      // Greenhouse / Lever / Ashby
      '.application-field, .field-wrapper-b, li.application-question-item, .custom-question, .fields > .field',
      // Phenom People (ph- prefixed widgets)
      '[class*="ph-form-field"], [class*="Phenom__FieldWrapper"], [class*="legal-section"] div:has(> input), div[aria-label*="question" i]',
      // SmartRecruiters
      '.smrte-application-question, [data-test*="question" i], [data-testid*="question" i]',
      // iCIMS / Taleo / Oracle
      '[class*="icims"] [class*="question"], tr[id*="question"], .ORCQUESTIONLABELWRAP > *, [class*="taleo"] .question-row',
    ];

    const containers = await ctx.locator(containerSelectors.join(', ')).all();

    let qIndex = 0;
    for (const container of containers) {
      const isVisible = await container.isVisible().catch(() => false);
      if (!isVisible) continue;

      // Ignore containers inside cookie banners, privacy dialogs, or nav/footer
      const isInsideObstruction = await container.evaluate((el) => {
        return !!el.closest(
          '#onetrust-consent-sdk, #onetrust-banner-sdk, [id*="cookie" i], [class*="cookie" i], [aria-label*="cookie" i], [data-ui*="cookie" i], [class*="consent" i], [id*="consent" i], .didomi-popup-container, [id*="didomi" i], [class*="cookiebot" i], [id*="CybotCookiebot" i], [id*="usercentrics" i], [class*="privacy-banner" i], [id*="privacy-banner" i], header, nav, footer, [role="banner"], [role="navigation"], [role="contentinfo"], .footer, #footer, .header, #header, [class*="newsletter" i], [id*="newsletter" i]'
        );
      }).catch(() => false);
      if (isInsideObstruction) continue;

      // Extract label
      const labelEl = container.locator('label, legend, .field-label, .question-label, h3, h4, .text').first();
      let label = '';
      if (await labelEl.count() > 0) {
        label = (await labelEl.textContent({ timeout: 1000 }).catch(() => ''))?.trim() ?? '';
      }
      if (!label) {
        label = (await container.textContent({ timeout: 800 }).catch(() => ''))?.trim() ?? '';
      }
      if (!label || label.length < 3) continue;

      const lowerLabel = label.toLowerCase();

      // Skip cookie settings, privacy preferences, and legal disclaimers
      if (
        /cookie|cookies|privacy\s*preference|consent\s*preference|cookie\s*setting|strictly\s*necessary|targeting\s*cookies|functional\s*cookies|performance\s*cookies|analytics\s*cookies|manage\s*consent|privacy\s*choices|advertising\s*preferences|gdpr|ccpa|terms\s*of\s*service|privacy\s*policy/i.test(lowerLabel)
      ) {
        continue;
      }

      // Skip standard personal contact fields already handled by main plugins
      if (
        /^(first|last)\s*name/i.test(lowerLabel) ||
        /^email/i.test(lowerLabel) ||
        /^phone/i.test(lowerLabel) ||
        /^resume/i.test(lowerLabel) ||
        /^cover\s*letter/i.test(lowerLabel) ||
        /^linkedin/i.test(lowerLabel) ||
        /^website/i.test(lowerLabel) ||
        /^portfolio/i.test(lowerLabel) ||
        /^github/i.test(lowerLabel)
      ) {
        continue;
      }

      const isRequired =
        label.includes('*') ||
        (await container.locator('[aria-required="true"], [required], .required').count().catch(() => 0)) > 0;

      // Clean display label
      const cleanLabel = label.replace(/\*/g, '').replace(/\s+/g, ' ').trim();

      // Check field types:
      // 1. Textarea
      const textarea = container.locator('textarea').first();
      if (await textarea.count() > 0 && (await textarea.isVisible().catch(() => false))) {
        const val = (await textarea.inputValue().catch(() => ''))?.trim();
        if (!val) {
          qIndex++;
          extracted.push({
            id: `q_${qIndex}`,
            fieldKey: (await textarea.getAttribute('name')) || (await textarea.getAttribute('id')) || `textarea_${qIndex}`,
            label: cleanLabel,
            type: 'textarea',
            options: [],
            required: isRequired,
            container,
          });
          continue;
        }
      }

      // 1.5 Contenteditable rich-text editors (Greenhouse job boards, Workday, custom Quill/TinyMCE/ProseMirror)
      const richText = container.locator('[contenteditable="true"], [contenteditable=""]').first();
      if (await richText.count() > 0 && (await richText.isVisible().catch(() => false))) {
        const richTextContent = ((await richText.textContent().catch(() => '')) || '').trim();
        if (!richTextContent) {
          qIndex++;
          extracted.push({
            id: `q_${qIndex}`,
            fieldKey: (await richText.getAttribute('name')) || (await richText.getAttribute('aria-label')) || `richtext_${qIndex}`,
            label: cleanLabel,
            type: 'textarea',
            options: [],
            required: isRequired,
            container,
          });
          continue;
        }
      }

      // 2. Dropdowns: Native select or React Select / custom combobox
      const nativeSelect = container.locator('select').first();
      const reactSelect = container.locator('.select__control, .select-shell, input.select__input, [role="combobox"]').first();

      if (await nativeSelect.count() > 0 && (await nativeSelect.isVisible().catch(() => false))) {
        const val = await nativeSelect.inputValue().catch(() => '');
        const options = await nativeSelect.locator('option').allTextContents().catch(() => []);
        const filteredOptions = options.map((o) => o.trim()).filter((o) => o && !/select|choose|please/i.test(o));

        if (!val || val === '' || val === '0') {
          qIndex++;
          extracted.push({
            id: `q_${qIndex}`,
            fieldKey: (await nativeSelect.getAttribute('name')) || (await nativeSelect.getAttribute('id')) || `select_${qIndex}`,
            label: cleanLabel,
            type: 'select',
            options: filteredOptions,
            required: isRequired,
            container,
          });
          continue;
        }
      } else if (await reactSelect.count() > 0 && (await reactSelect.isVisible().catch(() => false))) {
        const text = (await container.textContent().catch(() => ''))?.toLowerCase() || '';
        // If it still says "select..." or "select a country"
        if (text.includes('select...') || text.includes('select a country') || text.includes('choose...')) {
          qIndex++;
          extracted.push({
            id: `q_${qIndex}`,
            fieldKey: (await reactSelect.getAttribute('name')) || `react_select_${qIndex}`,
            label: cleanLabel,
            type: 'select',
            options: [],
            required: isRequired,
            container,
          });
          continue;
        }
      }

      // 3. Radio buttons
      const radios = container.locator('input[type="radio"]');
      const radioCount = await radios.count().catch(() => 0);
      if (radioCount > 0) {
        let isChecked = false;
        for (let i = 0; i < radioCount; i++) {
          if (await radios.nth(i).isChecked().catch(() => false)) {
            isChecked = true;
            break;
          }
        }
        if (!isChecked) {
          const radioLabels = await container.locator('label').allTextContents().catch(() => []);
          const options = radioLabels.map((r) => r.trim()).filter((r) => r && r !== cleanLabel);

          qIndex++;
          extracted.push({
            id: `q_${qIndex}`,
            fieldKey: (await radios.first().getAttribute('name')) || `radio_${qIndex}`,
            label: cleanLabel,
            type: 'radio',
            options: options.length > 0 ? options : ['Yes', 'No'],
            required: isRequired,
            container,
          });
          continue;
        }
      }

      // 3.5 Checkboxes & ARIA switches (single consent-style or yes/no toggle controls)
      const checkbox = container.locator('input[type="checkbox"]').first();
      const ariaSwitch = container.locator('[role="switch"], [aria-checked]').first();
      const hasCheckbox = await checkbox.count() > 0 && !(await checkbox.isChecked().catch(() => true));
      const hasAriaSwitch = !hasCheckbox && await ariaSwitch.count() > 0 &&
        (await readSwitchState(ariaSwitch).catch(() => null)) === false;
      if (hasCheckbox || hasAriaSwitch) {
        qIndex++;
        extracted.push({
          id: `q_${qIndex}`,
          fieldKey: hasCheckbox
            ? ((await checkbox.getAttribute('name')) || (await checkbox.getAttribute('id')) || `checkbox_${qIndex}`)
            : `switch_${qIndex}`,
          label: cleanLabel,
          type: 'checkbox',
          options: [],
          required: isRequired,
          container,
        });
        continue;
      }

      // 4. Text input
      const textInput = container.locator('input[type="text"], input[type="url"], input[type="tel"], input:not([type])').first();
      if (await textInput.count() > 0 && (await textInput.isVisible().catch(() => false))) {
        const val = (await textInput.inputValue().catch(() => ''))?.trim();
        if (!val) {
          qIndex++;
          extracted.push({
            id: `q_${qIndex}`,
            fieldKey: (await textInput.getAttribute('name')) || (await textInput.getAttribute('id')) || `text_${qIndex}`,
            label: cleanLabel,
            type: 'text',
            options: [],
            required: isRequired,
            container,
          });
          continue;
        }
      }
    }

    return extracted;
  }

  /**
   * Fill a single question with the given answer string.
   */
  private static async fillSingleQuestion(
    ctx: Page | Frame,
    question: ExtractedQuestion,
    answer: string,
    logger: ExecutionLogger
  ): Promise<boolean> {
    const container = question.container;

    try {
      if (question.type === 'textarea') {
        const textarea = container.locator('textarea').first();
        if (await textarea.count() > 0) {
          await textarea.click().catch(() => null);
          await replaceValue(textarea, answer);
          return true;
        }
        // Contenteditable rich-text editor fallback (Quill, TinyMCE, ProseMirror)
        const richText = container.locator('[contenteditable="true"], [contenteditable=""]').first();
        if (await richText.count() > 0) {
          await commitContenteditable(richText, answer);
          return true;
        }
      } else if (question.type === 'checkbox') {
        const checkbox = container.locator('input[type="checkbox"]').first();
        if (await checkbox.count() > 0) {
          if ((await checkbox.isChecked().catch(() => false)) === false) {
            await checkbox.check({ force: true }).catch(() => null);
          }
          return true;
        }
        // ARIA switch / toggle (Material, Chakra, Workday custom widgets)
        const ariaSwitch = container.locator('[role="switch"], [aria-checked]').first();
        if (await ariaSwitch.count() > 0) {
          const result = await setSwitchState(ariaSwitch, true);
          return result === true;
        }
      } else if (question.type === 'text') {
        const input = container.locator('input[type="text"], input[type="url"], input[type="tel"], input:not([type])').first();
        if (await input.count() > 0) {
          await input.click().catch(() => null);
          await replaceValue(input, answer);

          // Handle autocomplete dropdowns (e.g. Location, City, Country, Address)
          const page = 'page' in ctx && typeof (ctx as any).page === 'function' ? (ctx as Frame).page() : (ctx as Page);
          await page.waitForTimeout(400);

          const isLocationOrAutocomplete =
            /location|city|address|state|country|region|place/i.test(question.label) ||
            (await input.getAttribute('role').catch(() => '')) === 'combobox' ||
            (await input.getAttribute('aria-autocomplete').catch(() => '')) !== null;

          if (isLocationOrAutocomplete) {
            // 1. Check if dropdown options appeared on the page/container
            const suggestionSelectors = [
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

            let clickedSuggestion = false;
            for (const sSel of suggestionSelectors) {
              try {
                const opt = page.locator(sSel).first();
                if ((await opt.count().catch(() => 0)) > 0 && (await opt.isVisible().catch(() => false))) {
                  await opt.click().catch(() => null);
                  clickedSuggestion = true;
                  await page.waitForTimeout(200);
                  break;
                }
              } catch {}
            }

            // 2. If no suggestion clicked directly, send ArrowDown + Enter
            if (!clickedSuggestion) {
              await input.press('ArrowDown').catch(() => null);
              await page.waitForTimeout(150);
              await input.press('Enter').catch(() => null);
              await page.waitForTimeout(200);
            }
          }

          return true;
        }
      } else if (question.type === 'select') {
        const nativeSelect = container.locator('select').first();
        if (await nativeSelect.count() > 0) {
          const options = await nativeSelect.locator('option').all();
          for (const opt of options) {
            const text = (await opt.textContent())?.trim().toLowerCase() ?? '';
            if (text.includes(answer.toLowerCase()) || answer.toLowerCase().includes(text)) {
              const val = await opt.getAttribute('value');
              if (val) {
                await nativeSelect.selectOption(val);
                return true;
              }
            }
          }
        } else {
          // React Select
          const control = container.locator('.select__control, .select-shell').first();
          const reactInput = container.locator('input.select__input, input[role="combobox"]').first();
          const page = 'page' in ctx && typeof (ctx as any).page === 'function' ? (ctx as Frame).page() : (ctx as Page);

          if (await control.count() > 0 || await reactInput.count() > 0) {
            if (await control.count() > 0) await control.click().catch(() => null);
            await page.waitForTimeout(200);

            if (await reactInput.count() > 0) {
              await reactInput.focus().catch(() => null);
              await replaceValue(reactInput, answer);
              await reactInput.press('Enter');
              await page.waitForTimeout(300);
            }

            // Click option in popup if visible
            const optionItem = page.locator('.select__option, [id*="-option-"]').filter({ hasText: new RegExp(answer, 'i') }).first();
            if (await optionItem.count() > 0 && await optionItem.isVisible().catch(() => false)) {
              await optionItem.click().catch(() => null);
            }
            return true;
          }
        }
      } else if (question.type === 'radio') {
        const radioLabels = await container.locator('label').all();
        for (const rLabel of radioLabels) {
          const text = (await rLabel.textContent())?.trim().toLowerCase() ?? '';
          if (text.includes(answer.toLowerCase()) || answer.toLowerCase().includes(text)) {
            await rLabel.click().catch(() => null);
            return true;
          }
        }

        const radios = await container.locator('input[type="radio"]').all();
        for (const radio of radios) {
          const val = (await radio.getAttribute('value'))?.toLowerCase() ?? '';
          if (val && (val.includes(answer.toLowerCase()) || answer.toLowerCase().includes(val))) {
            await radio.check({ force: true }).catch(() => null);
            return true;
          }
        }
      }
    } catch (err: any) {
      await logger.warn('fill_question_error', `Failed to populate ${question.type} question: ${err.message}`);
    }

    return false;
  }
}
