/**
 * worker/src/utils/demographic-matching.ts
 *
 * Strict utilities for detecting demographic, transgender, and gender-identity questions
 * and safely matching dropdown / radio options without false-positive substring hits.
 */

export const US_STATES: Record<string, string> = {
  AL: 'Alabama',
  AK: 'Alaska',
  AZ: 'Arizona',
  AR: 'Arkansas',
  CA: 'California',
  CO: 'Colorado',
  CT: 'Connecticut',
  DE: 'Delaware',
  FL: 'Florida',
  GA: 'Georgia',
  HI: 'Hawaii',
  ID: 'Idaho',
  IL: 'Illinois',
  IN: 'Indiana',
  IA: 'Iowa',
  KS: 'Kansas',
  KY: 'Kentucky',
  LA: 'Louisiana',
  ME: 'Maine',
  MD: 'Maryland',
  MA: 'Massachusetts',
  MI: 'Michigan',
  MN: 'Minnesota',
  MS: 'Mississippi',
  MO: 'Missouri',
  MT: 'Montana',
  NE: 'Nebraska',
  NV: 'Nevada',
  NH: 'New Hampshire',
  NJ: 'New Jersey',
  NM: 'New Mexico',
  NY: 'New York',
  NC: 'North Carolina',
  ND: 'North Dakota',
  OH: 'Ohio',
  OK: 'Oklahoma',
  OR: 'Oregon',
  PA: 'Pennsylvania',
  RI: 'Rhode Island',
  SC: 'South Carolina',
  SD: 'South Dakota',
  TN: 'Tennessee',
  TX: 'Texas',
  UT: 'Utah',
  VT: 'Vermont',
  VA: 'Virginia',
  WA: 'Washington',
  WV: 'West Virginia',
  WI: 'Wisconsin',
  WY: 'Wyoming',
  DC: 'District of Columbia',
  PR: 'Puerto Rico',
  VI: 'Virgin Islands',
  GU: 'Guam',
  AS: 'American Samoa',
  MP: 'Northern Mariana Islands',
};

export const COMMON_COUNTRIES = [
  'United States',
  'Canada',
  'United Kingdom',
  'Australia',
  'Germany',
  'France',
  'India',
  'Netherlands',
  'Ireland',
  'Israel',
  'Spain',
  'Italy',
  'Sweden',
  'Switzerland',
  'Brazil',
  'Mexico',
  'Singapore',
  'Japan',
  'Other',
];

export const US_STATE_OPTIONS = [
  'Alabama', 'Alaska', 'Arizona', 'Arkansas', 'California', 'Colorado', 'Connecticut',
  'Delaware', 'District of Columbia', 'Florida', 'Georgia', 'Hawaii', 'Idaho', 'Illinois',
  'Indiana', 'Iowa', 'Kansas', 'Kentucky', 'Louisiana', 'Maine', 'Maryland', 'Massachusetts',
  'Michigan', 'Minnesota', 'Mississippi', 'Missouri', 'Montana', 'Nebraska', 'Nevada',
  'New Hampshire', 'New Jersey', 'New Mexico', 'New York', 'North Carolina', 'North Dakota',
  'Ohio', 'Oklahoma', 'Oregon', 'Pennsylvania', 'Puerto Rico', 'Rhode Island', 'South Carolina',
  'South Dakota', 'Tennessee', 'Texas', 'Utah', 'Vermont', 'Virginia', 'Washington',
  'West Virginia', 'Wisconsin', 'Wyoming',
];

export function normalizeStateName(state: string): string {
  const trimmed = state.trim();
  const upper = trimmed.toUpperCase();
  if (US_STATES[upper]) return US_STATES[upper];
  const lower = trimmed.toLowerCase();
  for (const [abbr, name] of Object.entries(US_STATES)) {
    if (name.toLowerCase() === lower) return name;
  }
  return trimmed;
}

export function normalizeStateAbbr(state: string): string {
  const trimmed = state.trim();
  const upper = trimmed.toUpperCase();
  if (US_STATES[upper]) return upper;
  const lower = trimmed.toLowerCase();
  for (const [abbr, name] of Object.entries(US_STATES)) {
    if (name.toLowerCase() === lower) return abbr;
  }
  return trimmed;
}

export function isStateMatch(optionText: string, targetState: string): boolean {
  const opt = optionText.trim().toLowerCase();
  const target = targetState.trim();
  if (!opt || !target) return false;

  const targetFullName = normalizeStateName(target).toLowerCase();
  const targetAbbr = normalizeStateAbbr(target).toLowerCase();

  if (opt === targetFullName || opt === targetAbbr) return true;

  const optFullName = normalizeStateName(optionText).toLowerCase();
  const optAbbr = normalizeStateAbbr(optionText).toLowerCase();

  if (optFullName === targetFullName || (optAbbr.length === 2 && optAbbr === targetAbbr)) return true;

  const escapedFullName = targetFullName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  try {
    const fullNameRegex = new RegExp(`\\b${escapedFullName}\\b`, 'i');
    if (fullNameRegex.test(opt)) return true;
  } catch {}

  if (targetAbbr.length === 2) {
    const escapedAbbr = targetAbbr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    try {
      const abbrRegex = new RegExp(`\\b${escapedAbbr}\\b`, 'i');
      if (abbrRegex.test(opt)) return true;
    } catch {}
  }

  return false;
}

export function isCountryMatch(optionText: string, targetCountry: string): boolean {
  const opt = optionText.trim().toLowerCase();
  const target = targetCountry.trim().toLowerCase();
  if (!opt || !target) return false;

  if (opt === target) return true;

  const isTargetUS = /^(united states|usa|u\.s\.a\.|us|u\.s\.|united states of america)$/i.test(target);
  const isOptUS = /^(united states|usa|u\.s\.a\.|us|u\.s\.|united states of america|\+1|1|us \(\+1\)|united states \(\+1\)|\+1 \(us\))$/i.test(opt) ||
    /\bunited\s*states\b|\bu\.s\.a\.\b|\busa\b|^\+1\b/i.test(opt);

  if (isTargetUS && isOptUS) return true;
  if (isTargetUS && !isOptUS) return false;
  if (!isTargetUS && isOptUS) return false;

  // Canada (+1)
  const isTargetCA = /^(canada|ca)$/i.test(target);
  const isOptCA = /^(canada|ca|\+1|1|ca \(\+1\)|canada \(\+1\)|\+1 \(ca\))$/i.test(opt) || /\bcanada\b/i.test(opt);
  if (isTargetCA && isOptCA) return true;

  // United Kingdom (+44)
  const isTargetUK = /^(united kingdom|uk|u\.k\.)$/i.test(target);
  const isOptUK = /^(united kingdom|uk|u\.k\.|\+44|44|uk \(\+44\)|\+44 \(uk\))$/i.test(opt) || /\bunited\s*kingdom\b/i.test(opt);
  if (isTargetUK && isOptUK) return true;

  return false;
}

/**
 * Check if a question specifically asks about transgender status,
 * gender identity, gender expression, or cisgender status.
 *
 * Generic EEOC gender (Male/Female) MUST NEVER be used to answer these questions.
 */
export function isTransgenderOrGenderIdentityQuestion(label: string, fieldKey?: string): boolean {
  const text = `${label} ${fieldKey || ''}`.toLowerCase();
  return /transgender|\btrans\b|gender\s*identity|gender\s*expression|cisgender|\bcis\b/i.test(text);
}

/**
 * Check if an option text indicates a transgender / trans identity.
 */
export function isOptionTransgender(text: string): boolean {
  return /transgender|\btrans\b|transsexual/i.test(text.trim());
}

/**
 * Check if an option text indicates a cisgender identity.
 */
export function isOptionCisgender(text: string): boolean {
  return /cisgender|\bcis\b/i.test(text.trim());
}

/**
 * Safely match an option text against a target answer string without false positives.
 *
 * Rules:
 * 1. If target does not contain 'trans', option containing 'trans' will NEVER match (e.g. 'Trans Man/Male' will not match 'Male').
 * 2. If target is 'Male' or 'Man', only match 'Male', 'Man', 'Man / Male', 'Male (He/Him)', 'Cisgender Man/Male', etc., strictly excluding 'Trans...'.
 * 3. If target is 'Female' or 'Woman', only match 'Female', 'Woman', 'Woman / Female', strictly excluding 'Trans...'.
 * 4. State abbreviations <-> Full names safely match (e.g., 'CA' <-> 'California').
 * 5. Country variations safely match (e.g., 'United States' <-> 'USA').
 * 6. Word-boundary or exact matching is enforced.
 */
export function matchesOptionSafely(optionText: string, targetValue: string): boolean {
  const opt = optionText.trim().toLowerCase();
  const target = targetValue.trim().toLowerCase();
  if (!opt || !target) return false;

  // Exact match
  if (opt === target) return true;

  // Country match
  if (/^(united states|usa|u\.s\.a\.|us|u\.s\.|united states of america|canada|united kingdom|uk|australia|germany|france|india)$/i.test(target)) {
    if (isCountryMatch(optionText, targetValue)) return true;
  }

  // State match
  if (normalizeStateAbbr(targetValue).length === 2 && normalizeStateAbbr(targetValue) !== targetValue.toUpperCase()) {
    if (isStateMatch(optionText, targetValue)) return true;
  } else if (US_STATES[targetValue.trim().toUpperCase()]) {
    if (isStateMatch(optionText, targetValue)) return true;
  }

  const targetHasTrans = isOptionTransgender(target);
  const optHasTrans = isOptionTransgender(opt);

  // If user target does NOT specify trans, NEVER match an option with 'trans'
  if (!targetHasTrans && optHasTrans) {
    return false;
  }

  // If user target explicitly specifies trans, option MUST have trans or match target
  if (targetHasTrans && !optHasTrans) {
    return false;
  }

  // Gender-specific safe matching for Male / Man
  if (/^(male|man)$/i.test(target)) {
    if (optHasTrans) return false;
    // Must contain male or man as a whole word, and MUST NOT contain female or woman
    const hasMale = /\b(?:male|man|men)\b/i.test(opt);
    const hasFemale = /\b(?:female|woman|women)\b/i.test(opt);
    return hasMale && !hasFemale;
  }

  // Gender-specific safe matching for Female / Woman
  if (/^(female|woman)$/i.test(target)) {
    if (optHasTrans) return false;
    // Must contain female or woman as a whole word, and MUST NOT contain male or man
    const hasFemale = /\b(?:female|woman|women)\b/i.test(opt);
    const hasMale = /\b(?:male|man|men)\b/i.test(opt);
    return hasFemale && !hasMale;
  }

  // Decline / Prefer not to say
  if (/^(decline|prefer not to say|do not wish to answer|prefer not to disclose)$/i.test(target)) {
    return /decline|prefer not|do not wish|choose not/i.test(opt);
  }

  // Yes / Consent / Agree
  if (/^yes$/i.test(target) || /consent|agree|accept|affirmative/i.test(target)) {
    if (/^no\b|i do not|decline|reject/i.test(opt)) return false;
    return /^yes\b|affirmative|i agree|i consent|consent|accept/i.test(opt);
  }

  // No / Decline / Do not consent
  if (/^no$/i.test(target) || /do not consent|decline|reject/i.test(target)) {
    if (/^yes\b|affirmative|i agree|i consent/i.test(opt) && !/do not/i.test(opt)) return false;
    return /^no\b|negative|i do not|none|decline|do not consent/i.test(opt);
  }

  // Numeric range matching (e.g. target "5" matching "3-5 years", "5-7 years", "5+ years")
  const numTarget = parseInt(target, 10);
  if (!isNaN(numTarget) && /^\d+$/.test(target.trim())) {
    const rangeMatch = opt.match(/(\d+)\s*(?:[-–to]+)\s*(\d+)/i);
    if (rangeMatch) {
      const min = parseInt(rangeMatch[1], 10);
      const max = parseInt(rangeMatch[2], 10);
      if (numTarget >= min && numTarget <= max) return true;
    }
    const plusMatch = opt.match(/(\d+)\s*\+/);
    if (plusMatch) {
      const min = parseInt(plusMatch[1], 10);
      if (numTarget >= min) return true;
    }
  }

  // Punctuation & whitespace normalized exact/substring matching (e.g., "Job Board (Indeed, Glassdoor, etc.)" vs "Job Board")
  const cleanOpt = opt.replace(/[\(\)\[\],.\-\/]/g, ' ').replace(/\s+/g, ' ').trim();
  const cleanTarget = target.replace(/[\(\)\[\],.\-\/]/g, ' ').replace(/\s+/g, ' ').trim();
  if (cleanOpt === cleanTarget) return true;
  if (cleanOpt.length >= 4 && cleanTarget.length >= 4) {
    if (cleanOpt.includes(cleanTarget) || cleanTarget.includes(cleanOpt)) return true;
  }

  // Fallback word regex matching
  const escaped = target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  try {
    const wordRegex = new RegExp(`\\b${escaped}\\b`, 'i');
    if (wordRegex.test(opt)) return true;
  } catch {}

  // Direct substring inclusion
  if (opt.includes(target) && target.length >= 4) {
    return true;
  }
  if (target.includes(opt) && opt.length >= 4) {
    return true;
  }

  return false;
}

/**
 * Resolves a safe answer for Hispanic/Latino screening questions.
 * Only returns "Decline to self-identify" when the options actually support a decline option.
 * If the options are strictly boolean (Yes/No), returns "Yes" or "No" based on profile.
 */
export function resolveHispanicEthnicityAnswer(
  eeocRace: string | undefined | null,
  skipSelfId?: boolean,
  options?: string[],
  required?: boolean
): string {
  const hasDeclineOption = options && options.length > 0
    ? options.find((o) => /decline|prefer not|choose not/i.test(o))
    : undefined;

  if (skipSelfId) {
    if (hasDeclineOption) {
      return hasDeclineOption;
    }
    if (eeocRace) {
      const lower = eeocRace.toLowerCase();
      if (lower.includes('hispanic') || lower.includes('latino') || lower.includes('spanish')) {
        return 'Yes';
      }
    }
    // If no decline option exists on a boolean (Yes/No) prompt, safely answer "No"
    return 'No';
  }

  if (!eeocRace) {
    if (hasDeclineOption) {
      return hasDeclineOption;
    }
    return 'No';
  }

  const lower = eeocRace.toLowerCase();
  if (lower.includes('hispanic') || lower.includes('latino') || lower.includes('spanish')) {
    return 'Yes';
  }
  if (/decline|prefer not|choose not/i.test(lower)) {
    return hasDeclineOption || 'No';
  }
  // User has specified non-Hispanic race (e.g. Asian, White, Black, Two or more, etc.)
  return 'No';
}


