'use server';

import { prisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';

import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";

export async function submitJobFeedback(jobId: string, feedbackType: 'like' | 'dislike', reasons: string[]) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return { success: false, error: 'Unauthorized' };
        }

        const userId = session.user.id;

        await prisma.jobFeedback.upsert({
            where: { userId_jobId: { userId, jobId } },
            update: { feedbackType: feedbackType, reasons: reasons },
            create: { userId: userId, jobId: jobId, feedbackType: feedbackType, reasons: reasons }
        });

        revalidatePath(`/job/${jobId}`);
        return { success: true };
    } catch (e: any) {
        console.error('Exception submitting feedback:', e);
        return { success: false, error: e.message };
    }
}
