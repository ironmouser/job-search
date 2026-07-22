import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { authenticateWorker } from '@/lib/auto-apply/worker-auth';
import { AutoApplyStatus, SessionStatusUpdate } from '@/lib/auto-apply/types';

/**
 * PATCH /api/worker/sessions/[sessionId]/status
 *
 * Called by the worker to update session state throughout the workflow.
 * When status transitions to 'applied', also updates the UserJob record.
 */
export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ sessionId: string }> }
) {
  const authError = authenticateWorker(request);
  if (authError) return authError;

  const { sessionId } = await context.params;

  let body: SessionStatusUpdate;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body.status) {
    return NextResponse.json({ error: 'status is required' }, { status: 400 });
  }

  try {
    const updateData: Record<string, unknown> = {
      status: body.status,
      updatedAt: new Date(),
    };

    if (body.currentStep !== undefined) updateData.currentStep = body.currentStep;
    if (body.stepsCompleted !== undefined) updateData.stepsCompleted = body.stepsCompleted;
    if (body.stepsTotal !== undefined) updateData.stepsTotal = body.stepsTotal;
    if (body.atsPlatform !== undefined) updateData.atsPlatform = body.atsPlatform;
    if (body.atsConfidence !== undefined) updateData.atsConfidence = body.atsConfidence;
    if (body.automationConfidence !== undefined) updateData.automationConfidence = body.automationConfidence;
    if (body.failureReason !== undefined) updateData.failureReason = body.failureReason;
    if (body.failureDetails !== undefined) updateData.failureDetails = body.failureDetails;
    if (body.browserMetadata !== undefined) updateData.browserMetadata = body.browserMetadata;
    if (body.workerId !== undefined) updateData.workerId = body.workerId;

    // Set terminal timestamps
    const terminalStatuses: AutoApplyStatus[] = [
      AutoApplyStatus.APPLIED,
      AutoApplyStatus.FAILED,
      AutoApplyStatus.SIMULATED,
      AutoApplyStatus.CANCELLED,
      AutoApplyStatus.SKIPPED,
    ];
    if (terminalStatuses.includes(body.status as AutoApplyStatus)) {
      updateData.completedAt = new Date();
    }

    const session = await prisma.autoApplySession.update({
      where: { id: sessionId },
      data: updateData,
    });

    // When a real application is submitted, update the UserJob status
    if (body.status === AutoApplyStatus.APPLIED) {
      await prisma.userJob.update({
        where: {
          userId_jobId: { userId: session.userId, jobId: session.jobId },
        },
        data: {
          status: 'applied',
          appliedAt: new Date(),
        },
      });
    }

    return NextResponse.json({ success: true, sessionId });
  } catch (error: any) {
    console.error('[worker/sessions/status] Error:', error);
    return NextResponse.json({ error: 'Failed to update session status' }, { status: 500 });
  }
}
