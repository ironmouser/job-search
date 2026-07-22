import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

/**
 * GET /api/auto-apply/[jobId]/status
 *
 * Polled by the frontend every 3 seconds to get the current status
 * of an Auto Apply session for a given job.
 *
 * Returns the most recent session for this user+job combination.
 * Returns null if no session has been created yet.
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

  try {
    const applySession = await prisma.autoApplySession.findFirst({
      where: { userId, jobId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        status: true,
        atsPlatform: true,
        atsConfidence: true,
        automationConfidence: true,
        simulationMode: true,
        currentStep: true,
        stepsCompleted: true,
        stepsTotal: true,
        failureReason: true,
        failureDetails: true,
        retryCount: true,
        startedAt: true,
        completedAt: true,
        createdAt: true,
        interventions: {
          where: { resolvedAt: null },
          select: {
            id: true,
            reason: true,
            description: true,
            screenshotUrl: true,
            pageUrl: true,
            createdAt: true,
          },
          take: 1,
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!applySession) {
      return NextResponse.json({ session: null });
    }

    return NextResponse.json({ session: applySession });
  } catch (error: any) {
    console.error('[auto-apply/status] Error:', error);
    return NextResponse.json({ error: 'Failed to retrieve session status' }, { status: 500 });
  }
}
