import { DISPOSABLE_EMAIL_DOMAINS } from './disposable-domains';

/**
 * Normalizes an email address to prevent single-inbox multi-account creation.
 * Strips '+' alias tags and removes '.' from Gmail and Outlook style addresses.
 */
export function normalizeEmail(email: string): string {
  if (!email || typeof email !== 'string') return '';

  const clean = email.trim().toLowerCase();
  const parts = clean.split('@');
  if (parts.length !== 2) return clean;

  let [local, domain] = parts;

  // Handle Google / Gmail domains
  if (domain === 'gmail.com' || domain === 'googlemail.com') {
    domain = 'gmail.com';
    // Remove everything after '+'
    local = local.split('+')[0];
    // Remove dots
    local = local.replace(/\./g, '');
  } 
  // Handle Outlook / Hotmail / Live
  else if (domain === 'outlook.com' || domain === 'hotmail.com' || domain === 'live.com') {
    local = local.split('+')[0];
  }
  // Generic '+' tag stripping for other providers
  else {
    local = local.split('+')[0];
  }

  return `${local}@${domain}`;
}

/**
 * Returns true if the given email domain belongs to a known temporary/disposable provider.
 */
export function isDisposableEmail(email: string): boolean {
  if (!email || typeof email !== 'string') return false;
  const parts = email.trim().toLowerCase().split('@');
  if (parts.length !== 2) return false;
  const domain = parts[1];
  return DISPOSABLE_EMAIL_DOMAINS.has(domain);
}
