import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { encryptSession, sanitizeStorageState } from '@/lib/session-vault';

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
      return {
        id: prov.id,
        name: prov.name,
        description: prov.description,
        connected: Boolean(existing && existing.status === 'connected'),
        status: existing?.status || 'disconnected',
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
    const { provider, storageState, profileName, profileEmail } = body;

    if (!provider || typeof provider !== 'string') {
      return NextResponse.json({ error: 'Provider is required' }, { status: 400 });
    }

    const normProvider = provider.toLowerCase().trim();
    if (!SUPPORTED_PROVIDERS.some((p) => p.id === normProvider)) {
      return NextResponse.json({ error: `Unsupported provider: ${provider}` }, { status: 400 });
    }

    if (!storageState || typeof storageState !== 'object') {
      return NextResponse.json({ error: 'Valid storageState payload is required' }, { status: 400 });
    }

    const sanitized = sanitizeStorageState(storageState, normProvider);
    if (!sanitized.cookies || sanitized.cookies.length === 0) {
      return NextResponse.json({ error: `No valid authentication cookies found for ${provider}` }, { status: 400 });
    }

    const { encryptedSession, iv, authTag } = encryptSession(sanitized);

    // Default expiration: 30 days from now
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

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
        profileName: profileName || null,
        profileEmail: profileEmail || null,
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
        profileName: profileName || null,
        profileEmail: profileEmail || null,
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
        updatedAt: saved.updatedAt,
      },
    });
  } catch (error: any) {
    console.error('[ConnectedAccounts POST] Error:', error);
    return NextResponse.json({ error: error.message || 'Failed to save connected account' }, { status: 500 });
  }
}
