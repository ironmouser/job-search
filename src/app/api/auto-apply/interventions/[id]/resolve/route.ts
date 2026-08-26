import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

/**
 * POST /api/auto-apply/interventions/[id]/resolve
 *
 * Called by the frontend when the user resolves an intervention.
 * The worker polls for this and resumes automation on detection.
 *
 * Body: { resolution: 'completed' | 'skipped' | 'cancelled' }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id: interventionId } = await params;
  const userId = session.user.id;

  let body: {
    resolution: 'completed' | 'skipped' | 'cancelled';
    verificationUrl?: string;
    otp?: string;
    token?: string;
    answers?: Record<string, string>;
    saveForFuture?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!['completed', 'skipped', 'cancelled'].includes(body.resolution)) {
    return NextResponse.json(
      { error: 'resolution must be: completed, skipped, or cancelled' },
      { status: 400 }
    );
  }

  try {
    // Verify ownership
    let intervention = await prisma.interventionRequest.findUnique({
      where: { id: interventionId },
      select: { userId: true, resolvedAt: true, sessionId: true, reason: true, jobId: true },
    });

    if (!intervention) {
      // Check if ID is a sessionId directly
      const sessionRec = await prisma.autoApplySession.findFirst({
        where: { id: interventionId, userId },
      });
      if (sessionRec) {
        if (body.resolution === 'completed') {
          const existingMeta = (sessionRec.browserMetadata as Record<string, any>) || {};
          const sessionAnswers = {
            ...(existingMeta.sessionAnswers || {}),
            ...(body.answers || {}),
          };

          await prisma.autoApplySession.update({
            where: { id: sessionRec.id },
            data: {
              status: 'applying',
              currentStep: 'resuming',
              browserMetadata: {
                ...existingMeta,
                sessionAnswers,
              },
            },
          });

          if (body.saveForFuture && body.answers && Object.keys(body.answers).length > 0) {
            const userPrefs = await prisma.userPreferences.findUnique({
              where: { userId },
              select: { sources: true },
            });
            const existingSources = (userPrefs?.sources as Record<string, any>) || {};
            const mergedCustom = {
              ...(existingSources.customAnswers || {}),
              ...body.answers,
            };
            await prisma.userPreferences.update({
              where: { userId },
              data: {
                sources: {
                  ...existingSources,
                  customAnswers: mergedCustom,
                },
              },
            }).catch((err) => console.warn('[resolve] Could not save customAnswers to prefs:', err));
          }
        } else {
          const failureReason = sessionRec.failureReason === 'job_closed'
            ? 'job_closed'
            : body.resolution === 'skipped'
              ? 'switched_to_manual_apply'
              : 'user_cancelled_at_intervention';

          await prisma.autoApplySession.update({
            where: { id: sessionRec.id },
            data: {
              status: 'cancelled',
              completedAt: new Date(),
              failureReason,
            },
          });
        }
        return NextResponse.json({ success: true });
      }
      return NextResponse.json({ error: 'Intervention not found' }, { status: 404 });
    }

    if (intervention.resolvedAt) {
      return NextResponse.json({ error: 'Intervention already resolved' }, { status: 409 });
    }

    await prisma.interventionRequest.update({
      where: { id: interventionId },
      data: {
        resolvedAt: new Date(),
        resolution: body.resolution,
      },
    });

    // Update autoApplySession status accordingly
    if (body.resolution === 'completed') {
      const sessionRec = await prisma.autoApplySession.findUnique({
        where: { id: intervention.sessionId },
        select: { browserMetadata: true },
      });
      const existingMetadata = (sessionRec?.browserMetadata as Record<string, any>) || {};
      const sessionAnswers = {
        ...(existingMetadata.sessionAnswers || {}),
        ...(body.answers || {}),
      };

      const updatedMetadata = {
        ...existingMetadata,
        sessionAnswers,
        ...((body.verificationUrl || body.otp || body.token)
          ? {
              emailVerification: {
                receivedAt: new Date().toISOString(),
                primaryUrl: body.verificationUrl || null,
                otp: body.otp || null,
                token: body.token || null,
                source: 'intervention_resolve_ui',
              },
            }
          : {}),
      };

      await prisma.autoApplySession.update({
        where: { id: intervention.sessionId },
        data: {
          status: 'applying',
          currentStep: 'resuming',
          browserMetadata: updatedMetadata,
        },
      });

      // If user selected "Save for future applications", persist to userPreferences
      if (body.saveForFuture && body.answers && Object.keys(body.answers).length > 0) {
        const userPrefs = await prisma.userPreferences.findUnique({
          where: { userId },
          select: { sources: true },
        });
        const existingSources = (userPrefs?.sources as Record<string, any>) || {};
        const mergedCustom = {
          ...(existingSources.customAnswers || {}),
          ...body.answers,
        };

        const extraData: Record<string, any> = {
          sources: {
            ...existingSources,
            customAnswers: mergedCustom,
          },
        };

        for (const [k, v] of Object.entries(body.answers)) {
          const lower = k.toLowerCase();
          if (/gender|sex\b/i.test(lower) && !/transgender|identity/i.test(lower)) extraData.eeocGender = v;
          else if (/race|ethnicity|hispanic|latino/i.test(lower)) extraData.eeocRace = v;
          else if (/veteran|military/i.test(lower)) extraData.eeocVeteran = v;
          else if (/disability/i.test(lower)) extraData.eeocDisability = v;
        }

        await prisma.userPreferences.update({
          where: { userId },
          data: extraData,
        }).catch((err) => console.warn('[resolve] Could not save customAnswers to prefs:', err));
      }
    } else {
      const isJobClosed = intervention.reason === 'job_closed';
      const failureReason = isJobClosed
        ? 'job_closed'
        : body.resolution === 'skipped'
          ? 'switched_to_manual_apply'
          : 'user_cancelled_at_intervention';

      await prisma.autoApplySession.update({
        where: { id: intervention.sessionId },
        data: {
          status: isJobClosed ? 'skipped' : 'cancelled',
          completedAt: new Date(),
          failureReason,
        },
      });

      if (isJobClosed && intervention.jobId) {
        await prisma.userJob.updateMany({
          where: { jobId: intervention.jobId },
          data: { status: 'closed' },
        });
        await prisma.job.update({
          where: { id: intervention.jobId },
          data: { status: 'closed' },
        });
      }
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[interventions/resolve] Error:', error);
    return NextResponse.json({ error: 'Failed to resolve intervention' }, { status: 500 });
  }
}
