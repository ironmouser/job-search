import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getAutoApplyQuota } from '@/lib/auto-apply/quota';

/**
 * GET /api/auto-apply/[jobId]/status
 *
 * Polled by the frontend every 3 seconds to get the current status
 * of an Auto Apply session for a given job and the user's latest quota.
 *
 * Returns the most recent session for this user+job combination.
 * Returns null session if no session has been created yet.
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
    const quota = await getAutoApplyQuota(userId).catch(() => null);

    if (!prisma?.autoApplySession) {
      return NextResponse.json({ session: null, quota });
    }

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
        confirmationScreenshotUrl: true,
        confirmationNumber: true,
        submittedAnswersSummary: true,
        interventions: {
          select: {
            id: true,
            reason: true,
            description: true,
            screenshotUrl: true,
            pageUrl: true,
            resolvedAt: true,
            resolution: true,
            createdAt: true,
          },
          take: 1,
          orderBy: { createdAt: 'desc' },
        },

      },
    });

    if (!applySession) {
      return NextResponse.json({ session: null, quota });
    }

    if (applySession.status === 'applied' || applySession.status === 'simulated') {
      applySession.automationConfidence = 100;
    }

    return NextResponse.json({ session: applySession, quota });
  } catch (error: any) {
    console.warn('[auto-apply/status] Query failed (returning null session):', error?.message || error);
    return NextResponse.json({ session: null, quota: null });
  }
}
