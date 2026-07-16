import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { generateApplicationAnswer } from '@/lib/generator';
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await context.params;
    const body = await request.json();
    const { question, tone, instruction } = body;

    if (!question) {
      return NextResponse.json({ error: 'Question is required' }, { status: 400 });
    }

    const user = await prisma.user.findUnique({ where: { id: session.user.id } });
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const planTier = user.planTier || 'FREE';
    const limit = planTier === 'PRO' ? 10 : 2;

    const userJob = await prisma.userJob.findUnique({
      where: { userId_jobId: { userId: session.user.id, jobId: id } },
      include: { job: { include: { applicationAssets: { where: { userId: session.user.id } } } } }
    });

    if (!userJob) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    let asset = userJob.job.applicationAssets[0];
    if (!asset) {
      // Create or get asset record if it doesn't exist so we can track usage
      asset = await prisma.applicationAsset.upsert({
        where: { userId_jobId: { userId: session.user.id, jobId: id } },
        update: {},
        create: {
          jobId: id,
          userId: session.user.id,
          qaGenerationsUsed: 0
        }
      });
    }

    if (asset.qaGenerationsUsed >= limit) {
      return NextResponse.json({ error: `Limit reached (${limit}/${limit}). Please upgrade to Pro for more.` }, { status: 403 });
    }

    const answer = await generateApplicationAnswer(
      session.user.id,
      userJob.job.title,
      userJob.job.description || '',
      userJob.job.company,
      question,
      tone,
      instruction
    );

    asset = await prisma.applicationAsset.update({
      where: { id: asset.id },
      data: {
        qaGenerationsUsed: asset.qaGenerationsUsed + 1
      }
    });

    return NextResponse.json({ answer, qaGenerationsUsed: asset.qaGenerationsUsed });
  } catch (error: any) {
    console.error('Error generating QA:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
