/**
 * src/lib/auto-apply/failure-helpers.ts
 *
 * Formats technical auto-apply failure codes and raw error strings into
 * simple, human-understandable explanations for users, along with actionable
 * next steps for retrying applications.
 */

export function getFailureTitle(
  reason?: string | null,
  details?: string | null
): string {
  const reasonCode = (reason || '').toLowerCase().trim();
  const rawDetails = (details || '').trim();
  const combined = `${reasonCode} ${rawDetails}`.toLowerCase();

  if (reasonCode === 'intervention_timeout' || combined.includes('intervention timed out')) {
    return 'Timed Out Waiting for Intervention';
  }

  if (
    reasonCode.includes('job_closed') ||
    combined.includes('no longer accepting') ||
    combined.includes('no longer available') ||
    combined.includes('position closed') ||
    combined.includes('job closed')
  ) {
    return 'Job No Longer Accepting Applications';
  }

  if (
    reasonCode.includes('account') ||
    reasonCode.includes('login') ||
    combined.includes('create an account') ||
    combined.includes('sign in required') ||
    combined.includes('candidate account')
  ) {
    return 'Candidate Account Required';
  }

  if (
    reasonCode.includes('unknown_question') ||
    reasonCode.includes('missing_information') ||
    combined.includes('question that requires your input') ||
    combined.includes('did not have enough information')
  ) {
    return 'Application Question Required';
  }

  if (
    reasonCode.includes('captcha') ||
    reasonCode.includes('mfa') ||
    reasonCode.includes('bot_challenge') ||
    combined.includes('security check')
  ) {
    return 'Security Verification Required';
  }

  if (
    reasonCode.includes('missing_assets') ||
    reasonCode.includes('resume_rejected') ||
    reasonCode.includes('attachment_missing')
  ) {
    return 'Resume or Cover Letter Missing';
  }

  if (reasonCode.includes('assessment') || combined.includes('assessment required')) {
    return 'Candidate Assessment Required';
  }

  if (reasonCode.includes('application_destination_not_found')) {
    return 'Application Destination Not Found';
  }

  if (
    reasonCode.includes('modal') ||
    reasonCode.includes('cookie') ||
    reasonCode.includes('blocked_by')
  ) {
    return 'Application Blocked by Website Overlay';
  }

  return 'Auto Apply Could Not Complete';
}

export function formatFailureExplanation(
  reason?: string | null,
  details?: string | null
): string {
  const reasonCode = (reason || '').toLowerCase().trim();
  const rawDetails = (details || '').trim();
  const combined = `${reasonCode} ${rawDetails}`.toLowerCase();

  // 1. Intervention Timeout (Timed out waiting for user action)
  if (reasonCode === 'intervention_timeout' || combined.includes('intervention timed out')) {
    const questionMatch = rawDetails.match(/(?:for|question|input):\s*["'“]?([^"'”\n]+)["'”]?/i);
    if (questionMatch && questionMatch[1]) {
      const qText = questionMatch[1].trim();
      return `Auto apply paused for human action on "${qText.length > 70 ? qText.slice(0, 67) + '...' : qText}", but timed out after 5 minutes of no response.`;
    }
    return 'Auto apply paused and requested your input, but timed out after 5 minutes of waiting for a response.';
  }

  // 2. Job Closed / No Longer Available
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

  // 3. Personal account / In-network Easy Apply (Contextual per platform)
  if (
    combined.includes('linkedin') ||
    combined.includes('cold-join') ||
    combined.includes('sign in to find your next job') ||
    combined.includes('join to apply')
  ) {
    return 'This position uses LinkedIn Easy Apply. Connect your LinkedIn account in Settings to automate these applications, or click the link above to apply directly.';
  }

  if (combined.includes('indeed') || combined.includes('indeed apply') || combined.includes('ia-directapply')) {
    return 'This position uses Indeed Apply. Connect your Indeed account in Settings to automate these applications, or click the link above to apply directly.';
  }

  if (combined.includes('ziprecruiter') || combined.includes('1-click apply') || combined.includes('zipapply')) {
    return 'This position uses ZipRecruiter 1-Click Apply. Connect your ZipRecruiter account in Settings to automate these applications, or click the link above to apply directly.';
  }

  if (combined.includes('dice') || combined.includes('dice-apply')) {
    return 'This position uses Dice Easy Apply. Connect your Dice account in Settings to automate these applications, or click the link above to apply directly.';
  }

  if (combined.includes('glassdoor')) {
    return 'This position uses Glassdoor Easy Apply. Connect your account in Settings or click the link above to apply directly.';
  }

  if (
    combined.includes('easy apply') ||
    combined.includes('personal account') ||
    combined.includes('personal profile')
  ) {
    return 'This position uses an in-network Easy Apply form that requires signing into your personal account. Please click the link above to apply directly.';
  }

  // 4. Account creation / Login required
  if (
    reasonCode.includes('account') ||
    reasonCode.includes('login') ||
    combined.includes('create an account') ||
    combined.includes('account creation') ||
    combined.includes('sign in required') ||
    combined.includes('site specific user account') ||
    combined.includes('user account')
  ) {
    return 'The employer application portal requires signing in or creating a candidate account before submitting.';
  }

  // 5. Unanswered Question / Missing Information
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

  // 6. Submit Button Not Found
  if (
    reasonCode.includes('submit_button') ||
    reasonCode.includes('element_not_found') ||
    combined.includes('submit button not found') ||
    combined.includes('could not find submit button') ||
    combined.includes('submit button')
  ) {
    return 'Could not find the submit button on the application page.';
  }

  // 7. CAPTCHA / Security Verification
  if (
    reasonCode.includes('captcha') ||
    reasonCode.includes('mfa') ||
    reasonCode.includes('bot_detection') ||
    combined.includes('captcha') ||
    combined.includes('security check') ||
    combined.includes('cloudflare')
  ) {
    return 'The application page requested a CAPTCHA or security verification that required human completion.';
  }

  // 8. Missing Resume or Cover Letter Assets
  if (
    reasonCode.includes('missing_assets') ||
    reasonCode.includes('resume_rejected') ||
    reasonCode.includes('attachment_missing') ||
    combined.includes('assets') ||
    combined.includes('resume not generated')
  ) {
    return 'Application assets (tailored resume or cover letter) have not been created yet.';
  }

  // 9. Assessment / Skills Test Required
  if (
    reasonCode.includes('assessment') ||
    combined.includes('assessment required') ||
    combined.includes('skills test')
  ) {
    return 'The application requires completing an external skills assessment or test.';
  }

  // 10. User Cancelled
  if (
    reasonCode.includes('cancelled') ||
    reasonCode.includes('switched_to_manual') ||
    combined.includes('cancelled by user')
  ) {
    return 'Auto apply was stopped by the user.';
  }

  // 11. Application destination not found (adapter failure, not ATS failure)
  if (
    reasonCode.includes('application_destination_not_found') ||
    combined.includes('unable to determine') ||
    combined.includes('application\'s destination')
  ) {
    return 'We were unable to determine this application destination from the job posting. Please open the job link to apply directly.';
  }

  // 12. Modals and UI Obstructions
  if (
    reasonCode.includes('application_blocked_by_marketing_modal') ||
    reasonCode.includes('application_blocked_by_modal') ||
    reasonCode.includes('application_blocked_by_cookie_banner') ||
    reasonCode.includes('application_blocked_by_unknown_ui') ||
    reasonCode.includes('application_found_but_not_actionable') ||
    reasonCode.includes('application_interaction_failed') ||
    combined.includes('obstructed') ||
    combined.includes('modal')
  ) {
    if (combined.includes('cookie')) {
      return 'The application button was blocked by a cookie consent banner that could not be dismissed automatically.';
    }
    if (combined.includes('marketing') || combined.includes('newsletter') || combined.includes('alert')) {
      return 'The application button was obscured by a marketing popup or modal overlay.';
    }
    return 'The application button exists on the page but was obscured or blocked by a website overlay.';
  }

  // 13. Timeout or Unexpected Layout
  if (
    reasonCode.includes('unexpected_page') ||
    combined.includes('navigation failed')
  ) {
    return 'The application website changed its layout unexpectedly or redirected to an unsupported page.';
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

export function getFailureNextSteps(
  reason?: string | null,
  details?: string | null
): string[] {
  const reasonCode = (reason || '').toLowerCase().trim();
  const rawDetails = (details || '').trim();
  const combined = `${reasonCode} ${rawDetails}`.toLowerCase();

  if (reasonCode === 'intervention_timeout' || combined.includes('intervention timed out')) {
    return [
      'If you try again, keep this page open so you can respond when the prompt appears.',
      'You will have 5 minutes to complete the requested action before the session times out.',
      'Alternatively, click "Finish Manually" to complete the application directly on the employer site.',
    ];
  }

  if (
    reasonCode.includes('job_closed') ||
    combined.includes('no longer accepting') ||
    combined.includes('position closed')
  ) {
    return [
      'This job has been filled or closed by the employer and cannot be submitted.',
      'We recommend archiving this job or looking at newer postings.',
    ];
  }

  if (
    reasonCode.includes('account') ||
    reasonCode.includes('login') ||
    combined.includes('candidate account')
  ) {
    return [
      'Check your Settings to ensure your email address and default candidate password are saved.',
      'When prompted during auto-apply, select whether to sign in or create a new account.',
      'Or click "Finish Manually" to apply directly with your existing login.',
    ];
  }

  if (
    reasonCode.includes('unknown_question') ||
    reasonCode.includes('missing_information')
  ) {
    return [
      'Review your Profile Settings to make sure work authorization, demographics, and phone number are filled in.',
      'When you start auto-apply again, answer the question in the intervention prompt so Jahq can save it and proceed.',
    ];
  }

  if (
    reasonCode.includes('captcha') ||
    reasonCode.includes('mfa') ||
    reasonCode.includes('security check')
  ) {
    return [
      'When you click Try Again, watch for the verification prompt and solve the security challenge.',
      'Once verified, click Resume Automation to allow Jahq to submit your application.',
    ];
  }

  if (
    reasonCode.includes('missing_assets') ||
    reasonCode.includes('resume_rejected')
  ) {
    return [
      'Ensure you have tailored your resume and cover letter in Steps 1 and 2.',
      'Click 1-Click Auto Apply to let Jahq generate the assets and submit.',
    ];
  }

  return [
    'Check your Profile Settings to ensure all application details are up to date.',
    'Click Try Auto Apply Again to start a new automated submission.',
    'If the issue persists, click "Finish Manually" to submit directly in your browser.',
  ];
}

