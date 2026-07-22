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
  context: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id: interventionId } = await context.params;
  const userId = session.user.id;

  let body: { resolution: 'completed' | 'skipped' | 'cancelled' };
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
    const intervention = await prisma.interventionRequest.findUnique({
      where: { id: interventionId },
      select: { userId: true, resolvedAt: true, sessionId: true },
    });

    if (!intervention || intervention.userId !== userId) {
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

    // If cancelled, also cancel the session
    if (body.resolution === 'cancelled') {
      await prisma.autoApplySession.update({
        where: { id: intervention.sessionId },
        data: {
          status: 'cancelled',
          completedAt: new Date(),
          failureReason: 'user_cancelled_at_intervention',
        },
      });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[interventions/resolve] Error:', error);
    return NextResponse.json({ error: 'Failed to resolve intervention' }, { status: 500 });
  }
}
