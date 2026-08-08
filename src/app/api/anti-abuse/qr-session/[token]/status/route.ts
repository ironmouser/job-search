import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET(
  request: NextRequest,
  { params }: { params: { token: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const resolvedParams = await Promise.resolve(params);
    const token = resolvedParams?.token;
    if (!token) {
      return NextResponse.json({ error: 'Token is required' }, { status: 400 });
    }


    const qrSession = await prisma.qRSessionToken.findUnique({
      where: { token },
    });

    if (!qrSession) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 404 });
    }

    if (qrSession.userId !== session.user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (new Date() > qrSession.expiresAt && qrSession.status === 'pending') {
      await prisma.qRSessionToken.update({
        where: { token },
        data: { status: 'expired' },
      });
      return NextResponse.json({ status: 'expired' });
    }

    // Fetch user deferral status if verified
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { isTrialDeferred: true, trialDeferralReason: true, trialEndsAt: true },
    });

    return NextResponse.json({
      status: qrSession.status,
      verifiedAt: qrSession.verifiedAt,
      isTrialDeferred: user?.isTrialDeferred || false,
      trialDeferralReason: user?.trialDeferralReason || null,
      trialEndsAt: user?.trialEndsAt || null,
    });
  } catch (error: any) {
    console.error('Error fetching QR session status:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
