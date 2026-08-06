/**
 * src/lib/auto-apply/failure-helpers.ts
 *
 * Formats technical auto-apply failure codes and raw error strings into
 * simple, human-understandable explanations for users.
 */

export function formatFailureExplanation(
  reason?: string | null,
  details?: string | null
): string {
  const reasonCode = (reason || '').toLowerCase().trim();
  const rawDetails = (details || '').trim();
  const combined = `${reasonCode} ${rawDetails}`.toLowerCase();

  // 1. Account creation / Login required
  if (
    reasonCode.includes('account') ||
    reasonCode.includes('login') ||
    combined.includes('create an account') ||
    combined.includes('account creation') ||
    combined.includes('sign in required') ||
    combined.includes('site specific user account') ||
    combined.includes('user account')
  ) {
    return 'The application required creating a site-specific user account.';
  }

  // 2. Unanswered Question / Missing Information
  if (
    reasonCode.includes('unknown_question') ||
    reasonCode.includes('missing_information') ||
    combined.includes('question that requires your input') ||
    combined.includes('did not have enough information') ||
    combined.includes('requires your input')
  ) {
    const questionMatch = rawDetails.match(/(?:question|input):\s*["'“]?([^"'”\n]+)["'”]?/i);
    if (questionMatch && questionMatch[1]) {
      const qText = questionMatch[1].trim();
      return `I did not have enough information to answer: "${qText.length > 70 ? qText.slice(0, 67) + '...' : qText}"`;
    }
    if (rawDetails && !rawDetails.includes('locator') && !rawDetails.includes('Timeout') && rawDetails.length < 120) {
      return `I did not have enough information to answer a required question: "${rawDetails}"`;
    }
    return 'I did not have enough information to answer a required question on the application form.';
  }

  // 3. Submit Button Not Found
  if (
    reasonCode.includes('submit_button') ||
    reasonCode.includes('element_not_found') ||
    combined.includes('submit button not found') ||
    combined.includes('could not find submit button') ||
    combined.includes('submit button')
  ) {
    return 'Could not find the submit button on the application page.';
  }

  // 4. CAPTCHA / Security Verification
  if (
    reasonCode.includes('captcha') ||
    reasonCode.includes('mfa') ||
    reasonCode.includes('bot_detection') ||
    combined.includes('captcha') ||
    combined.includes('security check') ||
    combined.includes('cloudflare')
  ) {
    return 'The application page requested a CAPTCHA or security verification.';
  }

  // 5. Missing Resume or Cover Letter Assets
  if (
    reasonCode.includes('missing_assets') ||
    reasonCode.includes('resume_rejected') ||
    reasonCode.includes('attachment_missing') ||
    combined.includes('assets') ||
    combined.includes('resume not generated')
  ) {
    return 'Application assets (tailored resume or cover letter) have not been created yet.';
  }

  // 6. Assessment / Skills Test Required
  if (
    reasonCode.includes('assessment') ||
    combined.includes('assessment required') ||
    combined.includes('skills test')
  ) {
    return 'The application requires completing an external skills assessment or test.';
  }

  // 7. User Cancelled
  if (
    reasonCode.includes('cancelled') ||
    reasonCode.includes('switched_to_manual') ||
    combined.includes('cancelled by user')
  ) {
    return 'Auto apply was stopped by the user.';
  }

  // 8. Timeout or Unexpected Layout
  if (
    reasonCode.includes('timeout') ||
    reasonCode.includes('unexpected_page') ||
    combined.includes('timeout') ||
    combined.includes('navigation failed')
  ) {
    return 'The application website took too long to load or changed its layout unexpectedly.';
  }

  // Fallback: If rawDetails exists, sanitize away raw technical code traces
  if (rawDetails) {
    let clean = rawDetails
      .replace(/page\.locator\([^)]+\)/g, '')
      .replace(/Timeout \d+ms exceeded/gi, 'Operation timed out')
      .replace(/\[data-automation-id="[^"]+"\]/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    if (clean.length > 0) {
      if (clean.length > 120) clean = clean.slice(0, 117) + '...';
      return clean;
    }
  }

  return 'An unexpected issue occurred while automating your job application.';
}
