import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { disliked, viewed, applied, archived, checked, checkedJobIds, olderThanDays, shortDescription, lowScore } = await request.json();
    const userId = session.user.id;

    // Protection rule: General cleanup filters (olderThanDays, viewed, disliked, shortDescription, lowScore)
    // MUST NOT touch active pipeline jobs or saved/archived jobs.
    const protectedExclusion = {
      isArchived: false,
      appliedAt: null,
      status: { notIn: ['applied', 'interviewing', 'offer', 'rejected', 'archived', 'saved', 'deleted'] }
    };

    const conditions: any[] = [];

    if (lowScore) {
      conditions.push({
        ...protectedExclusion,
        job: { opportunityScores: { some: { userId, totalScore: { lt: 25 } } } }
      });
    }

    if (shortDescription) {
      const allUserJobs = await prisma.userJob.findMany({
        where: {
          userId,
          ...protectedExclusion
        },
        include: { job: { select: { id: true, description: true } } }
      });
      const shortDescUserJobIds = allUserJobs
        .filter(uj => !uj.job.description || uj.job.description.trim().length <= 50)
        .map(uj => uj.id);
      if (shortDescUserJobIds.length > 0) {
        conditions.push({ id: { in: shortDescUserJobIds } });
      }
    }

    if (disliked) {
      conditions.push({
        ...protectedExclusion,
        job: { jobFeedbacks: { some: { userId, feedbackType: 'dislike' } } }
      });
    }

    if (viewed) {
      conditions.push({
        ...protectedExclusion,
        job: { isViewed: true }
      });
    }

    if (olderThanDays !== null && olderThanDays !== undefined && !isNaN(Number(olderThanDays))) {
      const days = Number(olderThanDays);
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);
      conditions.push({
        ...protectedExclusion,
        createdAt: { lt: cutoffDate }
      });
    }

    // Explicitly requested removals (only included if user specifically checked these checkboxes)
    if (applied) {
      conditions.push({
        OR: [
          { status: { in: ['applied'] } },
          { appliedAt: { not: null } }
        ]
      });
    }

    if (archived) {
      conditions.push({
        OR: [
          { isArchived: true },
          { status: { in: ['archived', 'saved'] } }
        ]
      });
    }

    if (checked && Array.isArray(checkedJobIds) && checkedJobIds.length > 0) {
      conditions.push({ jobId: { in: checkedJobIds } });
    }

    if (conditions.length === 0) {
      return NextResponse.json({ message: 'No criteria provided' }, { status: 400 });
    }

    // Find UserJobs that match ANY of the active conditions
    const matchingUserJobs = await prisma.userJob.findMany({
      where: {
        userId,
        OR: conditions
      },
      select: { id: true }
    });

    if (matchingUserJobs.length === 0) {
      return NextResponse.json({ success: true, count: 0 });
    }

    // Soft delete by setting status to 'deleted'
    const updateResult = await prisma.userJob.updateMany({
      where: {
        id: { in: matchingUserJobs.map(uj => uj.id) }
      },
      data: { status: 'deleted' }
    });

    return NextResponse.json({ success: true, count: updateResult.count });
  } catch (error) {
    console.error('Error cleaning up jobs:', error);
    return NextResponse.json({ error: 'Failed to clean up jobs' }, { status: 500 });
  }
}
