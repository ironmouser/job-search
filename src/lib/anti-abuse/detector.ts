import { prisma } from '@/lib/prisma';
import { normalizeEmail, isDisposableEmail } from './email-normalizer';

export interface CollisionResult {
  isCollision: boolean;
  signalType?: string;
  primaryUserId?: string | null;
  message?: string;
  isDisposable?: boolean;
}

/**
 * Checks email normalization and disposable domains upon sign-in/registration.
 */
export async function evaluateAccountCollision(
  userId: string,
  email: string,
  ipAddress?: string
): Promise<CollisionResult> {
  if (!email || !userId) {
    return { isCollision: false };
  }

  // 1. Check if email domain is disposable
  if (isDisposableEmail(email)) {
    await prisma.user.update({
      where: { id: userId },
      data: {
        isTrialDeferred: true,
        trialDeferralReason: 'DISPOSABLE_EMAIL',
      },
    });

    await prisma.accountCollisionLog.create({
      data: {
        targetUserId: userId,
        signalType: 'DISPOSABLE_EMAIL',
        details: { rawEmail: email },
        ipAddress: ipAddress || null,
      },
    });

    return {
      isCollision: true,
      signalType: 'DISPOSABLE_EMAIL',
      isDisposable: true,
      message: 'Temporary or disposable email address detected.',
    };
  }

  const normalized = normalizeEmail(email);

  // Update current user's normalized email
  await prisma.user.update({
    where: { id: userId },
    data: { normalizedEmail: normalized },
  });

  // 2. Check if another user already has this normalized email
  let existingUser = await prisma.user.findFirst({
    where: {
      normalizedEmail: normalized,
      id: { not: userId },
    },
    select: {
      id: true,
      email: true,
      unifiedQuotaGroupId: true,
      trialEndsAt: true,
    },
  });

  // Fallback for legacy users whose normalizedEmail field was not populated yet
  if (!existingUser) {
    const domain = normalized.split('@')[1];
    if (domain) {
      const candidateUsers = await prisma.user.findMany({
        where: {
          id: { not: userId },
          email: { endsWith: `@${domain}`, not: null },
        },
        select: { id: true, email: true, unifiedQuotaGroupId: true, trialEndsAt: true },
        take: 100,
      });

      const matchedCandidate = candidateUsers.find((u) => u.email && normalizeEmail(u.email) === normalized);
      if (matchedCandidate) {
        existingUser = matchedCandidate;
        await prisma.user.update({
          where: { id: matchedCandidate.id },
          data: { normalizedEmail: normalized },
        });
      }
    }
  }

  if (existingUser) {
    const quotaGroupId = existingUser.unifiedQuotaGroupId || existingUser.id;

    await prisma.user.update({
      where: { id: userId },
      data: {
        isTrialDeferred: true,
        trialDeferralReason: 'NORMALIZED_EMAIL_MATCH',
        primaryUserId: existingUser.id,
        unifiedQuotaGroupId: quotaGroupId,
        trialEndsAt: null, // Defer trial allocation
      },
    });

    // Ensure primary user also has a quota group set
    if (!existingUser.unifiedQuotaGroupId) {
      await prisma.user.update({
        where: { id: existingUser.id },
        data: { unifiedQuotaGroupId: quotaGroupId },
      });
    }

    await prisma.accountCollisionLog.create({
      data: {
        targetUserId: userId,
        primaryUserId: existingUser.id,
        signalType: 'NORMALIZED_EMAIL',
        details: { rawEmail: email, normalizedEmail: normalized },
        ipAddress: ipAddress || null,
      },
    });

    return {
      isCollision: true,
      signalType: 'NORMALIZED_EMAIL',
      primaryUserId: existingUser.id,
      message: 'An existing account was found matching this email address alias.',
    };
  }

  return { isCollision: false };
}

/**
 * Checks phone and LinkedIn profile URLs for identity collisions.
 */
export async function evaluateProfileCollision(
  userId: string,
  phone?: string | null,
  linkedinUrl?: string | null,
  ipAddress?: string
): Promise<CollisionResult> {
  if (!userId) return { isCollision: false };

  const cleanPhone = phone?.trim() || null;
  const cleanLinkedin = linkedinUrl?.trim().toLowerCase() || null;

  if (!cleanPhone && !cleanLinkedin) return { isCollision: false };

  const matchingPref = await prisma.userPreferences.findFirst({
    where: {
      userId: { not: userId },
      OR: [
        ...(cleanPhone ? [{ phone: { equals: cleanPhone, not: "" } }] : []),
        ...(cleanLinkedin ? [{ linkedinUrl: { equals: cleanLinkedin, not: "" } }] : []),
      ],
    },
    select: { userId: true, phone: true, linkedinUrl: true },
  });


  if (matchingPref) {
    const primaryUser = await prisma.user.findUnique({
      where: { id: matchingPref.userId },
      select: { id: true, unifiedQuotaGroupId: true },
    });

    if (primaryUser) {
      const quotaGroupId = primaryUser.unifiedQuotaGroupId || primaryUser.id;

      await prisma.user.update({
        where: { id: userId },
        data: {
          isTrialDeferred: true,
          trialDeferralReason: 'PROFILE_MATCH',
          primaryUserId: primaryUser.id,
          unifiedQuotaGroupId: quotaGroupId,
          trialEndsAt: null,
        },
      });

      const matchedSignal = matchingPref.phone === cleanPhone ? 'PHONE_MATCH' : 'LINKEDIN_MATCH';

      await prisma.accountCollisionLog.create({
        data: {
          targetUserId: userId,
          primaryUserId: primaryUser.id,
          signalType: matchedSignal,
          details: {
            matchedPhone: matchingPref.phone === cleanPhone ? cleanPhone : null,
            matchedLinkedin: matchingPref.linkedinUrl === cleanLinkedin ? cleanLinkedin : null,
          },
          ipAddress: ipAddress || null,
        },
      });

      return {
        isCollision: true,
        signalType: matchedSignal,
        primaryUserId: primaryUser.id,
        message: 'Profile information matches an existing registered user.',
      };
    }
  }

  return { isCollision: false };
}

/**
 * Evaluates mobile device fingerprint verification with mandatory cookie consent check.
 */
export async function evaluateMobileDeviceCollision(
  userId: string,
  deviceFingerprint: string,
  cookieConsent: boolean,
  ipAddress?: string,
  userAgent?: string
): Promise<{ success: boolean; isCollision: boolean; message: string; primaryUserId?: string | null }> {
  if (!cookieConsent) {
    return {
      success: false,
      isCollision: false,
      message: 'Authentication could not be completed. Device verification requires enabling cookies on your browser.',
    };
  }

  if (!userId || !deviceFingerprint) {
    return {
      success: false,
      isCollision: false,
      message: 'Invalid verification parameters.',
    };
  }

  // Record this device verification
  await prisma.deviceVerification.create({
    data: {
      userId,
      deviceFingerprint,
      deviceType: 'mobile',
      cookieConsent: true,
      ipAddress: ipAddress || null,
      userAgent: userAgent || null,
    },
  });

  // Check if this fingerprint was previously registered by another user
  const priorVerification = await prisma.deviceVerification.findFirst({
    where: {
      deviceFingerprint,
      userId: { not: userId },
    },
    select: { userId: true },
    orderBy: { verifiedAt: 'asc' },
  });

  if (priorVerification) {
    const primaryUser = await prisma.user.findUnique({
      where: { id: priorVerification.userId },
      select: { id: true, unifiedQuotaGroupId: true },
    });

    if (primaryUser) {
      const quotaGroupId = primaryUser.unifiedQuotaGroupId || primaryUser.id;

      await prisma.user.update({
        where: { id: userId },
        data: {
          isTrialDeferred: true,
          trialDeferralReason: 'DUPLICATE_MOBILE_DEVICE',
          primaryUserId: primaryUser.id,
          unifiedQuotaGroupId: quotaGroupId,
          trialEndsAt: null,
        },
      });

      await prisma.accountCollisionLog.create({
        data: {
          targetUserId: userId,
          primaryUserId: primaryUser.id,
          signalType: 'MOBILE_FINGERPRINT',
          details: { deviceFingerprint },
          ipAddress: ipAddress || null,
        },
      });

      return {
        success: true,
        isCollision: true,
        primaryUserId: primaryUser.id,
        message: 'This mobile device has already verified a free trial for an existing account.',
      };
    }
  }

  return {
    success: true,
    isCollision: false,
    message: 'Device verification completed successfully!',
  };
}
