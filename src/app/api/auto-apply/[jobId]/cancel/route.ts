import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { AutoApplyStatus } from '@/lib/auto-apply/types';

/**
 * POST /api/auto-apply/[jobId]/cancel
 *
 * Cancels or clears an Auto Apply session for a job.
 * Works on active sessions (queued, processing, needs_intervention) as well as
 * failed/stopped sessions that the user wants to dismiss/clear from the UI.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { jobId } = await params;
  const userId = session.user.id;

  try {
    const applySession = await prisma.autoApplySession.findFirst({
      where: {
        userId,
        jobId,
        status: { notIn: [AutoApplyStatus.APPLIED, 'applied', AutoApplyStatus.SIMULATED, 'simulated'] },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!applySession) {
      return NextResponse.json({ error: 'No cancellable session found' }, { status: 404 });
    }

    const now = new Date();

    // Mark session as cancelled
    await prisma.autoApplySession.update({
      where: { id: applySession.id },
      data: {
        status: AutoApplyStatus.CANCELLED,
        completedAt: now,
        failureReason: 'user_cancelled',
        failureDetails: null,
      },
    });

    // Resolve any open intervention requests for this session
    await prisma.interventionRequest.updateMany({
      where: {
        sessionId: applySession.id,
        resolvedAt: null,
      },
      data: {
        resolvedAt: now,
        resolution: 'cancelled',
      },
    });

    return NextResponse.json({ success: true, sessionId: applySession.id });
  } catch (error: any) {
    console.error('[auto-apply/cancel] Error:', error);
    return NextResponse.json({ error: 'Failed to cancel session' }, { status: 500 });
  }
}

