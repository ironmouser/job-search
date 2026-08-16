import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { generateApplicationAnswer } from '@/lib/generator';
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { validateCustomInstructionSemantics, validateGeneratedAsset } from '@/lib/asset-validator';
import { getEffectiveTier } from '@/lib/tier';


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

    if (!question || typeof question !== 'string' || !question.trim()) {
      return NextResponse.json({ error: 'Question is required' }, { status: 400 });
    }

    // Security Guard 1: Input Length Caps (question <= 300, instruction <= 200)
    if (question.length > 300) {
      return NextResponse.json({ error: 'Question must be 300 characters or fewer.' }, { status: 400 });
    }
    if (instruction && typeof instruction === 'string' && !['shorter', 'longer', 'different'].includes(instruction) && instruction.length > 200) {
      return NextResponse.json({ error: 'Custom instruction must be 200 characters or fewer.' }, { status: 400 });
    }

    // Security Guard 2: Contextual Semantic Validation Check
    const fullPromptText = `${question}${instruction ? ' - ' + instruction : ''}`;
    const semanticCheck = validateCustomInstructionSemantics(fullPromptText, 'qa');
    if (!semanticCheck.isValid) {
      return NextResponse.json({ error: semanticCheck.reason }, { status: 400 });
    }

    const user = await prisma.user.findUnique({ where: { id: session.user.id } });
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const planTier = user.planTier || 'FREE';
    const isPro = getEffectiveTier({
      planTier,
      trialEndsAt: user.trialEndsAt,
      subscriptionType: user.subscriptionType,
      orgAccessExpiresAt: user.orgAccessExpiresAt
    }) === 'PRO';

    // Free tier (post-trial): Q&A is fully blocked
    if (!isPro) {
      return NextResponse.json({
        error: 'Application Q&A requires a Pro account. Upgrade to Pro to unlock this feature.',
        code: 'LIMIT_REACHED'
      }, { status: 403 });
    }

    const limit = 10; // Pro limit per job

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

    const { getUserSettings, hasUserUploadedResume } = await import('@/lib/settings');
    const userPrefs = await getUserSettings(session.user.id);
    if (!hasUserUploadedResume(userPrefs?.resumeMarkdown)) {
      return NextResponse.json({ error: 'Base resume is required to answer application questions.', errorCode: 'MISSING_BASE_RESUME' }, { status: 400 });
    }
    const baseResumeText = userPrefs?.resumeMarkdown || '';

    let answer = await generateApplicationAnswer(
      session.user.id,
      userJob.job.title,
      userJob.job.description || '',
      userJob.job.company,
      question,
      tone,
      instruction
    );

    // Security Guard 3: Output Validation Check for severe hallucination
    let outputValidation = validateGeneratedAsset(answer, baseResumeText, userJob.job.description || '', 'qa');

    // Automatic single retry if quality check flagged severe hallucination/leakage
    if (outputValidation.severeHallucination) {
      console.warn('[Output Validation] Q&A answer generation flagged on attempt 1, retrying generation...');
      answer = await generateApplicationAnswer(
        session.user.id,
        userJob.job.title,
        userJob.job.description || '',
        userJob.job.company,
        question,
        tone,
        instruction
      );
      outputValidation = validateGeneratedAsset(answer, baseResumeText, userJob.job.description || '', 'qa');
    }

    if (outputValidation.severeHallucination) {
      console.warn('[Output Validation] Q&A answer generation rejected after retry:', outputValidation.warnings);
      return NextResponse.json({ error: 'The AI system experienced a quality verification issue while generating your response. Please try clicking "Generate Response" again.' }, { status: 422 });
    }

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
