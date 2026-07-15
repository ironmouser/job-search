import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

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

    const job = await prisma.job.update({
      where: { id },
      data: { isViewed: true },
    });

    return NextResponse.json(job);
  } catch (error) {
    console.error('Error marking job as viewed:', error);
    return NextResponse.json({ error: 'Failed to mark job as viewed' }, { status: 500 });
  }
}
