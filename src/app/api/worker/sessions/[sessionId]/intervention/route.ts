import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { authenticateWorker } from '@/lib/auto-apply/worker-auth';
import { AutoApplyStatus, CreateInterventionPayload, InterventionStatus } from '@/lib/auto-apply/types';

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

    // Create the intervention record and update session status atomically
    const [intervention] = await prisma.$transaction([
      prisma.interventionRequest.create({
        data: {
          sessionId,
          userId: session.userId,
          jobId: session.jobId,
          reason: body.reason,
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
        },
      }),
    ]);

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
    // Return the most recent unresolved intervention for this session
    const intervention = await prisma.interventionRequest.findFirst({
      where: { sessionId, resolvedAt: null },
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
