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
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: 'Job ID is required' }, { status: 400 });
    }

    const userJob = await prisma.userJob.findUnique({
        where: { userId_jobId: { userId, jobId: id } },
        select: { isArchived: true }
    });
        
    if (!userJob) throw new Error('Job not found in your pipeline');

    const newArchivedState = !userJob.isArchived;

    const data = await prisma.userJob.update({
      where: { userId_jobId: { userId, jobId: id } },
      data: { isArchived: newArchivedState }
    });

    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    console.error('Error archiving job:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to archive job' },
      { status: 500 }
    );
  }
}
