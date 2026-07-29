import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;
    const body = await request.json();
    const { rating, comment } = body;

    const numericRating = Number(rating);
    if (!rating || isNaN(numericRating) || numericRating < 1 || numericRating > 5) {
      return NextResponse.json({ error: 'Rating must be a number between 1 and 5' }, { status: 400 });
    }

    // Fetch user details & preferences for metadata
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { name: true, email: true, planTier: true },
    });

    const userPrefs = await prisma.userPreferences.findUnique({
      where: { userId },
      select: { searchKeyword: true, jobLevel: true },
    });

    // Compute user metrics
    const totalJobsApplied = await prisma.userJob.count({
      where: {
        userId,
        OR: [{ status: 'applied' }, { appliedAt: { not: null } }],
      },
    });

    const totalJobsDiscovered = await prisma.userJob.count({
      where: { userId },
    });

    const totalSyncedEmails = await prisma.userJob.count({
      where: {
        userId,
        job: {
          source: { contains: 'email', mode: 'insensitive' },
        },
      },
    });

    const userName = user?.name || session.user.name || session.user.email || 'Anonymous User';
    const planType = user?.planTier || (session.user as any).planTier || 'FREE';
    const jobTitle = userPrefs?.searchKeyword || userPrefs?.jobLevel || 'Job Seeker';

    const feedback = await (prisma as any).appFeedback.create({
      data: {
        userId,
        userName,
        planType,
        jobTitle,
        rating: Math.round(numericRating),
        totalJobsApplied,
        totalJobsDiscovered,
        totalSyncedEmails,
        comment: String(comment || '').trim(),
      },
    });

    return NextResponse.json({ success: true, feedback });
  } catch (error: any) {
    console.error('Error submitting app feedback:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to submit feedback' },
      { status: 500 }
    );
  }
}
