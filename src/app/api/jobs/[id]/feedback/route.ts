import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;
    const { id: jobId } = await params;
    if (!jobId) {
      return NextResponse.json({ error: 'Job ID is required' }, { status: 400 });
    }

    const { feedbackType, reasons = [] } = await request.json();
    if (!feedbackType || (feedbackType !== 'like' && feedbackType !== 'dislike')) {
      return NextResponse.json({ error: 'Invalid feedbackType' }, { status: 400 });
    }

    const feedback = await prisma.jobFeedback.upsert({
      where: { userId_jobId: { userId, jobId } },
      update: { feedbackType, reasons },
      create: { userId, jobId, feedbackType, reasons }
    });

    return NextResponse.json({ success: true, feedback });
  } catch (error: any) {
    console.error('Error submitting feedback:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to submit feedback' },
      { status: 500 }
    );
  }
}
