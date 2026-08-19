import * as crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const AUTH_TAG_LENGTH = 16;

function getVaultKey(): Buffer {
  const secret = process.env.SESSION_VAULT_SECRET || process.env.NEXTAUTH_SECRET || 'jahq-session-vault-fallback-secret-2026';
  return crypto.createHash('sha256').update(secret).digest();
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
    console.error('[SessionVault] Failed to decrypt session payload in worker:', error);
    return null;
  }
}
