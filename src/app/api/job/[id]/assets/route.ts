import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: jobId } = await params;
    const body = await request.json();
    const { tailoredResumeMarkdown, coverLetterMarkdown, networkingMessage } = body;

    // Check if asset exists first
    const existingAsset = await prisma.applicationAsset.findUnique({
      where: {
        userId_jobId: {
          userId: session.user.id,
          jobId,
        }
      }
    });

    if (!existingAsset) {
      return NextResponse.json({ error: 'Asset not found' }, { status: 404 });
    }

    // Build the update data object only with provided fields
    const updateData: any = {};
    if (tailoredResumeMarkdown !== undefined) {
      updateData.tailoredResumeMarkdown = tailoredResumeMarkdown;
      if (existingAsset.tailoredResumeMarkdown) {
        updateData.previousTailoredResumeMarkdown = existingAsset.tailoredResumeMarkdown;
      }
    }
    if (coverLetterMarkdown !== undefined) {
      updateData.coverLetterMarkdown = coverLetterMarkdown;
      if (existingAsset.coverLetterMarkdown) {
        updateData.previousCoverLetterMarkdown = existingAsset.coverLetterMarkdown;
      }
    }
    if (networkingMessage !== undefined) {
      updateData.networkingMessage = networkingMessage;
      if (existingAsset.networkingMessage) {
        updateData.previousNetworkingMessage = existingAsset.networkingMessage;
      }
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: 'No data to update' }, { status: 400 });
    }

    const updatedAsset = await prisma.applicationAsset.update({
      where: {
        userId_jobId: {
          userId: session.user.id,
          jobId,
        }
      },
      data: updateData,
    });

    if (updatedAsset.tailoredResumeMarkdown?.trim() && updatedAsset.coverLetterMarkdown?.trim()) {
      await prisma.userJob.update({
        where: { userId_jobId: { userId: session.user.id, jobId } },
        data: { status: 'asset_generated' }
      }).catch(err => console.warn('Failed to update userJob status:', err));
    }

    return NextResponse.json({ success: true, asset: updatedAsset });
  } catch (error: any) {
    console.error('Error updating asset:', error);
    return NextResponse.json(
      { error: 'Failed to update asset' },
      { status: 500 }
    );
  }
}
