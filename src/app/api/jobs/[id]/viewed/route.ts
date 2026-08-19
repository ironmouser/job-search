import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: 'Missing job id' }, { status: 400 });
    }

    // 1. Update user-specific engagement timestamp (for personalized recommendation & scoring context)
    await prisma.userJob.upsert({
      where: {
        userId_jobId: {
          userId: session.user.id,
          jobId: id,
        },
      },
      update: {
        viewedAt: new Date(),
      },
      create: {
        userId: session.user.id,
        jobId: id,
        viewedAt: new Date(),
        status: 'discovered',
      },
    }).catch((err) => {
      console.warn('[Job Viewed] UserJob update notice:', err.message);
    });

    // 2. Mark viewed on the global job record
    const job = await prisma.job.update({
      where: { id },
      data: { isViewed: true },
    }).catch(() => null);

    return NextResponse.json({ success: true, job });
  } catch (error) {
    console.error('Error marking job as viewed:', error);
    return NextResponse.json({ error: 'Failed to mark job as viewed' }, { status: 500 });
  }
}
