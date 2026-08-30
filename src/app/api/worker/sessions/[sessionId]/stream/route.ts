import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

const WORKER_URL = process.env.WORKER_URL || 'http://localhost:3001';

/**
 * GET /api/worker/sessions/[sessionId]/stream
 *
 * Proxies the real-time SSE stream from the cloud worker to the frontend client.
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ sessionId: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { sessionId: paramId } = await context.params;

  // Verify ownership and resolve actual sessionId
  let targetSessionId = paramId;
  const applySession = await prisma.autoApplySession.findFirst({
    where: { id: paramId, userId: session.user.id },
    select: { id: true },
  });

  if (!applySession) {
    const intervention = await prisma.interventionRequest.findFirst({
      where: { id: paramId, userId: session.user.id },
      select: { sessionId: true },
    });
    if (intervention) {
      targetSessionId = intervention.sessionId;
    } else {
      return NextResponse.json({ error: 'Session not found or access denied' }, { status: 404 });
    }
  }

  try {
    const workerRes = await fetch(`${WORKER_URL}/stream/events?sessionId=${targetSessionId}`, {
      headers: {
        'Accept': 'text/event-stream',
      },
    });

    if (!workerRes.ok || !workerRes.body) {
      return NextResponse.json(
        { error: `Worker stream unavailable (${workerRes.status})` },
        { status: workerRes.status }
      );
    }

    return new Response(workerRes.body as any, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
      },
    });
  } catch (err: any) {
    console.error('[StreamProxy GET] Failed to proxy stream:', err);
    return NextResponse.json({ error: 'Failed to connect to worker stream' }, { status: 502 });
  }
}

/**
 * POST /api/worker/sessions/[sessionId]/stream
 *
 * Forwards user input events (click, touch, type, key, scroll, refresh) to the cloud worker.
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ sessionId: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { sessionId: paramId } = await context.params;

  let targetSessionId = paramId;
  const applySession = await prisma.autoApplySession.findFirst({
    where: { id: paramId, userId: session.user.id },
    select: { id: true },
  });

  if (!applySession) {
    const intervention = await prisma.interventionRequest.findFirst({
      where: { id: paramId, userId: session.user.id },
      select: { sessionId: true },
    });
    if (intervention) {
      targetSessionId = intervention.sessionId;
    } else {
      return NextResponse.json({ error: 'Session not found or access denied' }, { status: 404 });
    }
  }

  try {
    const body = await request.json();
    const action = request.nextUrl.searchParams.get('action');

    const targetPath = action === 'refresh' ? '/stream/refresh' : '/stream/input';

    const workerRes = await fetch(`${WORKER_URL}${targetPath}?sessionId=${targetSessionId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const data = await workerRes.json().catch(() => ({}));
    return NextResponse.json(data, { status: workerRes.status });
  } catch (err: any) {
    console.error('[StreamProxy POST] Failed to forward input:', err);
    return NextResponse.json({ error: 'Failed to forward input to worker' }, { status: 502 });
  }
}
