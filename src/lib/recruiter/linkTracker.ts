/**
 * Recruiter Outreach & Tracking Utilities
 * Handles link tracking, direct contact detection, and expiration calculations.
 */

const EMAIL_REGEX = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/gi;
const PHONE_REGEX = /(?:\+?1[-.\s]?)?\(?[2-9]\d{2}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g;

/**
 * Detects whether a recruiter pitch note contains direct contact details
 * such as a phone number or personal email address.
 */
export function detectDirectContactInfo(text?: string | null): {
  hasPhone: boolean;
  hasEmail: boolean;
  detected: boolean;
} {
  if (!text || !text.trim()) {
    return { hasPhone: false, hasEmail: false, detected: false };
  }

  const hasEmail = EMAIL_REGEX.test(text);
  EMAIL_REGEX.lastIndex = 0;

  const hasPhone = PHONE_REGEX.test(text);
  PHONE_REGEX.lastIndex = 0;

  return {
    hasPhone,
    hasEmail,
    detected: hasPhone || hasEmail,
  };
}

/**
 * Calculates an expiration date given a number of business days (skipping weekends).
 * Defaults to 5 business days.
 */
export function calculateBusinessDayExpiry(startDate: Date = new Date(), businessDays: number = 5): Date {
  const result = new Date(startDate.getTime());
  let added = 0;

  while (added < businessDays) {
    result.setDate(result.getDate() + 1);
    const dayOfWeek = result.getDay();
    // 0 is Sunday, 6 is Saturday
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      added++;
    }
  }

  return result;
}

/**
 * Replaces plain URLs in a text or HTML block with tracked redirect links.
 * E.g., https://calendly.com/recruiter -> https://jobagenthq.com/api/track/click?introId=XYZ&url=https%3A%2F%2Fcalendly.com%2Frecruiter
 */
export function wrapTrackedLinks(
  content: string,
  introPublicId: string,
  baseUrl: string = process.env.NEXTAUTH_URL || 'https://www.jobagenthq.com'
): string {
  if (!content) return '';

  const cleanBase = baseUrl.replace(/\/+$/, '');
  const urlRegex = /(https?:\/\/[^\s<>"']+)/gi;

  return content.replace(urlRegex, (url) => {
    // Avoid double-wrapping if the link is already a tracking link or our own internal action
    if (url.includes('/api/track/click') || url.includes('/settings?tab=introductions')) {
      return url;
    }

    const trackingUrl = `${cleanBase}/api/track/click?introId=${encodeURIComponent(
      introPublicId
    )}&url=${encodeURIComponent(url)}`;

    return trackingUrl;
  });
}
