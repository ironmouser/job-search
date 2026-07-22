import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { reformatJobDescriptionWithGemini } from '@/lib/formatter';

export async function POST() {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const jobs = await prisma.job.findMany({
            where: {
                description: { not: '' }
            }
        });

        let updatedCount = 0;
        for (const job of jobs) {
            const rawDesc = job.description || '';
            if (rawDesc.length > 50 && (!rawDesc.includes('## '))) {
                let contentToFormat = rawDesc;
                let applySuffix = '';
                const applyMatch = rawDesc.match(/(\n\nApply at: https?:\/\/\S+)$/);
                if (applyMatch) {
                    contentToFormat = rawDesc.slice(0, applyMatch.index);
                    applySuffix = applyMatch[0];
                }

                try {
                    const formatted = await reformatJobDescriptionWithGemini(contentToFormat);
                    const finalDescription = formatted + (applySuffix || (job.url ? `\n\nApply at: ${job.url}` : ''));
                    
                    await prisma.job.update({
                        where: { id: job.id },
                        data: { description: finalDescription }
                    });
                    updatedCount++;
                } catch (err: any) {
                    console.error(`Failed to reformat job ID ${job.id}:`, err?.message || err);
                }
            }
        }

        return NextResponse.json({ success: true, totalInspected: jobs.length, updatedCount });
    } catch (error: any) {
        console.error('Error reformatting jobs:', error);
        return NextResponse.json({ error: error?.message || 'Internal server error' }, { status: 500 });
    }
}
