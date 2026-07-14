'use server';

import { supabase } from '@/lib/supabase';
import { revalidatePath } from 'next/cache';

export async function submitJobFeedback(jobId: string, feedbackType: 'like' | 'dislike', reasons: string[]) {
    try {
        const { error } = await supabase
            .from('job_feedback')
            .upsert({
                job_id: jobId,
                feedback_type: feedbackType,
                reasons: reasons
            }, { onConflict: 'job_id' });

        if (error) {
            console.error('Failed to submit feedback:', error);
            return { success: false, error: error.message };
        }

        revalidatePath(`/job/${jobId}`);
        return { success: true };
    } catch (e: any) {
        console.error('Exception submitting feedback:', e);
        return { success: false, error: e.message };
    }
}
