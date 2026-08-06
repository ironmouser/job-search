import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { getCoverLetterPrompts } from '@/lib/generator';
import { streamDeepSeek } from '@/lib/deepseek';
import { validateCustomInstructionSemantics, validateGeneratedAsset } from '@/lib/asset-validator';
import { getEffectiveTier } from '@/lib/tier';


export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const user = await prisma.user.findUnique({
            where: { id: session.user.id },
            select: { planTier: true, trialEndsAt: true, subscriptionType: true, orgAccessExpiresAt: true }
        });
        if (!user || getEffectiveTier(user) !== 'PRO') {
            return NextResponse.json({ error: 'Pro account required.' }, { status: 403 });
        }

        const { id: jobId } = await context.params;
        const body = await request.json();
        const { instruction, tone } = body;

        // Server-side guard 1: length check
        if (instruction && typeof instruction === 'string' && !['shorter', 'longer', 'different'].includes(instruction) && instruction.length > 200) {
            return NextResponse.json({ error: 'Custom instruction must be 200 characters or fewer.' }, { status: 400 });
        }

        // Server-side guard 2: contextual semantic validation check
        const semanticCheck = validateCustomInstructionSemantics(instruction, 'coverLetter');
        if (!semanticCheck.isValid) {
            return NextResponse.json({ error: semanticCheck.reason }, { status: 400 });
        }

        const userJob = await prisma.userJob.findUnique({
            where: { userId_jobId: { userId: session.user.id, jobId } },
            include: { job: { include: { applicationAssets: { where: { userId: session.user.id } } } } }
        });

        if (!userJob) return NextResponse.json({ error: 'Job not found' }, { status: 404 });


        let asset = userJob.job.applicationAssets[0];
        if (!asset) {
            asset = await prisma.applicationAsset.upsert({
                where: { userId_jobId: { userId: session.user.id, jobId } },
                update: {},
                create: {
                    userId: session.user.id,
                    jobId: jobId,
                }
            });
        }

        if (asset.coverLetterRegensUsed >= 5) {
            return NextResponse.json({ error: 'Regeneration limit reached (5/5).' }, { status: 403 });
        }

        const { systemPrompt, userPrompt } = await getCoverLetterPrompts(session.user.id, userJob.job.title, userJob.job.description || '', userJob.job.company, instruction, tone);

        const stream = streamDeepSeek({
            model: 'deepseek-v4-flash',
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt }
            ],
            temperature: 1.0,
            maxTokens: 2048,
            userId: session.user.id
        });

        const encoder = new TextEncoder();
        const readableStream = new ReadableStream({
            async start(controller) {
                let fullText = '';
                try {
                    for await (const chunk of stream) {
                        fullText += chunk;
                        controller.enqueue(encoder.encode(chunk));
                    }
                    
                    const newCoverLetter = fullText.replace(/—/g, '-').replace(/–/g, '-').replace(/--/g, '-').trim();
                    
                    // Output Validation Layer: Check for hallucinations / corrupted output
                    const userPrefs = await prisma.userPreferences.findUnique({ where: { userId: session.user.id } });
                    const baseResumeText = userPrefs?.resumeMarkdown || '';
                    const outputValidation = validateGeneratedAsset(newCoverLetter, baseResumeText, userJob.job.description || '', 'coverLetter');

                    if (!outputValidation.severeHallucination) {
                        const updatedAsset = await prisma.applicationAsset.update({
                            where: { id: asset.id },
                            data: {
                                coverLetterMarkdown: newCoverLetter,
                                previousCoverLetterMarkdown: asset.coverLetterMarkdown || null,
                                coverLetterRegensUsed: asset.coverLetterRegensUsed + 1
                            }
                        });

                        if (updatedAsset.tailoredResumeMarkdown?.trim() && updatedAsset.coverLetterMarkdown?.trim()) {
                            await prisma.userJob.update({
                                where: { userId_jobId: { userId: session.user.id, jobId } },
                                data: { status: 'asset_generated' }
                            }).catch(err => console.warn('Failed to update userJob status:', err));
                        }
                    } else {
                        console.warn('[Output Validation] Cover letter generation rejected due to severe hallucination:', outputValidation.warnings);
                    }
                } catch (error) {
                    console.error('Stream error:', error);
                    controller.error(error);
                } finally {
                    controller.close();
                }
            }
        });

        return new Response(readableStream, {
            headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        });
    } catch (e: any) {
        console.error(e);
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
