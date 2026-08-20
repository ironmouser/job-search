import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;
    const body = await req.json().catch(() => ({}));
    const { type, jobId } = body;

    const isResume = type === 'resume' || type === 'tailoredResume';
    const isCoverLetter = type === 'coverLetter';

    if (!isResume && !isCoverLetter) {
      return NextResponse.json({ error: 'Invalid download type' }, { status: 400 });
    }

    // 1. Increment User level download counters
    try {
      if (isResume) {
        await prisma.user.update({
          where: { id: userId },
          data: {
            resumeDownloadsCount: { increment: 1 },
          },
        });
      } else {
        await prisma.user.update({
          where: { id: userId },
          data: {
            coverLetterDownloadsCount: { increment: 1 },
          },
        });
      }
    } catch (userErr) {
      console.warn('Could not update user download counter:', userErr);
    }

    // 2. If jobId provided, increment ApplicationAsset level counter
    if (jobId) {
      try {
        const existingAsset = await prisma.applicationAsset.findUnique({
          where: {
            userId_jobId: {
              userId,
              jobId,
            },
          },
        });

        if (existingAsset) {
          if (isResume) {
            await prisma.applicationAsset.update({
              where: { id: existingAsset.id },
              data: {
                resumeDownloadsCount: { increment: 1 },
              },
            });
          } else {
            await prisma.applicationAsset.update({
              where: { id: existingAsset.id },
              data: {
                coverLetterDownloadsCount: { increment: 1 },
              },
            });
          }
        }
      } catch (assetErr) {
        console.warn('Could not update asset download counter:', assetErr);
      }
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error tracking download:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
