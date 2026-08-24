import crypto from 'crypto';

/**
 * src/lib/security/credential-vault.ts
 *
 * AES-256-GCM encryption and decryption utilities for secure storage
 * of candidate account credentials.
 */

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

function getEncryptionKey(): Buffer {
  const secret = process.env.CREDENTIAL_ENCRYPTION_KEY || process.env.NEXTAUTH_SECRET || process.env.DATABASE_URL || 'job-agent-default-secure-key-32-chars!!';
  return crypto.createHash('sha256').update(secret).digest();
}

/**
 * Encrypt a plain text string into a hex payload containing IV + Auth Tag + Ciphertext.
 */
export function encryptCredential(plainText: string): string {
  if (!plainText) return '';
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plainText, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag();

  // Combine IV (32 hex chars) + Auth Tag (32 hex chars) + Encrypted Data
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

/**
 * Decrypt a hex payload created by encryptCredential.
 */
export function decryptCredential(encryptedPayload: string): string {
  if (!encryptedPayload) return '';
  try {
    const parts = encryptedPayload.split(':');
    if (parts.length !== 3) {
      // Return as-is if unencrypted legacy plain text
      return encryptedPayload;
    }

    const [ivHex, authTagHex, encryptedHex] = parts;
    const key = getEncryptionKey();
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  } catch (err) {
    console.error('Failed to decrypt credential:', err);
    return '';
  }
}

/**
 * Normalizes hostnames for candidate portal credential scoping.
 * E.g., "wd5.myworkdayjobs.com" -> "myworkdayjobs.com"
 * "oraclecloud.com" / "taleo.net" -> "taleo.net"
 */
export function normalizeCandidateDomain(urlOrHost: string): string {
  try {
    const hostname = urlOrHost.includes('://') ? new URL(urlOrHost).hostname : urlOrHost;
    const lower = hostname.toLowerCase();

    if (lower.includes('myworkdayjobs.com') || lower.includes('workday.com')) {
      return 'myworkdayjobs.com';
    }
    if (lower.includes('taleo.net') || lower.includes('taleo.com') || lower.includes('oraclecloud.com')) {
      return 'taleo.net';
    }
    if (lower.includes('icims.com')) {
      return 'icims.com';
    }
    if (lower.includes('successfactors.com') || lower.includes('successfactors.eu')) {
      return 'successfactors.com';
    }
    if (lower.includes('smartrecruiters.com')) {
      return 'smartrecruiters.com';
    }

    // Return root domain for custom portals (e.g., "careers.airbnb.com" -> "airbnb.com")
    const segments = lower.split('.');
    if (segments.length >= 2) {
      return segments.slice(-2).join('.');
    }
    return lower;
  } catch {
    return 'unknown_domain';
  }
}
