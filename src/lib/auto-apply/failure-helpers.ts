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

  // 1. Job Closed / No Longer Available
  if (
    reasonCode.includes('job_closed') ||
    combined.includes('no longer accepting') ||
    combined.includes('no longer available') ||
    combined.includes('position closed') ||
    combined.includes('job closed') ||
    combined.includes('listing closed') ||
    combined.includes('posting closed') ||
    combined.includes('has expired') ||
    combined.includes('been filled') ||
    combined.includes('applications are closed') ||
    combined.includes('applications for this position are closed') ||
    combined.includes('not accepting applications') ||
    combined.includes('vacancy closed')
  ) {
    return 'This position is no longer accepting applications or has been closed by the employer.';
  }

  // 2. Personal account / In-network Easy Apply (Contextual per platform)
  if (
    combined.includes('linkedin') ||
    combined.includes('cold-join') ||
    combined.includes('sign in to find your next job') ||
    combined.includes('join to apply')
  ) {
    return 'This position uses LinkedIn "Easy Apply" which requires signing into your personal LinkedIn account. Please click the link above to apply directly with your profile.';
  }

  if (combined.includes('indeed') || combined.includes('indeed apply') || combined.includes('ia-directapply')) {
    return 'This position uses Indeed "Apply" which requires signing into your personal Indeed account. Please click the link above to apply directly with your profile.';
  }

  if (combined.includes('ziprecruiter') || combined.includes('1-click apply') || combined.includes('zipapply')) {
    return 'This position uses ZipRecruiter "1-Click Apply" which requires your personal ZipRecruiter account. Please click the link above to apply directly with your profile.';
  }

  if (combined.includes('dice') || combined.includes('dice-apply')) {
    return 'This position uses Dice "Easy Apply" which requires signing into your personal Dice account. Please click the link above to apply directly with your profile.';
  }

  if (combined.includes('glassdoor')) {
    return 'This position uses Glassdoor "Easy Apply" which requires signing into your personal Glassdoor account. Please click the link above to apply directly with your profile.';
  }

  if (
    combined.includes('easy apply') ||
    combined.includes('personal account') ||
    combined.includes('personal profile')
  ) {
    return 'This position uses an in-network Easy Apply form that requires signing into your personal account. Please click the link above to apply directly.';
  }

  // 3. Account creation / Login required
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
