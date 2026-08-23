import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { encryptSession, sanitizeStorageState } from '@/lib/session-vault';
import { verifySessionState, probeSessionWithScraperAPI, normalizeSessionInput, PROVIDER_CONFIGS } from '@/lib/session-verifier';

export const dynamic = 'force-dynamic';

const SUPPORTED_PROVIDERS = [
  { id: 'linkedin', name: 'LinkedIn', description: 'LinkedIn Easy Apply applications' },
  { id: 'indeed', name: 'Indeed', description: 'Indeed Apply job submissions' },
  { id: 'ziprecruiter', name: 'ZipRecruiter', description: 'ZipRecruiter 1-Click Apply' },
  { id: 'dice', name: 'Dice', description: 'Dice Easy Apply for tech positions' },
];

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const connectedBoards = await prisma.connectedJobBoard.findMany({
      where: { userId: session.user.id },
      select: {
        provider: true,
        status: true,
        profileName: true,
        profileEmail: true,
        lastUsedAt: true,
        expiresAt: true,
        updatedAt: true,
      },
    });

    const boardMap = new Map(connectedBoards.map((b) => [b.provider.toLowerCase(), b]));

    const accounts = SUPPORTED_PROVIDERS.map((prov) => {
      const existing = boardMap.get(prov.id);
      const isExpired = existing?.expiresAt ? new Date(existing.expiresAt).getTime() < Date.now() : false;
      const status = isExpired ? 'expired' : (existing?.status || 'disconnected');

      return {
        id: prov.id,
        name: prov.name,
        description: prov.description,
        connected: Boolean(existing && status === 'connected'),
        status,
        profileName: existing?.profileName || null,
        profileEmail: existing?.profileEmail || null,
        lastUsedAt: existing?.lastUsedAt || null,
        expiresAt: existing?.expiresAt || null,
        updatedAt: existing?.updatedAt || null,
      };
    });

    return NextResponse.json({ success: true, accounts });
  } catch (error: any) {
    console.error('[ConnectedAccounts GET] Error:', error);
    return NextResponse.json({ error: error.message || 'Failed to fetch connected accounts' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { provider, storageState, authToken, profileName, profileEmail } = body;

    if (!provider || typeof provider !== 'string') {
      return NextResponse.json({ error: 'Provider is required' }, { status: 400 });
    }

    const normProvider = provider.toLowerCase().trim();
    if (!SUPPORTED_PROVIDERS.some((p) => p.id === normProvider)) {
      return NextResponse.json({ error: `Unsupported provider: ${provider}` }, { status: 400 });
    }

    const sessionPayload = storageState || authToken;
    if (!sessionPayload) {
      return NextResponse.json({ error: 'Session credentials or authentication token required' }, { status: 400 });
    }

    const normalizedState = normalizeSessionInput(sessionPayload, normProvider);

    // Run ScraperAPI live residential probe
    const verification = await probeSessionWithScraperAPI(normalizedState, normProvider);
    if (!verification.valid || !verification.storageState) {
      return NextResponse.json(
        { error: verification.error || 'Session validation failed. Please provide valid cookies.' },
        { status: 400 }
      );
    }

    const sanitized = sanitizeStorageState(verification.storageState, normProvider);
    if (!sanitized.cookies || sanitized.cookies.length === 0) {
      return NextResponse.json({ error: `No valid authentication cookies found for ${provider}` }, { status: 400 });
    }

    const { encryptedSession, iv, authTag } = encryptSession(sanitized);
    const expiresAt = verification.expiresAt || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const resolvedName = profileName || verification.profileName || null;
    const resolvedEmail = profileEmail || verification.profileEmail || null;

    const saved = await prisma.connectedJobBoard.upsert({
      where: {
        userId_provider: {
          userId: session.user.id,
          provider: normProvider,
        },
      },
      update: {
        encryptedSession,
        iv,
        authTag,
        status: 'connected',
        profileName: resolvedName,
        profileEmail: resolvedEmail,
        expiresAt,
        updatedAt: new Date(),
      },
      create: {
        userId: session.user.id,
        provider: normProvider,
        encryptedSession,
        iv,
        authTag,
        status: 'connected',
        profileName: resolvedName,
        profileEmail: resolvedEmail,
        expiresAt,
      },
    });

    return NextResponse.json({
      success: true,
      account: {
        id: saved.provider,
        status: saved.status,
        profileName: saved.profileName,
        profileEmail: saved.profileEmail,
        expiresAt: saved.expiresAt,
        daysRemaining: verification.daysRemaining,
        updatedAt: saved.updatedAt,
      },
    });
  } catch (error: any) {
    console.error('[ConnectedAccounts POST] Error:', error);
    return NextResponse.json({ error: error.message || 'Failed to save connected account' }, { status: 500 });
  }
}
