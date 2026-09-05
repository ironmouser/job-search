import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { AutoApplyStatus } from '@/lib/auto-apply/types';
import { getAutoApplyQuota } from '@/lib/auto-apply/quota';
import { isAutoApplyEnabled } from '@/lib/features';

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
export async function GET() {
  if (!isAutoApplyEnabled()) {
    return NextResponse.json({ activeSession: null, activeSessions: [], quota: null });
  }
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;

    if (!prisma?.autoApplySession) {
      return NextResponse.json({ activeSession: null, activeSessions: [], quota: null });
    }

    const [activeSessions, quota] = await Promise.all([
      prisma.autoApplySession.findMany({
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
      }),
      getAutoApplyQuota(userId).catch(() => null),
    ]);

    const ongoingActiveSession = activeSessions.find(s => ACTIVE_STATUSES.includes(s.status as AutoApplyStatus)) ?? activeSessions[0] ?? null;

    return NextResponse.json({
      activeSession: ongoingActiveSession,
      activeSessions: activeSessions,
      quota,
    });
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.warn('[api/auto-apply/active] Query failed (returning empty sessions):', errorMsg);
    return NextResponse.json({ activeSession: null, activeSessions: [], quota: null });
  }
}
