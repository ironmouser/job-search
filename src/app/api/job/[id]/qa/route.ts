import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { generateApplicationAnswer } from '@/lib/generator';
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

    if ((session.user as any).planTier !== 'PRO') {
      return NextResponse.json({ error: 'Application Q&A helper is a Pro feature. Please upgrade to Pro.' }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();
    const { question, tone, instruction } = body;

    if (!question) {
      return NextResponse.json({ error: 'Question is required' }, { status: 400 });
    }

    // Fetch job details
    const job = await prisma.job.findUnique({
      where: { id: id },
      select: { title: true, description: true, company: true }
    });

    if (!job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    const answer = await generateApplicationAnswer(
      job.title,
      job.description || '',
      job.company,
      question,
      tone,
      instruction
    );

    return NextResponse.json({ answer });
  } catch (error: any) {
    console.error('Error generating QA:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
