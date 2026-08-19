import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // Standard 96-bit IV for GCM
const AUTH_TAG_LENGTH = 16;

/**
 * Returns a 32-byte encryption key derived from environment secrets.
 */
function getVaultKey(): Buffer {
  const secret = process.env.SESSION_VAULT_SECRET || process.env.NEXTAUTH_SECRET || 'jahq-session-vault-fallback-secret-2026';
  return crypto.createHash('sha256').update(secret).digest();
}

export interface EncryptedSessionResult {
  encryptedSession: string; // Base64 ciphertext
  iv: string;               // Base64 IV
  authTag: string;          // Base64 Auth Tag
}

export interface SanitizedCookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires?: number;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: 'Strict' | 'Lax' | 'None';
}

export interface BrowserStorageState {
  cookies: SanitizedCookie[];
  origins?: Array<{
    origin: string;
    localStorage: Array<{ name: string; value: string }>;
  }>;
}

/**
 * Encrypts a Playwright storageState or arbitrary session object using AES-256-GCM.
 */
export function encryptSession(data: BrowserStorageState | Record<string, any>): EncryptedSessionResult {
  const key = getVaultKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });

  const plaintext = JSON.stringify(data);
  let encrypted = cipher.update(plaintext, 'utf8', 'base64');
  encrypted += cipher.final('base64');

  const authTag = cipher.getAuthTag();

  return {
    encryptedSession: encrypted,
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64'),
  };
}

/**
 * Decrypts an encrypted session payload using AES-256-GCM.
 */
export function decryptSession<T = BrowserStorageState>(
  encryptedSession: string,
  ivBase64: string,
  authTagBase64: string
): T | null {
  try {
    const key = getVaultKey();
    const iv = Buffer.from(ivBase64, 'base64');
    const authTag = Buffer.from(authTagBase64, 'base64');

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encryptedSession, 'base64', 'utf8');
    decrypted += decipher.final('utf8');

    return JSON.parse(decrypted) as T;
  } catch (error) {
    console.error('[SessionVault] Failed to decrypt session payload:', error);
    return null;
  }
}

/**
 * Sanitizes a browser storage state before encryption to minimize token exposure and footprint.
 */
export function sanitizeStorageState(rawState: any, provider: string): BrowserStorageState {
  if (!rawState || typeof rawState !== 'object') {
    return { cookies: [] };
  }

  const rawCookies: any[] = Array.isArray(rawState.cookies) ? rawState.cookies : [];
  
  // Domain whitelist per provider
  const domainPatterns: Record<string, string[]> = {
    ziprecruiter: ['ziprecruiter.com', 'zipapply.com'],
    dice: ['dice.com'],
    linkedin: ['linkedin.com', 'licdn.com'],
    indeed: ['indeed.com'],
  };

  const allowedDomains = domainPatterns[provider.toLowerCase()] || [];

  const cookies: SanitizedCookie[] = rawCookies
    .filter((c) => {
      if (!c.name || !c.value) return false;
      if (allowedDomains.length === 0) return true;
      const cookieDomain = (c.domain || '').toLowerCase().replace(/^\./, '');
      return allowedDomains.some((d) => cookieDomain.includes(d));
    })
    .map((c) => ({
      name: c.name,
      value: c.value,
      domain: c.domain,
      path: c.path || '/',
      expires: typeof c.expires === 'number' ? c.expires : undefined,
      httpOnly: Boolean(c.httpOnly),
      secure: Boolean(c.secure),
      sameSite: c.sameSite || 'Lax',
    }));

  const origins = Array.isArray(rawState.origins) ? rawState.origins : undefined;

  return { cookies, origins };
}
