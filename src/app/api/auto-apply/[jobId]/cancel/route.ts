import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { AutoApplyStatus } from '@/lib/auto-apply/types';

/**
 * POST /api/auto-apply/[jobId]/cancel
 *
 * Cancels an active Auto Apply session.
 * Only works on sessions in a cancellable state (queued, processing, needs_intervention).
 * The worker detects the status change on its next poll and terminates gracefully.
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ jobId: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { jobId } = await context.params;
  const userId = session.user.id;

  const CANCELLABLE_STATUSES = [
    AutoApplyStatus.QUEUED,
    AutoApplyStatus.PROCESSING,
    AutoApplyStatus.DETECTING_ATS,
    AutoApplyStatus.PREPARING,
    AutoApplyStatus.APPLYING,
    AutoApplyStatus.VALIDATING,
    AutoApplyStatus.NEEDS_INTERVENTION,
  ];

  try {
    const applySession = await prisma.autoApplySession.findFirst({
      where: {
        userId,
        jobId,
        status: { in: CANCELLABLE_STATUSES },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!applySession) {
      return NextResponse.json({ error: 'No active session found to cancel' }, { status: 404 });
    }

    await prisma.autoApplySession.update({
      where: { id: applySession.id },
      data: {
        status: AutoApplyStatus.CANCELLED,
        completedAt: new Date(),
        failureReason: 'user_cancelled',
      },
    });

    return NextResponse.json({ success: true, sessionId: applySession.id });
  } catch (error: any) {
    console.error('[auto-apply/cancel] Error:', error);
    return NextResponse.json({ error: 'Failed to cancel session' }, { status: 500 });
  }
}
