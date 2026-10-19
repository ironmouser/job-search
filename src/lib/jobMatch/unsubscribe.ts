import crypto from 'crypto';
import { timingSafeEqualStrings } from '@/lib/auth-helpers';

function getSecret(): string {
  return process.env.EMAIL_UNSUBSCRIBE_SECRET || process.env.NEXTAUTH_SECRET || 'job-match-unsubscribe-fallback-secret-2026';
}

export function signUnsubscribeToken(userId: string): string {
  const secret = getSecret();
  const hmac = crypto.createHmac('sha256', secret).update(`unsub:${userId}`).digest('hex');
  return `${userId}.${hmac}`;
}

export function verifyUnsubscribeToken(token: string): string | null {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;

  const [userId, providedHmac] = parts;
  if (!userId || !providedHmac) return null;

  const secret = getSecret();
  const expectedHmac = crypto.createHmac('sha256', secret).update(`unsub:${userId}`).digest('hex');

  if (!timingSafeEqualStrings(providedHmac, expectedHmac)) {
    return null;
  }

  return userId;
}

export function getUnsubscribeUrl(userId: string): string {
  const baseUrl = (process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://www.jobagenthq.com').replace(/\/+$/, '');
  const token = signUnsubscribeToken(userId);
  return `${baseUrl}/unsubscribe?token=${encodeURIComponent(token)}`;
}

export function getOneClickUnsubscribeEndpoint(userId: string): string {
  const baseUrl = (process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://www.jobagenthq.com').replace(/\/+$/, '');
  const token = signUnsubscribeToken(userId);
  return `${baseUrl}/api/email/unsubscribe?token=${encodeURIComponent(token)}`;
}
