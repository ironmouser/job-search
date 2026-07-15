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

    const { disliked, viewed, applied, archived, checked, checkedJobIds, olderThanDays } = await request.json();
    const userId = session.user.id;

    // Build the query for UserJob
    const conditions: any[] = [];

    if (disliked) {
      conditions.push({
        job: { jobFeedbacks: { some: { userId, feedbackType: 'dislike' } } }
      });
    }

    if (viewed) {
      conditions.push({
        job: { isViewed: true }
      });
    }

    if (applied) {
      conditions.push({ status: 'applied' });
      conditions.push({ appliedAt: { not: null } });
    }

    if (archived) {
      conditions.push({ status: 'archived' });
    }

    if (checked && Array.isArray(checkedJobIds) && checkedJobIds.length > 0) {
      conditions.push({ jobId: { in: checkedJobIds } });
    }

    if (olderThanDays !== null && olderThanDays !== undefined && !isNaN(Number(olderThanDays))) {
      const days = Number(olderThanDays);
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);
      conditions.push({
        createdAt: { lt: cutoffDate }
      });
    }

    if (conditions.length === 0) {
      return NextResponse.json({ message: 'No criteria provided' }, { status: 400 });
    }

    // Find UserJobs that match ANY of the conditions
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
