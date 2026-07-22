import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

/**
 * GET /api/auto-apply/[jobId]/logs
 *
 * Retrieve execution logs for the most recent Auto Apply session for this job.
 * Used by the AutoApplyLogViewer component on the job detail page.
 *
 * Query params:
 *   ?sessionId=<uuid>  (optional) — specific session, defaults to latest
 *   ?limit=<n>         (optional) — max log entries to return, default 100
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ jobId: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { jobId } = await context.params;
  const userId = session.user.id;
  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get('sessionId');
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '100', 10), 500);

  try {
    // Resolve the session to use
    let targetSessionId = sessionId;

    if (!targetSessionId) {
      // Default to the most recent session for this job+user
      const latestSession = await prisma.autoApplySession.findFirst({
        where: { userId, jobId },
        orderBy: { createdAt: 'desc' },
        select: { id: true },
      });

      if (!latestSession) {
        return NextResponse.json({ logs: [], sessionId: null });
      }
      targetSessionId = latestSession.id;
    } else {
      // Verify the user owns this session
      const sessionCheck = await prisma.autoApplySession.findUnique({
        where: { id: targetSessionId },
        select: { userId: true },
      });

      if (!sessionCheck || sessionCheck.userId !== userId) {
        return NextResponse.json({ error: 'Session not found' }, { status: 404 });
      }
    }

    const logs = await prisma.executionLog.findMany({
      where: { sessionId: targetSessionId },
      orderBy: { timestamp: 'asc' },
      take: limit,
    });

    return NextResponse.json({ logs, sessionId: targetSessionId });
  } catch (error: any) {
    console.error('[auto-apply/logs] Error:', error);
    return NextResponse.json({ error: 'Failed to retrieve logs' }, { status: 500 });
  }
}
