import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { decryptSession, BrowserStorageState } from '@/lib/session-vault';
import { verifySessionState, probeSessionWithScraperAPI } from '@/lib/session-verifier';

export const dynamic = 'force-dynamic';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ provider: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { provider } = await params;
    if (!provider) {
      return NextResponse.json({ error: 'Provider is required' }, { status: 400 });
    }

    const normProvider = provider.toLowerCase().trim();

    const existing = await prisma.connectedJobBoard.findUnique({
      where: {
        userId_provider: {
          userId: session.user.id,
          provider: normProvider,
        },
      },
    });

    if (!existing) {
      return NextResponse.json(
        { error: `No stored connection found for ${provider}. Please connect first.` },
        { status: 404 }
      );
    }

    // Decrypt stored payload
    const decryptedState = decryptSession<BrowserStorageState>(
      existing.encryptedSession,
      existing.iv,
      existing.authTag
    );

    if (!decryptedState || !decryptedState.cookies || decryptedState.cookies.length === 0) {
      await prisma.connectedJobBoard.update({
        where: { id: existing.id },
        data: { status: 'expired', updatedAt: new Date() },
      });
      return NextResponse.json({
        success: false,
        verified: false,
        status: 'expired',
        error: 'Unable to decrypt stored session credentials. Please reconnect.',
      });
    }

    // Run ScraperAPI live residential probe
    const verification = await probeSessionWithScraperAPI(decryptedState, normProvider);

    const newStatus = verification.valid ? 'connected' : 'expired';

    const updated = await prisma.connectedJobBoard.update({
      where: { id: existing.id },
      data: {
        status: newStatus,
        profileName: verification.profileName || existing.profileName,
        profileEmail: verification.profileEmail || existing.profileEmail,
        expiresAt: verification.expiresAt || existing.expiresAt,
        updatedAt: new Date(),
      },
    });

    return NextResponse.json({
      success: true,
      verified: verification.valid,
      liveVerified: verification.liveVerified ?? false,
      status: updated.status,
      profileName: updated.profileName,
      profileEmail: updated.profileEmail,
      expiresAt: updated.expiresAt,
      daysRemaining: verification.daysRemaining,
      isExpiringSoon: verification.isExpiringSoon,
      error: verification.valid ? undefined : verification.error,
    });
  } catch (error: any) {
    console.error('[ConnectedAccounts Verify] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to verify session credentials' },
      { status: 500 }
    );
  }
}
