'use server';

import { prisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';

export async function submitJobFeedback(jobId: string, feedbackType: 'like' | 'dislike', reasons: string[]) {
    try {
        await prisma.jobFeedback.upsert({
            where: { jobId: jobId },
            update: { feedbackType: feedbackType, reasons: reasons },
            create: { jobId: jobId, feedbackType: feedbackType, reasons: reasons }
        });

        revalidatePath(`/job/${jobId}`);
        return { success: true };
    } catch (e: any) {
        console.error('Exception submitting feedback:', e);
        return { success: false, error: e.message };
    }
}
