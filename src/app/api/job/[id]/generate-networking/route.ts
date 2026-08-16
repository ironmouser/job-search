import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { getNetworkingMessagePrompts } from '@/lib/generator';
import { callAI } from '@/lib/ai';
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
        const semanticCheck = validateCustomInstructionSemantics(instruction, 'networking');
        if (!semanticCheck.isValid) {
            return NextResponse.json({ error: semanticCheck.reason }, { status: 400 });
        }

        const { getUserSettings, hasUserUploadedResume } = await import('@/lib/settings');
        const userPrefs = await getUserSettings(session.user.id);
        if (!hasUserUploadedResume(userPrefs?.resumeMarkdown)) {
            return NextResponse.json({ error: 'Base resume is required to generate tailored assets.', errorCode: 'MISSING_BASE_RESUME' }, { status: 400 });
        }

        const userJob = await prisma.userJob.findUnique({
            where: { userId_jobId: { userId: session.user.id, jobId } },
            include: { job: { include: { applicationAssets: { where: { userId: session.user.id } } } } }
        });

        if (!userJob) return NextResponse.json({ error: 'Job not found' }, { status: 404 });

        let asset = userJob.job.applicationAssets[0];
        if (!asset) return NextResponse.json({ error: 'Assets not generated yet' }, { status: 400 });

        if (asset.networkingMessageRegensUsed >= 5) {
            return NextResponse.json({ error: 'Regeneration limit reached (5/5).' }, { status: 403 });
        }

        const { systemPrompt, userPrompt } = await getNetworkingMessagePrompts(session.user.id, userJob.job.title, userJob.job.description || '', userJob.job.company, instruction, tone);

        // Call AI using Primary: deepseek-v4-flash -> 1st Fallback: gemini-3.1-flash-lite
        const rawNetworkingMessage = await callAI({
            task: 'generate',
            model: 'deepseek-v4-flash',
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt }
            ],
            temperature: 1.0,
            maxTokens: 1024,
            userId: session.user.id
        });

        const newNetworkingMessage = rawNetworkingMessage.replace(/—/g, '-').replace(/–/g, '-').replace(/--/g, '-').trim();

        // Output Validation Layer: Check for hallucinations / corrupted output
        const baseResumeText = userPrefs?.resumeMarkdown || '';
        const outputValidation = validateGeneratedAsset(newNetworkingMessage, baseResumeText, userJob.job.description || '', 'networking');

        if (!outputValidation.severeHallucination) {
            await prisma.applicationAsset.update({
                where: { id: asset.id },
                data: {
                    networkingMessage: newNetworkingMessage,
                    previousNetworkingMessage: asset.networkingMessage || null,
                    networkingMessageRegensUsed: asset.networkingMessageRegensUsed + 1
                }
            });
        } else {
            console.warn('[Output Validation] Networking message generation rejected due to severe hallucination:', outputValidation.warnings);
        }

        return new Response(newNetworkingMessage, {
            headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        });
    } catch (e: any) {
        console.error('Networking message generation error:', e);
        return NextResponse.json({ error: e.message || 'Failed to generate networking message' }, { status: 500 });
    }
}
