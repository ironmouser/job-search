import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { authenticateWorker } from '@/lib/auto-apply/worker-auth';
import { encryptSession, sanitizeStorageState } from '@/lib/session-vault';

/**
 * POST /api/worker/sessions/[sessionId]/harvest-session
 *
 * Called by the worker after a user completes authentication inside an interactive stream.
 * Automatically saves and encrypts the harvested session cookies for that provider/domain.
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ sessionId: string }> }
) {
  const authError = authenticateWorker(request);
  if (authError) return authError;

  const { sessionId } = await context.params;

  try {
    const session = await prisma.autoApplySession.findUnique({
      where: { id: sessionId },
      select: { id: true, userId: true },
    });

    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    const body = await request.json();
    const { provider, storageState, cookies } = body;

    if (!provider || (!storageState && (!cookies || cookies.length === 0))) {
      return NextResponse.json({ error: 'provider and session data required' }, { status: 400 });
    }

    const stateToSave = storageState || { cookies: cookies || [] };
    const sanitized = sanitizeStorageState(stateToSave, provider.toLowerCase());
    const { encryptedSession, iv, authTag } = encryptSession(sanitized);

    // Calculate expiry (default 30 days if not in cookies)
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    const normProvider = provider.toLowerCase().trim();

    // Upsert into ConnectedJobBoard
    await prisma.connectedJobBoard.upsert({
      where: {
        userId_provider: {
          userId: session.userId,
          provider: normProvider,
        },
      },
      create: {
        userId: session.userId,
        provider: normProvider,
        status: 'connected',
        encryptedSession,
        iv,
        authTag,
        expiresAt,
        lastUsedAt: new Date(),
      },
      update: {
        status: 'connected',
        encryptedSession,
        iv,
        authTag,
        expiresAt,
        lastUsedAt: new Date(),
        updatedAt: new Date(),
      },
    });

    return NextResponse.json({ success: true, provider: normProvider });
  } catch (error: unknown) {
    console.error('[harvest-session] Error saving harvested session:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Internal server error' }, { status: 500 });
  }
}
