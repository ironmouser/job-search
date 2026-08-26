/**
 * worker/src/utils/demographic-matching.ts
 *
 * Strict utilities for detecting demographic, transgender, and gender-identity questions
 * and safely matching dropdown / radio options without false-positive substring hits.
 */

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
 * 4. Word-boundary or exact matching is enforced.
 */
export function matchesOptionSafely(optionText: string, targetValue: string): boolean {
  const opt = optionText.trim().toLowerCase();
  const target = targetValue.trim().toLowerCase();
  if (!opt || !target) return false;

  // Exact match
  if (opt === target) return true;

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

  // Yes / No
  if (/^yes$/i.test(target)) {
    return /^yes\b|affirmative|i agree/i.test(opt) && !/^no\b/i.test(opt);
  }
  if (/^no$/i.test(target)) {
    return /^no\b|negative|i do not|none/i.test(opt) && !/^yes\b/i.test(opt);
  }

  // Race / Ethnicity / Veteran / Disability or custom text matching
  const escaped = target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const wordRegex = new RegExp(`\\b${escaped}\\b`, 'i');
  if (wordRegex.test(opt)) return true;

  // Substring inclusion only if lengths are reasonably close (avoid tiny substrings matching large unrelated text)
  if (opt.includes(target) && target.length >= 4) {
    return true;
  }
  if (target.includes(opt) && opt.length >= 4) {
    return true;
  }

  return false;
}
