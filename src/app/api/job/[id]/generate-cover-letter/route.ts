import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { getCoverLetterPrompts } from '@/lib/generator';
import { streamDeepSeek } from '@/lib/deepseek';

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const user = await prisma.user.findUnique({ where: { id: session.user.id } });
        if (!user || user.planTier !== 'PRO') {
            return NextResponse.json({ error: 'Pro account required.' }, { status: 403 });
        }

        const { id: jobId } = await context.params;
        const body = await request.json();
        const { instruction, tone } = body;

        const userJob = await prisma.userJob.findUnique({
            where: { userId_jobId: { userId: session.user.id, jobId } },
            include: { job: { include: { applicationAssets: { where: { userId: session.user.id } } } } }
        });

        if (!userJob) return NextResponse.json({ error: 'Job not found' }, { status: 404 });

        let asset = userJob.job.applicationAssets[0];
        if (!asset) return NextResponse.json({ error: 'Assets not generated yet' }, { status: 400 });

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
            temperature: 1.5,
            maxTokens: 1024,
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
                    await prisma.applicationAsset.update({
                        where: { id: asset.id },
                        data: {
                            coverLetterMarkdown: newCoverLetter,
                            coverLetterRegensUsed: asset.coverLetterRegensUsed + 1
                        }
                    });
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
