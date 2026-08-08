import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { evaluateMobileDeviceCollision } from '@/lib/anti-abuse/detector';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { token, deviceFingerprint, cookieConsent } = body;

    if (!token) {
      return NextResponse.json({ error: 'Token is required' }, { status: 400 });
    }

    // Explicit Cookie Consent Check
    if (!cookieConsent) {
      return NextResponse.json({
        success: false,
        reason: 'COOKIE_CONSENT_REQUIRED',
        message: 'Authentication could not be completed. Device verification requires enabling cookies on your browser.',
      }, { status: 400 });
    }

    const qrSession = await prisma.qRSessionToken.findUnique({
      where: { token },
    });

    if (!qrSession) {
      return NextResponse.json({ error: 'Invalid or expired verification session token.' }, { status: 404 });
    }

    if (new Date() > qrSession.expiresAt || qrSession.status === 'expired') {
      return NextResponse.json({ error: 'Verification token has expired. Please refresh the QR code on your desktop.' }, { status: 410 });
    }

    const clientIp = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || undefined;
    const userAgent = request.headers.get('user-agent') || undefined;

    // Evaluate mobile fingerprint collision
    const result = await evaluateMobileDeviceCollision(
      qrSession.userId,
      deviceFingerprint,
      cookieConsent,
      clientIp,
      userAgent
    );

    // Update QR Session Token Status
    await prisma.qRSessionToken.update({
      where: { token },
      data: {
        status: 'verified',
        verifiedByIp: clientIp || null,
        verifiedAt: new Date(),
      },
    });

    // If no duplicate device was detected, grant the 7-day Pro trial to the user!
    if (!result.isCollision) {
      await prisma.user.update({
        where: { id: qrSession.userId },
        data: {
          trialEndsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          isTrialDeferred: false,
          trialDeferralReason: null,
        },
      });
    }

    return NextResponse.json({
      success: true,
      isCollision: result.isCollision,
      message: result.message,
    });
  } catch (error: any) {
    console.error('Error verifying mobile device session:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
