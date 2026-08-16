import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { AutoApplyStatus } from '@/lib/auto-apply/types';

export const dynamic = 'force-dynamic';

const ACTIVE_STATUSES = [
  AutoApplyStatus.QUEUED,
  AutoApplyStatus.PROCESSING,
  AutoApplyStatus.GENERATING_ASSETS,
  AutoApplyStatus.NAVIGATING_TO_ATS,
  AutoApplyStatus.DETECTING_ATS,
  AutoApplyStatus.PREPARING,
  AutoApplyStatus.APPLYING,
  AutoApplyStatus.VALIDATING,
  AutoApplyStatus.NEEDS_REVIEW,
  AutoApplyStatus.NEEDS_INTERVENTION,
];

/**
 * GET /api/auto-apply/active
 *
 * Returns any active auto-apply session for the authenticated user across all jobs.
 * Used by GlobalAutoApplyDock to show progress and intervention alerts globally.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;

    if (!prisma?.autoApplySession) {
      return NextResponse.json({ activeSession: null });
    }

    const activeSession = await prisma.autoApplySession.findFirst({
      where: {
        userId,
        status: { in: ACTIVE_STATUSES },
      },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        jobId: true,
        status: true,
        atsPlatform: true,
        simulationMode: true,
        currentStep: true,
        stepsCompleted: true,
        stepsTotal: true,
        failureReason: true,
        failureDetails: true,
        createdAt: true,
        updatedAt: true,
        job: {
          select: {
            id: true,
            title: true,
            company: true,
          },
        },
        interventions: {
          where: { resolvedAt: null },
          select: {
            id: true,
            reason: true,
            description: true,
            screenshotUrl: true,
            pageUrl: true,
          },
          take: 1,
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    return NextResponse.json({ activeSession: activeSession ?? null });
  } catch (error: any) {
    console.warn('[api/auto-apply/active] Query failed (returning null activeSession):', error?.message || error);
    return NextResponse.json({ activeSession: null });
  }
}
