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

    const activeSessions = await prisma.autoApplySession.findMany({
      where: {
        userId,
        OR: [
          { status: { in: ACTIVE_STATUSES } },
          {
            status: { in: [AutoApplyStatus.APPLIED, 'applied', AutoApplyStatus.FAILED, 'failed'] },
            updatedAt: { gte: new Date(Date.now() - 30 * 60 * 1000) }, // last 30 mins
          },
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: 25,
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

    const ongoingActiveSession = activeSessions.find(s => ACTIVE_STATUSES.includes(s.status as AutoApplyStatus)) ?? activeSessions[0] ?? null;

    return NextResponse.json({
      activeSession: ongoingActiveSession,
      activeSessions: activeSessions,
    });
  } catch (error: any) {
    console.warn('[api/auto-apply/active] Query failed (returning empty sessions):', error?.message || error);
    return NextResponse.json({ activeSession: null, activeSessions: [] });
  }
}
