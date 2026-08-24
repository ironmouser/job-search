import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { authenticateWorker } from '@/lib/auto-apply/worker-auth';

/**
 * GET /api/worker/sessions/[sessionId]/email-token
 *
 * Worker endpoint to check if an email verification link or OTP code has been received.
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ sessionId: string }> }
) {
  const authError = authenticateWorker(request);
  if (authError) return authError;

  const { sessionId } = await context.params;

  try {
    const session = await prisma.autoApplySession.findUnique({
      where: { id: sessionId },
      select: { id: true, browserMetadata: true },
    });

    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    const metadata = (session.browserMetadata as Record<string, any>) || {};
    const emailVerification = metadata.emailVerification || null;

    return NextResponse.json({
      received: !!emailVerification,
      verificationData: emailVerification,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/worker/sessions/[sessionId]/email-token
 *
 * Allows manual or webhook submission of an email verification URL or OTP code.
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await context.params;

  try {
    const body = await request.json();
    const { url, otp, token } = body;

    if (!url && !otp && !token) {
      return NextResponse.json({ error: 'At least one of url, otp, or token is required' }, { status: 400 });
    }

    const session = await prisma.autoApplySession.findUnique({
      where: { id: sessionId },
      select: { id: true, browserMetadata: true },
    });

    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    const metadata = (session.browserMetadata as Record<string, any>) || {};
    const updatedMetadata = {
      ...metadata,
      emailVerification: {
        receivedAt: new Date().toISOString(),
        primaryUrl: url || metadata.emailVerification?.primaryUrl || null,
        otp: otp || metadata.emailVerification?.otp || null,
        token: token || metadata.emailVerification?.token || null,
        source: 'manual_or_api',
      },
    };

    await prisma.autoApplySession.update({
      where: { id: sessionId },
      data: { browserMetadata: updatedMetadata },
    });

    return NextResponse.json({ success: true, verificationData: updatedMetadata.emailVerification });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
