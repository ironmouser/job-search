/**
 * Job Status Detector Utility
 *
 * Detects if a job posting page indicates that the position is closed, expired,
 * filled, paused, or no longer accepting applications.
 */

export interface JobClosedDetectionResult {
  isClosed: boolean;
  reason?: string;
  matchedText?: string;
}

// High-confidence patterns safe for page text, banners, alerts, and HTML body inspection
export const STRICT_CLOSED_PATTERNS: RegExp[] = [
  /no longer accepting (?:applications|submissions|candidates|resumes)/i,
  /no longer open for applications/i,
  /not accepting applications at this time/i,
  /not currently accepting applications/i,
  /we are no longer accepting/i,
  /applications are (?:now |currently )?closed/i,
  /applications for this (?:position|role|job|opening) are (?:now |currently )?closed/i,
  /this (?:position|role|job|opening|posting|vacancy|listing|requisition) (?:is|has been) (?:no longer available|closed|filled|expired|archived|paused|removed|cancelled|inactive|ended)/i,
  /this (?:position|role|job|opening|posting|vacancy|listing|requisition) is no longer (?:accepting applications|active|open|available|taking applications)/i,
  /the (?:job|position|role|posting) you are (?:looking for|trying to view) (?:has closed|is no longer available|has expired|is no longer active|is closed)/i,
  /the job posting you are looking for has closed or expired/i,
  /the job you selected is no longer open for applications/i,
  /job (?:posting|listing) has expired/i,
  /posting has expired/i,
  /listing has expired/i,
  /position (?:has been )?filled/i,
  /role (?:has been )?filled/i,
  /job (?:has been )?filled/i,
  /vacancy (?:closed|expired|filled)/i,
  /sorry,\s*(?:this\s*)?(?:job|position|role|opening)\s*(?:is no longer available|has expired|is no longer open|is closed)/i,
  /this publication is closed/i,
  /this opening has been closed/i,
  /this job is no longer open/i,
  /this job is closed/i,
  /this position is closed/i,
  /this role is closed/i,
  /application deadline has passed/i,
  /deadline for applications has passed/i,
  /submissions are closed/i,
  /this job has been archived/i,
  /job is inactive/i,
  /this posting is inactive/i,
  /this listing is inactive/i,
];

/**
 * Checks if HTML or plain text indicates the job is closed.
 */
export function isClosedJobText(text: string): JobClosedDetectionResult {
  if (!text || text.trim().length === 0) {
    return { isClosed: false };
  }

  for (const pattern of STRICT_CLOSED_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      return {
        isClosed: true,
        reason: 'This position is no longer accepting applications or has been closed by the employer.',
        matchedText: match[0],
      };
    }
  }

  return { isClosed: false };
}

/**
 * Evaluates whether an HTTP response status code (e.g. 404, 410) represents a closed job.
 */
export function isClosedHttpStatus(statusCode?: number): boolean {
  if (!statusCode) return false;
  return statusCode === 404 || statusCode === 410;
}
