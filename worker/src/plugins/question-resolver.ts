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
  toISODate,
  toSlashDate,
} from '../utils/form-commit';
import { valuesClose } from '../utils/typeahead';
import { StagehandFallback } from '../generic-agent/stagehand-fallback';
import {
  isTransgenderOrGenderIdentityQuestion,
  isOptionTransgender,
  isOptionCisgender,
  matchesOptionSafely,
  US_STATES,
  COMMON_COUNTRIES,
  US_STATE_OPTIONS,
  normalizeStateName,
  normalizeStateAbbr,
  isStateMatch,
  isCountryMatch,
  resolveHispanicEthnicityAnswer,
} from '../utils/demographic-matching';

export {
  isTransgenderOrGenderIdentityQuestion,
  isOptionTransgender,
  isOptionCisgender,
  matchesOptionSafely,
  resolveHispanicEthnicityAnswer,
  US_STATES,
  COMMON_COUNTRIES,
  US_STATE_OPTIONS,
  normalizeStateName,
  normalizeStateAbbr,
  isStateMatch,
  isCountryMatch,
};

export interface ExtractedQuestion {
  id: string;
  fieldKey: string;
  label: string;
  type: 'text' | 'textarea' | 'select' | 'radio' | 'checkbox' | 'date';
  options: string[];
  required: boolean;
  container: Locator;
}

/**
 * A field the bot could not fill or verify, surfaced to the user in a single
 * batched intervention. The intervention panel mirrors these fields as inputs
 * so the user can answer them all at once before automation resumes.
 */
export interface UnansweredFieldData {
  fieldKey?: string;
  label: string;
  fieldType: 'text' | 'textarea' | 'select' | 'radio' | 'checkbox' | 'date';
  options?: string[];
  required?: boolean;
  /** Best-guess answer the bot would have used (pre-filled for the user to confirm/correct). */
  suggestedAnswer?: string;
}

/**
 * Detect if a question is a demographic / EEOC / voluntary self-identification question.
 * The bot MUST NOT guess or assume answers for these questions.
 */
export function isDemographicQuestion(label: string, fieldKey?: string): boolean {
  const text = `${label} ${fieldKey || ''}`.toLowerCase();

  // Sexual orientation / sexuality
  if (/sexual\s*(?:orientation|identity|preference)|sexuality/i.test(text)) return true;

  // Transgender / gender identity / cisgender
  if (isTransgenderOrGenderIdentityQuestion(label, fieldKey)) return true;

  // Pronouns
  if (/\bpronouns?\b|preferred\s*pronouns/i.test(text)) return true;

  // Gender / Sex (exclude words like 'generation', 'general', 'section')
  if (/\b(?:gender|sex|biological\s*sex)\b/i.test(text) && !/generation|general|section/i.test(text)) return true;

  // Race / Ethnicity / Hispanic / Latino
  if (/\b(?:race|ethnicity|hispanic|latino|latina|latinx|racial|ethnic)\b/i.test(text)) return true;

  // Veteran / Military
  if (/\b(?:veteran|military\s*status|protected\s*veteran|armed\s*forces|active\s*duty)\b/i.test(text)) return true;

  // Disability
  if (/\b(?:disability|impairment|handicap)\b|special\s*accommodations?/i.test(text)) return true;

  // General EEOC / Self-ID / Diversity
  if (/\b(?:eeoc|eeo)\b|voluntary\s*self[-\s]*identification|self[-\s]*identify|diversity\s*(?:&|and)\s*inclusion/i.test(text)) return true;

  return false;
}

/**
 * Detect if a question label implies selection / dropdown choices (e.g. Work authorization, EEOC, relocation, Country, State, Yes/No).
 */
export function isSemanticDropdownQuestion(label: string): boolean {
  const text = label.toLowerCase();
  return (
    /authorized|eligible to work|legally permitted|legal right to work/i.test(text) ||
    /sponsorship|require.*visa|visa.*sponsor/i.test(text) ||
    /gender|sex\b/i.test(text) ||
    /race|ethnicity|ethnic/i.test(text) ||
    /veteran/i.test(text) ||
    /disability|handicap/i.test(text) ||
    /relocate|relocation/i.test(text) ||
    /willing to travel/i.test(text) ||
    /highest.*education|degree\b/i.test(text) ||
    /years of experience|how many years/i.test(text) ||
    /^country\b|\bcountry\b/i.test(text) ||
    /^state\b|\bstate\b|province|region|u\.s\.\s*state/i.test(text) ||
    /^(?:are you|do you|will you|have you)\b/i.test(text.trim()) ||
    /\b(?:select one|please select|choose one)\b/i.test(text)
  );
}

/**
 * Return comprehensive semantic dropdown options for common application questions.
 */
export function getSemanticDropdownOptions(label: string): string[] {
  const text = label.toLowerCase();

  // Country
  if (/^country\b|\bcountry\b/i.test(text)) {
    return COMMON_COUNTRIES;
  }

  // U.S. State / Province / Region
  if (/^state\b|\bstate\b|province|region|u\.s\.\s*state|which.*state/i.test(text)) {
    return US_STATE_OPTIONS;
  }

  // Work authorization
  if (/authorized|eligible to work|legally permitted|legal right to work/i.test(text)) {
    return [
      'Yes, I am authorized to work in the United States',
      'No, I am not authorized to work in the United States',
      'Yes',
      'No',
    ];
  }
  // Visa sponsorship
  if (/sponsorship|require.*visa|visa.*sponsor/i.test(text)) {
    return [
      'No, I do not require sponsorship',
      'Yes, I require sponsorship now or in the future',
      'No',
      'Yes',
    ];
  }
  // Gender
  if (/gender|sex\b/i.test(text)) {
    return ['Male', 'Female', 'Non-Binary', 'Decline to self-identify'];
  }
  // Race / Ethnicity
  if (/race|ethnicity|ethnic/i.test(text)) {
    return [
      'Hispanic or Latino',
      'White (Not Hispanic or Latino)',
      'Black or African American',
      'Asian',
      'Native Hawaiian or Other Pacific Islander',
      'American Indian or Alaska Native',
      'Two or More Races',
      'Decline to self-identify',
    ];
  }
  // Veteran status
  if (/veteran/i.test(text)) {
    return [
      'I am not a protected veteran',
      'I identify as one or more of the classifications of protected veteran',
      'I decline to identify',
    ];
  }
  // Disability status
  if (/disability|handicap/i.test(text)) {
    return [
      'Yes, I have a disability (or previously had a disability)',
      'No, I do not have a disability',
      'I do not wish to answer',
    ];
  }
  // Relocation
  if (/relocate|relocation/i.test(text)) {
    return ['Yes', 'No', 'Negotiable'];
  }
  // Willing to travel
  if (/travel/i.test(text)) {
    return ['0%', '25%', '50%', '75%', '100%', 'Yes', 'No'];
  }
  // Over 18
  if (/\b18\b|legal age/i.test(text)) {
    return ['Yes', 'No'];
  }
  // Highest Education
  if (/education|degree\b/i.test(text)) {
    return ["High School", "Associate's Degree", "Bachelor's Degree", "Master's Degree", "Doctorate / Ph.D.", "Other"];
  }
  // Experience level / Years of experience
  if (/years of experience|how many years/i.test(text)) {
    return ['0-1 years', '1-2 years', '3-5 years', '5-7 years', '8+ years', '10+ years'];
  }
  // General Yes / No dropdowns
  if (/^(?:are you|do you|will you|have you)\b/i.test(text.trim()) || /\b(?:yes\/no|select yes or no)\b/i.test(text)) {
    return ['Yes', 'No'];
  }
  // Consent & personal information retention
  if (/consent|personal\s*information|retain\s*data|data\s*retention|gdpr/i.test(text)) {
    return [
      'Yes',
      'No',
      'I consent to have my personal information retained',
      'I do not consent',
    ];
  }
  // Referral source / Where did you hear
  if (/hear\s*about|referral|source|first\s*hear/i.test(text)) {
    return [
      'LinkedIn',
      'Company Website / Careers Page',
      'Job Board (Indeed, Glassdoor, etc.)',
      'Employee Referral',
      'Recruiter Outreach',
      'Event / Conference',
      'Other',
    ];
  }
  // Influenced decision to apply
  if (/decision\s*to\s*apply|influenced.*decision|why.*apply/i.test(text)) {
    return [
      'Company Mission & Culture',
      'Career Growth Opportunities',
      'Product & Technology',
      'Competitive Compensation & Benefits',
      'Remote / Work Flexibility',
      'Team & Leadership',
      'Other',
    ];
  }

  return [];
}

/** Read back the committed value of an extracted question (text or select/dropdown). */
async function readQuestionValue(ctx: Page | Frame, q: ExtractedQuestion): Promise<string | null> {
  const container = q.container;

  // 1. If question is a select or container has custom dropdown/combobox
  const isSelectElement =
    q.type === 'select' ||
    (await container.locator('select, .select__control, .select-shell, [role="combobox"], [class*="singleValue" i], [class*="ValueContainer" i], button[aria-haspopup="listbox"]').count().catch(() => 0)) > 0;

  if (isSelectElement) {
    // Check React-Select / custom singleValue / ValueContainer
    const valContainer = container.locator('.select__single-value, .select-value, .selected, [class*="singleValue" i], [class*="ValueContainer" i]').first();
    if ((await valContainer.count().catch(() => 0)) > 0) {
      const text = (await valContainer.textContent().catch(() => ''))?.trim();
      if (text && !/^(select\.\.\.|choose\.\.\.|select an option|select a country|\-\-)/i.test(text)) {
        return text;
      }
    }

    // Check button combobox / listbox trigger
    const btnCombobox = container.locator('button[role="combobox"], button[aria-haspopup="listbox"], [role="combobox"]').first();
    if ((await btnCombobox.count().catch(() => 0)) > 0) {
      const text = (await btnCombobox.textContent().catch(() => ''))?.trim();
      if (text && !/^(select\.\.\.|choose\.\.\.|select an option|select a country|\-\-)/i.test(text)) {
        return text;
      }
    }

    // Check native select
    const nativeSelect = container.locator('select').first();
    if ((await nativeSelect.count().catch(() => 0)) > 0) {
      const selectedText = await nativeSelect.evaluate((el: HTMLSelectElement) => el.options[el.selectedIndex]?.text || el.value || '').catch(() => '');
      if (selectedText && !/^(select|choose|\-\-)/i.test(selectedText.trim())) {
        return selectedText.trim();
      }
    }
  }

  // 2. Text input check
  const input = container.locator('input[type="text"]:not(.select__input):not([role="combobox"]), input[type="url"], input[type="tel"], input:not([type]):not(.select__input):not([role="combobox"])').first();
  if ((await input.count().catch(() => 0)) > 0) {
    return (await input.inputValue().catch(() => '')) || '';
  }

  // 3. Fallback to any input
  const anyInput = container.locator('input').first();
  if ((await anyInput.count().catch(() => 0)) > 0) {
    return (await anyInput.inputValue().catch(() => '')) || '';
  }

  return null;
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

    // Prepare payload for AI question answering (only for questions needing answers)
    const questionsNeedingAI = questions.filter((q) => {
      if (q.required) return true;
      const customAnswers = context.userProfile?.customAnswers || {};
      const cleanQ = q.label.replace(/\*/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
      return !!(customAnswers[q.fieldKey] || customAnswers[q.label] || Object.keys(customAnswers).some(k => k.toLowerCase().includes(cleanQ) || cleanQ.includes(k.toLowerCase())));
    });

    const questionsPayload = questionsNeedingAI.map((q) => ({
      id: q.id,
      label: q.label,
      type: q.type,
      options: q.options,
      required: q.required,
    }));

    let aiAnswers: Array<{ id: string; answer: string | null; confidence: number; requiresHumanInput: boolean }> = [];

    if (apiClient && context.sessionId && questionsPayload.length > 0) {
      try {
        aiAnswers = await apiClient.answerQuestions(context.sessionId, questionsPayload);
      } catch (err: any) {
        await logger.warn('ai_question_error', `AI question answering service failed: ${err.message}`);
      }
    }

    const unanswered: UnansweredFieldData[] = [];

    for (const q of questions) {
      const isDemographic = isDemographicQuestion(q.label, q.fieldKey);
      const match = aiAnswers.find((a) => a.id === q.id);
      let answer = match?.answer;
      let requiresHuman = match?.requiresHumanInput || !answer;

      // Profile and customAnswers fallback
      if (!answer) {
        const lowerQ = q.label.toLowerCase();
        const lowerKey = q.fieldKey.toLowerCase();
        const cleanQ = q.label.replace(/\*/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
        const customAnswers = context.userProfile.customAnswers || {};

        // Build a case-insensitive index so answers stored by the intervention
        // panel (original case) always match the resolver's lowercased lookups.
        const ciIndex = new Map<string, string>();
        for (const [k, v] of Object.entries(customAnswers)) {
          ciIndex.set(k.replace(/\[\]$/, '').replace(/\*/g, '').replace(/\s+/g, ' ').trim().toLowerCase(), v);
        }

        const cleanFieldKey = q.fieldKey.replace(/\[\]$/, '').trim().toLowerCase();
        let customVal =
          ciIndex.get(cleanFieldKey) ||
          ciIndex.get(cleanQ) ||
          ciIndex.get(q.id.toLowerCase()) ||
          customAnswers[q.fieldKey] ||
          customAnswers[q.label] ||
          customAnswers[q.label.trim()] ||
          customAnswers[q.label.replace(/\*/g, '').trim()] ||
          customAnswers[cleanQ] ||
          customAnswers[q.id];

        if (customVal === undefined || customVal === null || String(customVal).trim().length === 0) {
          for (const [k, v] of Object.entries(customAnswers)) {
            const cleanK = k.replace(/\[\]$/, '').replace(/\*/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
            if (
              cleanK === cleanQ ||
              cleanK === cleanFieldKey ||
              (cleanK.length > 4 && cleanQ.includes(cleanK)) ||
              (cleanQ.length > 4 && cleanK.includes(cleanQ)) ||
              (cleanK.length > 3 && (lowerKey.includes(cleanK) || cleanFieldKey.includes(cleanK)))
            ) {
              customVal = v;
              break;
            }
          }
        }

        if (isDemographic) {
          // Check for specific demographic field in userProfile
          let demoAnswer: string | undefined = customVal;
          if (!demoAnswer) {
            const isTransOrIdentity = isTransgenderOrGenderIdentityQuestion(q.label, q.fieldKey);
            if (isTransOrIdentity) {
              // NEVER use eeocGender for transgender / gender identity questions!
              demoAnswer = customVal;
            } else if (/gender|sex\b/i.test(lowerQ) && !isTransgenderOrGenderIdentityQuestion(lowerQ)) {
              demoAnswer = context.userProfile.eeocGender;
            } else if (/hispanic|latino/i.test(lowerQ)) {
              if (q.options.length > 0 && q.options.some((o) => /^yes$/i.test(o.trim()))) {
                demoAnswer = resolveHispanicEthnicityAnswer(context.userProfile.eeocRace, context.userProfile.skipSelfId);
              } else {
                demoAnswer = context.userProfile.eeocRace;
              }
            } else if (/race|ethnicity/i.test(lowerQ)) {
              demoAnswer = context.userProfile.eeocRace;
            } else if (/veteran|military/i.test(lowerQ)) {
              demoAnswer = context.userProfile.eeocVeteran;
            } else if (/disability/i.test(lowerQ)) {
              demoAnswer = context.userProfile.eeocDisability;
            }
          }

          if (demoAnswer !== undefined && demoAnswer !== null && String(demoAnswer).trim().length > 0) {
            answer = String(demoAnswer).trim();
            requiresHuman = false;
          } else {
            // Demographic question without saved answer strictly requires human intervention if required
            requiresHuman = true;
          }
        } else {

          const isCityQuestion = /^city\b|\bcity\b|location\s*\(\s*city\s*\)/i.test(lowerQ) || /^city\b|candidate-location/i.test(lowerKey);
          const isStateQuestion = /^state\b|\bstate\b|province|region|location\s*\(\s*state\s*\)/i.test(lowerQ) || /^state\b|candidate-state/i.test(lowerKey);
          const isAddressQuestion = /address\s*(?:line\s*1)?|street\s*address/i.test(lowerQ) || /address\s*line\s*1|street\s*address|address1/i.test(lowerKey);
          const isPostalQuestion = /postal|zip\s*code/i.test(lowerQ) || /postal|zip/i.test(lowerKey);
          const isCountryQuestion = /^country\b|\bcountry\b/i.test(lowerQ) || /^country\b/i.test(lowerKey);

          if (isCityQuestion && (context.userProfile.city || context.userProfile.location)) {
            const c = context.userProfile.city || (context.userProfile.location ? context.userProfile.location.split(',')[0]?.trim() : '');
            if (c) {
              answer = c;
              requiresHuman = false;
            }
          } else if (isStateQuestion && (context.userProfile.state || context.userProfile.location)) {
            const s = context.userProfile.state || (context.userProfile.location ? context.userProfile.location.split(',')[1]?.trim() : '');
            if (s) {
              answer = s;
              if (q.options.length > 0) {
                const opt = q.options.find((o) => matchesOptionSafely(o, s) || isStateMatch(o, s));
                if (opt) answer = opt;
              }
              requiresHuman = false;
            }
          } else if (isAddressQuestion && (context.userProfile.streetAddress || context.userProfile.location)) {
            const addr = context.userProfile.streetAddress || context.userProfile.location;
            if (addr) {
              answer = addr;
              requiresHuman = false;
            }
          } else if (isPostalQuestion && context.userProfile.postalCode) {
            answer = context.userProfile.postalCode;
            requiresHuman = false;
          } else if (isCountryQuestion && (context.userProfile.country || customVal)) {
            const rawCountry = context.userProfile.country || customVal || 'United States';
            answer = rawCountry;
            if (q.options.length > 0) {
              const opt = q.options.find((o) => matchesOptionSafely(o, rawCountry) || isCountryMatch(o, rawCountry));
              if (opt) answer = opt;
            }
            requiresHuman = false;
          } else if (customVal !== undefined && customVal !== null && String(customVal).trim().length > 0) {
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
          } else if (/address\s*line\s*2|apt|suite|unit/i.test(lowerQ) || /address\s*line\s*2|address2/i.test(lowerKey)) {
            answer = context.userProfile.streetAddress2 || '';
            requiresHuman = false;
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
          } else if (/authorized to work|work authorization|legal authorization|legally authorized|eligible to work/i.test(lowerQ) || /work_auth|authorized/i.test(lowerKey)) {
            answer = context.userProfile.usWorkAuthorization === 'No' ? 'No' : (context.userProfile.usWorkAuthorization || 'Yes');
            if (q.options.length > 0) {
              const opt = q.options.find((o) => matchesOptionSafely(o, answer!));
              if (opt) answer = opt;
            }
            requiresHuman = false;
          } else if (/require.*sponsorship|visa sponsorship|employment visa|need.*sponsorship/i.test(lowerQ) || /visa|sponsorship/i.test(lowerKey)) {
            answer = context.userProfile.visaSponsorship === 'Yes' ? 'Yes' : (context.userProfile.visaSponsorship || 'No');
            if (q.options.length > 0) {
              const opt = q.options.find((o) => matchesOptionSafely(o, answer!));
              if (opt) answer = opt;
            }
            requiresHuman = false;
          } else if (/consent.*personal\s*information|retain.*personal\s*information|data\s*retention|retain.*data|gdpr/i.test(lowerQ) || /consent|gdpr/i.test(lowerKey)) {
            answer = 'Yes';
            if (q.options.length > 0) {
              const consentOpt = q.options.find((o) => /^(yes|i consent|agree|accept)/i.test(o.trim())) || q.options[0];
              if (consentOpt) answer = consentOpt;
            }
            requiresHuman = false;
          } else if (/where\s*did\s*you.*(?:hear|find)|how\s*did\s*you.*(?:hear|find)|referral\s*source|source\s*of\s*application/i.test(lowerQ) || /referral|how_heard|hear_about/i.test(lowerKey)) {
            if (customVal) {
              answer = String(customVal).trim();
            } else if (q.options.length > 0) {
              const preferredSource = q.options.find((o) => /job\s*board|indeed|linkedin|careers|website|online/i.test(o.trim())) || q.options[0];
              answer = preferredSource;
            } else {
              answer = 'Job Board';
            }
            requiresHuman = false;
          } else if (/have\s*you\s*(?:ever\s*)?been\s*employed\s*by|currently\s*(?:or\s*previously\s*)?employed\s*by|former\s*employee\s*of|worked\s*for.*in\s*the\s*past/i.test(lowerQ)) {
            answer = 'No';
            if (q.options.length > 0) {
              const noOpt = q.options.find((o) => /^no\b/i.test(o.trim())) || 'No';
              answer = noOpt;
            }
            requiresHuman = false;
          }
        }
      }


      if (answer) {
        const filled = await this.fillSingleQuestion(ctx, q, answer, logger);
        if (filled) {
          // Location-type fields are the highest-risk fills: typeahead widgets
          // can leave truncated or mangled text. Verify what actually committed;
          // on mismatch retry once with a fresh answer (context may have been
          // refreshed), then treat as failed so it reaches the intervention.
          // IMPORTANT: Exclude screening/auth questions that happen to contain the word "country".
          const isWorkAuthOrVisaOrScreening = /authorized|authorization|sponsorship|visa|relocat|travel|veteran|disability|gender|race|hear\s*about|consent|over\s*18/i.test(q.label);
          const isPureCountryField = /^country\b|\bcountry\s*(?:of\s*residence)?$/i.test(q.label.trim()) || /^country$/i.test(q.fieldKey.trim());
          const isLocationType = !isWorkAuthOrVisaOrScreening && (
            /location\b|city\b|state\b|province\b|postal|zip\b|street\s*address|address\s*line/i.test(q.label) ||
            isPureCountryField
          );

          if (isLocationType && (q.type === 'text' || q.type === 'select')) {
            const committed = await readQuestionValue(ctx, q);
            if (committed !== null && !valuesClose(committed || '', answer)) {
              await logger.warn(
                'question_fill_mismatch',
                `"${q.label.slice(0, 60)}" expected "${answer.slice(0, 40)}" but input holds "${(committed || '').slice(0, 40)}" — retrying once`
              );
              const refilled = await this.fillSingleQuestion(ctx, q, answer, logger);
              if (!refilled || !valuesClose((await readQuestionValue(ctx, q)) || '', answer)) {
                await logger.warn(
                  'question_fill_failed',
                  `Location field "${q.label.slice(0, 60)}" could not be verified — escalating to user intervention`
                );
                unanswered.push({
                  fieldKey: q.fieldKey,
                  label: q.label,
                  fieldType: q.type,
                  options: q.options.length > 0 ? q.options : undefined,
                  required: q.required,
                  suggestedAnswer: answer,
                });
                continue;
              }
            }
          }
          await logger.info(
            'question_answered_ai',
            `Answered question (${q.type}): "${q.label.slice(0, 60)}" -> "${answer.slice(0, 40)}..."`
          );
          continue;
        }
      }

      // If answer failed or requires human input on a REQUIRED field
      if (q.required) {
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
        unanswered.push({ ...questionData });
      }
    }

    // Batch-intervention: surface only troublesome required fields at once so the user
    // can fill them in a single pass and the bot resumes.
    if (unanswered.length > 0) {
      await logger.warn(
        'question_requires_input_batch',
        `${unanswered.length} application field(s) require user input: ${unanswered.map((u) => u.label.slice(0, 40)).join('; ')}`
      );

      throw new InterventionError(
        InterventionReason.UNKNOWN_QUESTION,
        `[QUESTION_DATA:${JSON.stringify(unanswered)}] Application needs your input for ${unanswered.length} field(s): ${unanswered.map((u) => `"${u.label.slice(0, 60)}"`).join(', ')}`,
        page.url()
      );
    }
  }

  /**
   * Extract all interactive question fields from the form container.
   */
  private static async extractUnfilledQuestions(ctx: Page | Frame): Promise<ExtractedQuestion[]> {
    const extracted: ExtractedQuestion[] = [];
    const seenLabels = new Set<string>();

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

      // Ignore containers strictly inside true cookie banners/SDKs or nav/footer
      const isInsideObstruction = await container.evaluate((el) => {
        return !!el.closest(
          '#onetrust-consent-sdk, #onetrust-banner-sdk, #onetrust-pc-sdk, [id*="cookie-banner" i], [class*="cookie-banner" i], .didomi-popup-container, [id*="didomi" i], [class*="cookiebot" i], [id*="CybotCookiebot" i], [id*="usercentrics" i], .cookie-modal, .cookie-bar, header, nav, footer, [role="banner"], [role="navigation"], [role="contentinfo"], .footer, #footer, .header, #header, [class*="newsletter" i], [id*="newsletter" i]'
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

      const cleanLabel = label.replace(/[\*\u204E\u2217]/g, '').replace(/\s+/g, ' ').trim();
      const normLabel = cleanLabel.toLowerCase();

      // Deduplicate extracted questions so parent/child containers do not generate duplicate intervention fields
      if (seenLabels.has(normLabel)) {
        continue;
      }

      // Skip cookie settings and banner tracking preferences
      if (
        /strictly\s*necessary\s*cookies|targeting\s*cookies|functional\s*cookies|performance\s*cookies|analytics\s*cookies|manage\s*cookie|cookie\s*setting|cookie\s*preference/i.test(normLabel)
      ) {
        continue;
      }

      // Skip standard personal contact fields already handled by main plugins
      if (
        /^(first|last)\s*name/i.test(normLabel) ||
        /^email/i.test(normLabel) ||
        /^phone/i.test(normLabel) ||
        /^resume/i.test(normLabel) ||
        /^cover\s*letter/i.test(normLabel) ||
        /^linkedin/i.test(normLabel) ||
        /^website/i.test(normLabel) ||
        /^portfolio/i.test(normLabel) ||
        /^github/i.test(normLabel) ||
        /country\s*code|dialing\s*code|phone\s*country/i.test(normLabel) ||
        ((await container.locator('input[type="tel"], input[name*="phone" i], [id*="phone" i]').count().catch(() => 0)) > 0 && /country/i.test(normLabel))
      ) {
        continue;
      }

      const hasRequiredAttr = (await container.locator('[aria-required="true"], [required], .required, [data-required="true"], [class*="required" i]').count().catch(() => 0)) > 0;
      const hasAsterisk = label.includes('*') || /[\*\u204E\u2217]/.test(label);
      const hasRequiredWord = /\b(required)\b/i.test(label);
      const hasOptionalWord = /\b(optional)\b/i.test(label) || /\(optional\)/i.test(label) || /\[optional\]/i.test(label);

      const isRequired = (hasRequiredAttr || hasAsterisk || hasRequiredWord) && !hasOptionalWord;

      // Check field types:
      // 1. Textarea
      const textarea = container.locator('textarea').first();
      if (await textarea.count() > 0 && (await textarea.isVisible().catch(() => false))) {
        const val = (await textarea.inputValue().catch(() => ''))?.trim();
        if (!val) {
          qIndex++;
          seenLabels.add(normLabel);
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
          seenLabels.add(normLabel);
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

      // 2. Dropdowns: Native select or React Select / custom combobox / ARIA listbox
      const nativeSelect = container.locator('select').first();
      const customSelect = container.locator([
        '.select__control',
        '.select-shell',
        'input.select__input',
        '[role="combobox"]',
        'button[aria-haspopup="listbox"]',
        'button[aria-haspopup="true"]',
        'div[aria-haspopup="listbox"]',
        '[data-automation-id*="select" i]',
        '[data-automation-id*="dropdown" i]',
        '[data-testid*="select" i]',
        '[data-testid*="dropdown" i]',
        '[class*="ashby-dropdown" i]',
        '[class*="select__control" i]',
        '[class*="select-control" i]',
        '[class*="dropdown" i]',
      ].join(', ')).first();

      let dropdownOptions: string[] = [];
      const anySelect = container.locator('select').first();
      if (await anySelect.count() > 0) {
        const rawOpts = await anySelect.locator('option').allTextContents().catch(() => []);
        dropdownOptions = rawOpts.map((o) => o.trim()).filter((o) => o && !/^(select|choose|please\s*select|\-\-)/i.test(o));
      }

      if (dropdownOptions.length === 0 && (await customSelect.count() > 0)) {
        const customOpts = await container.locator('[role="option"], .select__option, [class*="option" i], li[role="option"], [data-automation-id*="promptOption" i]').allTextContents().catch(() => []);
        dropdownOptions = customOpts.map((o) => o.trim()).filter((o) => o && !/^(select|choose|please\s*select|\-\-)/i.test(o));
      }

      if (dropdownOptions.length === 0) {
        dropdownOptions = getSemanticDropdownOptions(cleanLabel);
      }

      if (await nativeSelect.count() > 0) {
        const val = await nativeSelect.inputValue().catch(() => '');
        const selText = ((await nativeSelect.evaluate((el: HTMLSelectElement) => el.options[el.selectedIndex]?.text || '').catch(() => '')) || '').trim().toLowerCase();
        const isUnfilled = !val || val === '' || val === '0' || /^(?:select\.\.\.|choose\.\.\.|please\s*select|select an option|select a country|\-\-)$/i.test(selText);

        if (isUnfilled) {
          qIndex++;
          seenLabels.add(normLabel);
          extracted.push({
            id: `q_${qIndex}`,
            fieldKey: (await nativeSelect.getAttribute('name')) || (await nativeSelect.getAttribute('id')) || `select_${qIndex}`,
            label: cleanLabel,
            type: 'select',
            options: dropdownOptions,
            required: isRequired,
            container,
          });
          continue;
        }
      } else if (await customSelect.count() > 0 && (await customSelect.isVisible().catch(() => false))) {
        const valContainer = container.locator('.select__single-value, .select-value, .selected, [class*="singleValue" i], [class*="ValueContainer" i]').first();
        let currentText = '';
        if (await valContainer.count() > 0) {
          currentText = ((await valContainer.textContent().catch(() => '')) || '').trim();
        } else {
          currentText = ((await customSelect.textContent().catch(() => '')) || '').trim();
        }
        // Truly unfilled only if it holds placeholder text or is empty (do NOT force unfilled if already filled with Yes/No/etc.)
        const isUnfilled = !currentText || /^(?:select\.\.\.|choose\.\.\.|select an option|select a country|select one|please select|\-\-)$/i.test(currentText) || /select\.\.\./i.test(currentText);
        if (isUnfilled) {
          qIndex++;
          seenLabels.add(normLabel);
          extracted.push({
            id: `q_${qIndex}`,
            fieldKey: (await customSelect.getAttribute('name')) || (await customSelect.getAttribute('id')) || `custom_select_${qIndex}`,
            label: cleanLabel,
            type: 'select',
            options: dropdownOptions,
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
          seenLabels.add(normLabel);
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
      const checkboxCount = await container.locator('input[type="checkbox"]:visible').count().catch(() => 0);
      const hasCheckbox = await checkbox.count() > 0 && !(await checkbox.isChecked().catch(() => true));
      const hasAriaSwitch = !hasCheckbox && await ariaSwitch.count() > 0 &&
        (await readSwitchState(ariaSwitch).catch(() => null)) === false;
      if (hasCheckbox || hasAriaSwitch) {
        // Multi-select group ("select all that apply") when 2+ checkboxes share the container
        if (checkboxCount > 1) {
          qIndex++;
          seenLabels.add(normLabel);
          const groupLabels = (await container.locator('label').allTextContents().catch(() => []))
            .map((t) => t.trim()).filter((t) => t && t !== cleanLabel);
          extracted.push({
            id: `q_${qIndex}`,
            fieldKey: (await checkbox.getAttribute('name')) || `multicheck_${qIndex}`,
            label: cleanLabel,
            type: 'checkbox',
            options: groupLabels,
            required: isRequired,
            container,
          });
          continue;
        }
        qIndex++;
        seenLabels.add(normLabel);
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

      // 3.6 Date inputs — native date pickers and Workday/Greenhouse composite date fields
      const dateInput = container.locator('input[type="date"], input[placeholder*="MM/DD/YYYY" i], input[placeholder*="mm/dd/yyyy" i]').first();
      if (await dateInput.count() > 0 && (await dateInput.isVisible().catch(() => false))) {
        const val = (await dateInput.inputValue().catch(() => ''))?.trim();
        if (!val) {
          qIndex++;
          seenLabels.add(normLabel);
          extracted.push({
            id: `q_${qIndex}`,
            fieldKey: (await dateInput.getAttribute('name')) || (await dateInput.getAttribute('id')) || `date_${qIndex}`,
            label: cleanLabel,
            type: 'date',
            options: [],
            required: isRequired,
            container,
          });
          continue;
        }
      }

      // 4. Text input / Autocomplete Combobox
      const textInput = container.locator('input[type="text"], input[type="url"], input[type="tel"], input:not([type])').first();
      if (await textInput.count() > 0 && (await textInput.isVisible().catch(() => false))) {
        const val = (await textInput.inputValue().catch(() => ''))?.trim();
        if (!val) {
          const isComboboxOrDropdown =
            (await textInput.getAttribute('role').catch(() => '')) === 'combobox' ||
            (await textInput.getAttribute('aria-haspopup').catch(() => '')) !== null ||
            (await textInput.getAttribute('aria-autocomplete').catch(() => '')) !== null ||
            (await textInput.getAttribute('readonly').catch(() => '')) !== null ||
            (await textInput.getAttribute('class').catch(() => ''))?.toLowerCase().includes('select') ||
            (await textInput.getAttribute('class').catch(() => ''))?.toLowerCase().includes('dropdown') ||
            (await container.locator('[role="combobox"], [aria-haspopup], [class*="select" i], [class*="dropdown" i]').count().catch(() => 0)) > 0;

          qIndex++;
          seenLabels.add(normLabel);

          if (isComboboxOrDropdown) {
            const opts = getSemanticDropdownOptions(cleanLabel);
            extracted.push({
              id: `q_${qIndex}`,
              fieldKey: (await textInput.getAttribute('name')) || (await textInput.getAttribute('id')) || `select_${qIndex}`,
              label: cleanLabel,
              type: 'select',
              options: opts,
              required: isRequired,
              container,
            });
          } else {
            extracted.push({
              id: `q_${qIndex}`,
              fieldKey: (await textInput.getAttribute('name')) || (await textInput.getAttribute('id')) || `text_${qIndex}`,
              label: cleanLabel,
              type: 'text',
              options: [],
              required: isRequired,
              container,
            });
          }
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
        // Multi-checkbox group: check every box whose label matches the answer list
        const groupBoxes = container.locator('input[type="checkbox"]:visible');
        const groupBoxCount = await groupBoxes.count().catch(() => 0);
        if (groupBoxCount > 1 && question.options.length > 0) {
          const wanted = answer.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
          let matched = 0;
          for (let i = 0; i < groupBoxCount; i++) {
            const box = groupBoxes.nth(i);
            const labelText = (
              (await box.evaluate((el) => {
                const lbl = el.closest('label') ||
                  (el.id ? document.querySelector(`label[for="${el.id}"]`) : null);
                return lbl ? lbl.textContent : '';
              }).catch(() => '')) || ''
            ).toLowerCase();
            if (!labelText) continue;
            if (wanted.some((w) => labelText.includes(w) || w.includes(labelText))) {
              if (!(await box.isChecked().catch(() => false))) {
                await box.check({ force: true }).catch(async () => {
                  const label = container.locator('label:has(input[type="checkbox"])').nth(i);
                  await label.click({ force: true }).catch(() => null);
                });
              }
              if (await box.isChecked().catch(() => false)) matched++;
            }
          }
          return matched > 0;
        }

        // Single checkbox
        const checkbox = container.locator('input[type="checkbox"]').first();
        if (await checkbox.count() > 0) {
          const isAffirmative = /^(yes|true|1|agree|confirm|accept)$/i.test(answer.trim());
          if (isAffirmative && (await checkbox.isChecked().catch(() => false)) === false) {
            await checkbox.check({ force: true }).catch(() => null);
          } else if (!isAffirmative && (await checkbox.isChecked().catch(() => false)) === true) {
            await checkbox.uncheck({ force: true }).catch(() => null);
          }
          return true;
        }

        // ARIA switch / toggle (Material, Chakra, Workday custom widgets)
        const ariaSwitch = container.locator('[role="switch"], [aria-checked]').first();
        if (await ariaSwitch.count() > 0) {
          const isAffirmative = /^(yes|true|1|agree|confirm|accept)$/i.test(answer.trim());
          const result = await setSwitchState(ariaSwitch, isAffirmative);
          return result === true;
        }
      } else if (question.type === 'date') {
        // Native date inputs require ISO (yyyy-mm-dd) via fill(); keyboard entry gets mangled
        const nativeDateInput = container.locator('input[type="date"]').first();
        if ((await nativeDateInput.count().catch(() => 0)) > 0) {
          await nativeDateInput.click().catch(() => null);
          await replaceValue(nativeDateInput, toISODate(answer) || answer);
          return true;
        }

        // Placeholder-masked date fields (MM/DD/YYYY) reject free-form answers; normalize first
        const placeholderDate = container.locator('input[placeholder*="MM/DD/YYYY" i], input[placeholder*="mm/dd/yyyy" i]').first();
        if ((await placeholderDate.count().catch(() => 0)) > 0 && /\d/.test(answer)) {
          await placeholderDate.click().catch(() => null);
          await replaceValue(placeholderDate, toSlashDate(answer) || answer);
          return true;
        }

        const fallbackInput = container.locator('input').first();
        if (await fallbackInput.count() > 0) {
          await fallbackInput.click().catch(() => null);
          await replaceValue(fallbackInput, toISODate(answer) || toSlashDate(answer) || answer);
          return true;
        }
      } else if (question.type === 'text') {
        // If container actually has a dropdown/select element, delegate directly to select logic
        const hasSelectElement =
          (await container.locator('select, .select__control, .select-shell, [role="combobox"], button[aria-haspopup="listbox"], button[aria-haspopup="true"], div.select, [class*="select__control" i]').count().catch(() => 0)) > 0;
        if (hasSelectElement) {
          return this.fillSingleQuestion(ctx, { ...question, type: 'select' }, answer, logger);
        }

        // Native date inputs require ISO (yyyy-mm-dd) via fill(); keyboard entry gets mangled
        const nativeDateInput = container.locator('input[type="date"]').first();
        if ((await nativeDateInput.count().catch(() => 0)) > 0) {
          await nativeDateInput.click().catch(() => null);
          await replaceValue(nativeDateInput, toISODate(answer) || answer);
          return true;
        }

        // Placeholder-masked date fields (MM/DD/YYYY) reject free-form answers; normalize first
        const placeholderDate = container.locator('input[placeholder*="MM/DD/YYYY" i]').first();
        if ((await placeholderDate.count().catch(() => 0)) > 0 && /\d/.test(answer)) {
          await placeholderDate.click().catch(() => null);
          await replaceValue(placeholderDate, toSlashDate(answer) || answer);
          return true;
        }

        const input = container.locator('input[type="text"]:not(.select__input):not([role="combobox"]), input[type="url"], input[type="tel"], input:not([type]):not(.select__input):not([role="combobox"])').first();
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
            const text = (await opt.textContent())?.trim() ?? '';
            if (matchesOptionSafely(text, answer)) {
              const val = await opt.getAttribute('value');
              if (val) {
                await nativeSelect.selectOption(val);
                return true;
              }
            }
          }
        } else {
          // React Select, ARIA listbox, or custom dropdown
          const control = container.locator([
            '.select__control',
            '.select-shell',
            '[role="combobox"]',
            'button[aria-haspopup="listbox"]',
            'button[aria-haspopup="true"]',
            'div[aria-haspopup="listbox"]',
            '[data-automation-id*="select" i]',
            '[data-automation-id*="dropdown" i]',
            '[data-testid*="select" i]',
            '[data-testid*="dropdown" i]',
            '[class*="select__control" i]',
            '[class*="select-control" i]',
            '[class*="dropdown" i]',
          ].join(', ')).first();
          const reactInput = container.locator('input.select__input, input[role="combobox"]').first();
          const page = 'page' in ctx && typeof (ctx as any).page === 'function' ? (ctx as Frame).page() : (ctx as Page);

          if (await control.count() > 0 || await reactInput.count() > 0) {
            if (await control.count() > 0) {
              await control.click({ force: true }).catch(() => null);
            } else if (await reactInput.count() > 0) {
              await reactInput.click({ force: true }).catch(() => null);
            }
            await page.waitForTimeout(250);

            let matchedAndClicked = false;

            // 1. Check popup options directly in ctx or page
            let optionEls = await ctx.locator('.select__option, [id*="-option-"], [role="option"], [data-automation-id*="promptOption" i], li[role="option"]').all().catch(() => []);
            if (optionEls.length === 0) {
              optionEls = await page.locator('.select__option, [id*="-option-"], [role="option"], [data-automation-id*="promptOption" i], li[role="option"]').all().catch(() => []);
            }

            for (const optEl of optionEls) {
              const text = (await optEl.textContent().catch(() => ''))?.trim() ?? '';
              if (matchesOptionSafely(text, answer)) {
                await optEl.scrollIntoViewIfNeeded().catch(() => null);
                await optEl.click({ force: true }).catch(() => null);
                matchedAndClicked = true;
                break;
              }
            }

            // 2. If not found in open popup, use search/filter input to filter options and CLICK the matched option
            if (!matchedAndClicked && (await reactInput.count() > 0)) {
              const searchKeyword = answer.split(/[\(,]/)[0].trim();
              await reactInput.focus().catch(() => null);
              await replaceValue(reactInput, searchKeyword);
              await page.waitForTimeout(300);

              let filteredOptions = await ctx.locator('.select__option, [id*="-option-"], [role="option"], [data-automation-id*="promptOption" i], li[role="option"]').all().catch(() => []);
              if (filteredOptions.length === 0) {
                filteredOptions = await page.locator('.select__option, [id*="-option-"], [role="option"], [data-automation-id*="promptOption" i], li[role="option"]').all().catch(() => []);
              }

              for (const fOpt of filteredOptions) {
                const text = (await fOpt.textContent().catch(() => ''))?.trim() ?? '';
                if (matchesOptionSafely(text, answer) || matchesOptionSafely(text, searchKeyword)) {
                  await fOpt.scrollIntoViewIfNeeded().catch(() => null);
                  await fOpt.click({ force: true }).catch(() => null);
                  matchedAndClicked = true;
                  break;
                }
              }

              if (!matchedAndClicked && filteredOptions.length > 0) {
                const firstFiltered = filteredOptions[0];
                if ((await firstFiltered.count().catch(() => 0)) > 0 && (await firstFiltered.isVisible().catch(() => false))) {
                  const firstText = (await firstFiltered.textContent().catch(() => ''))?.trim() ?? '';
                  if (matchesOptionSafely(firstText, answer) || matchesOptionSafely(firstText, searchKeyword)) {
                    await firstFiltered.scrollIntoViewIfNeeded().catch(() => null);
                    await firstFiltered.click({ force: true }).catch(() => null);
                    matchedAndClicked = true;
                  }
                }
              }

              if (!matchedAndClicked) {
                await reactInput.press('Enter').catch(() => null);
                await page.waitForTimeout(200);
              }
            }

            if (matchedAndClicked) {
              await container.evaluate((node, targetAns) => {
                const inputs = node.querySelectorAll('input, select');
                inputs.forEach((inp: any) => {
                  try {
                    if (inp.tagName.toLowerCase() === 'select') {
                      inp.value = targetAns;
                      inp.dispatchEvent(new Event('change', { bubbles: true }));
                    } else if (inp.type === 'hidden') {
                      if (!inp.value) inp.value = targetAns;
                      inp.dispatchEvent(new Event('input', { bubbles: true }));
                      inp.dispatchEvent(new Event('change', { bubbles: true }));
                    } else {
                      inp.dispatchEvent(new Event('input', { bubbles: true }));
                      inp.dispatchEvent(new Event('change', { bubbles: true }));
                      inp.dispatchEvent(new Event('blur', { bubbles: true }));
                    }
                  } catch {}
                });
              }, answer).catch(() => null);

              if (await reactInput.count() > 0) {
                await reactInput.dispatchEvent('blur').catch(() => null);
              }
            }

            await page.waitForTimeout(250);

            // 3. Verify whether value committed
            const valContainer = container.locator('.select__single-value, .select-value, .selected, [class*="singleValue" i], [class*="ValueContainer" i]').first();
            if (await valContainer.count() > 0) {
              const committed = ((await valContainer.textContent().catch(() => '')) || '').trim();
              if (committed && !/^(select\.\.\.|choose\.\.\.|select an option|\-\-)/i.test(committed)) {
                return true;
              }
            }

            return matchedAndClicked;

          }
        }
      } else if (question.type === 'radio') {
        const radioLabels = await container.locator('label').all();
        for (const rLabel of radioLabels) {
          const text = (await rLabel.textContent())?.trim() ?? '';
          if (matchesOptionSafely(text, answer)) {
            await rLabel.click().catch(() => null);
            return true;
          }
        }

        const radios = await container.locator('input[type="radio"]').all();
        for (const radio of radios) {
          const val = (await radio.getAttribute('value'))?.trim() ?? '';
          if (val && matchesOptionSafely(val, answer)) {
            await radio.check({ force: true }).catch(() => null);
            return true;
          }
        }
      }

      // Stagehand AI Fallback if deterministic filling failed
      const page = 'page' in ctx && typeof (ctx as any).page === 'function' ? (ctx as Frame).page() : (ctx as Page);
      if (page) {
        if (question.type === 'select') {
          const selected = await StagehandFallback.selectDropdown(page, question.label, answer, logger);
          if (selected) return true;
        } else if (question.type === 'text' || question.type === 'textarea') {
          const filled = await StagehandFallback.fillField(page, question.label, answer, logger);
          if (filled) return true;
        }
      }
    } catch (err: any) {
      await logger.warn('fill_question_error', `Failed to populate ${question.type} question: ${err.message}`);
    }

    return false;
  }
}
