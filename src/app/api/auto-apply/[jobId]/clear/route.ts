import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

/**
 * POST /api/auto-apply/[jobId]/clear
 *
 * Clears/dismisses an Auto Apply session from the queue.
 * Updates session's updatedAt timestamp to an old date (epoch) so that
 * `/api/auto-apply/active` (which queries items updated within the last 30 minutes)
 * immediately omits it from active/recent sessions.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { jobId } = await params;
  const userId = session.user.id;

  try {
    const applySession = await prisma.autoApplySession.findFirst({
      where: {
        userId,
        jobId,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!applySession) {
      return NextResponse.json({ error: 'No session found for this job' }, { status: 404 });
    }

    // Set updatedAt to epoch start (1970) so `/api/auto-apply/active` excludes it
    await prisma.autoApplySession.update({
      where: { id: applySession.id },
      data: {
        updatedAt: new Date(0),
      },
    });

    return NextResponse.json({ success: true, sessionId: applySession.id });
  } catch (error: any) {
    console.error('[auto-apply/clear] Error:', error);
    return NextResponse.json({ error: 'Failed to clear session' }, { status: 500 });
  }
}
