import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { authenticateWorker } from '@/lib/auto-apply/worker-auth';
import { AutoApplyStatus, CreateInterventionPayload, InterventionStatus, InterventionReason } from '@/lib/auto-apply/types';

/**
 * POST /api/worker/sessions/[sessionId]/intervention
 *
 * Worker calls this when automation is blocked and human help is needed.
 * Creates an InterventionRequest record and updates session status.
 *
 * Returns the interventionId — worker polls GET /{sessionId}/intervention/{id}
 * to detect when the user has resolved it.
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ sessionId: string }> }
) {
  const authError = authenticateWorker(request);
  if (authError) return authError;

  const { sessionId } = await context.params;

  let body: CreateInterventionPayload;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body.reason || !body.description) {
    return NextResponse.json({ error: 'reason and description are required' }, { status: 400 });
  }

  try {
    const session = await prisma.autoApplySession.findUnique({
      where: { id: sessionId },
      select: { id: true, userId: true, jobId: true },
    });

    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    const isJobClosed =
      body.reason === InterventionReason.JOB_CLOSED ||
      body.description?.toLowerCase().includes('no longer accepting') ||
      body.description?.toLowerCase().includes('no longer available') ||
      body.description?.toLowerCase().includes('position closed') ||
      body.description?.toLowerCase().includes('job closed') ||
      body.description?.toLowerCase().includes('has expired') ||
      body.description?.toLowerCase().includes('been filled') ||
      body.description?.toLowerCase().includes('applications are closed') ||
      body.description?.toLowerCase().includes('publication is closed') ||
      body.description?.toLowerCase().includes('opening has been closed') ||
      body.description?.toLowerCase().includes('not accepting applications');

    const isDestinationNotFound =
      body.reason === InterventionReason.APPLICATION_DESTINATION_NOT_FOUND ||
      body.description?.toLowerCase().includes('unable to determine') ||
      body.description?.toLowerCase().includes("application's destination");

    const effectiveReason = isJobClosed
      ? InterventionReason.JOB_CLOSED
      : isDestinationNotFound
      ? InterventionReason.APPLICATION_DESTINATION_NOT_FOUND
      : body.reason;

    // ── Auto-skip: application_destination_not_found ──────────────────────────
    // The user cannot take meaningful action from the intervention panel when the
    // destination could not be determined — auto-resolve with 'skipped' immediately
    // so the queue is not blocked. The intervention record is still created for analytics.
    if (isDestinationNotFound) {
      const now = new Date();
      const [intervention] = await prisma.$transaction([
        prisma.interventionRequest.create({
          data: {
            sessionId,
            userId: session.userId,
            jobId: session.jobId,
            reason: effectiveReason,
            description: body.description,
            screenshotUrl: body.screenshotUrl ?? null,
            pageUrl: body.pageUrl ?? null,
            resolution: 'skipped',
            resolvedAt: now,
          },
        }),
        prisma.autoApplySession.update({
          where: { id: sessionId },
          data: {
            status: AutoApplyStatus.SKIPPED,
            currentStep: 'application_destination_not_found',
            failureReason: 'application_destination_not_found',
            failureDetails: body.description,
            completedAt: now,
          },
        }),
      ]);
      return NextResponse.json({ interventionId: intervention.id, autoResolved: true, resolution: 'skipped' });
    }

    // Create the intervention record and update session status atomically
    const transactions: any[] = [
      prisma.interventionRequest.create({
        data: {
          sessionId,
          userId: session.userId,
          jobId: session.jobId,
          reason: effectiveReason,
          description: body.description,
          screenshotUrl: body.screenshotUrl ?? null,
          pageUrl: body.pageUrl ?? null,
        },
      }),
      prisma.autoApplySession.update({
        where: { id: sessionId },
        data: {
          status: AutoApplyStatus.NEEDS_INTERVENTION,
          currentStep: 'needs_intervention',
          failureReason: isJobClosed ? 'job_closed' : undefined,
          failureDetails: body.description,
        },
      }),
    ];

    const isBotChallenge =
      effectiveReason === 'captcha' ||
      effectiveReason === 'application_blocked_by_captcha' ||
      effectiveReason === 'application_blocked_by_bot_challenge' ||
      effectiveReason === 'application_blocked_by_security_challenge' ||
      body.description?.toLowerCase().includes('bot verification') ||
      body.description?.toLowerCase().includes('cloudflare') ||
      body.description?.toLowerCase().includes('ddos protection');

    if (isBotChallenge) {
      transactions.push(
        prisma.autoApplySession.update({
          where: { id: sessionId },
          data: { automationConfidence: 15 },
        })
      );
      if (session.jobId) {
        transactions.push(
          prisma.job.update({
            where: { id: session.jobId },
            data: { consecutiveAutoFailures: 3 },
          })
        );
      }
    }

    if (isJobClosed) {
      transactions.push(
        prisma.userJob.updateMany({
          where: { userId: session.userId, jobId: session.jobId },
          data: { status: 'closed' },
        }),
        prisma.job.update({
          where: { id: session.jobId },
          data: { status: 'closed' },
        })
      );
    }

    const [intervention] = await prisma.$transaction(transactions);

    return NextResponse.json({ interventionId: intervention.id });
  } catch (error: any) {
    console.error('[worker/sessions/intervention POST] Error:', error);
    return NextResponse.json({ error: 'Failed to create intervention' }, { status: 500 });
  }
}

/**
 * GET /api/worker/sessions/[sessionId]/intervention/[interventionId]
 * Handled by the sub-route file below, but also available here for status checks.
 *
 * This endpoint returns the status of any intervention for the session.
 * Worker polls this to detect resolution.
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ sessionId: string }> }
) {
  const authError = authenticateWorker(request);
  if (authError) return authError;

  const { sessionId } = await context.params;

  try {
    // Return the most recent intervention for this session
    const intervention = await prisma.interventionRequest.findFirst({
      where: { sessionId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        resolvedAt: true,
        resolution: true,
      },
    });

    if (!intervention) {
      return NextResponse.json({ interventionId: null, resolved: false, resolution: null });
    }

    const status: InterventionStatus = {
      id: intervention.id,
      resolved: intervention.resolvedAt !== null,
      resolution: intervention.resolution as InterventionStatus['resolution'],
      resolvedAt: intervention.resolvedAt?.toISOString() ?? null,
    };

    return NextResponse.json(status);
  } catch (error: any) {
    console.error('[worker/sessions/intervention GET] Error:', error);
    return NextResponse.json({ error: 'Failed to retrieve intervention status' }, { status: 500 });
  }
}
