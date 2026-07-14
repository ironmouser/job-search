import { NextResponse } from 'next/server';
import { scoreJob } from '@/lib/scoring';
import { supabase } from '@/lib/supabase';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { jobId } = body;

        // If no jobId is provided, score all unscored jobs
        if (!jobId) {
            const { data: unscoredJobs, error } = await supabase
                .from('jobs')
                .select('id, title, description')
                .eq('status', 'discovered');

            if (error) throw error;
            if (!unscoredJobs || unscoredJobs.length === 0) {
                return NextResponse.json({ message: 'No unscored jobs found.' }, { status: 200 });
            }

            console.log(`Found ${unscoredJobs.length} unscored jobs. Scoring...`);
            
            const results = [];
            for (const job of unscoredJobs) {
                try {
                    const score = await scoreJob(job.id, job.title, job.description || '');
                    results.push({ jobId: job.id, score: score.total_score });
                } catch (e: any) {
                    console.error(`Error scoring job ${job.id}:`, e.message);
                    results.push({ jobId: job.id, error: e.message });
                }
            }

            return NextResponse.json({ 
                message: 'Batch scoring complete.', 
                results 
            }, { status: 200 });
        }

        // If jobId is provided, just score that one
        const { data: job, error: fetchError } = await supabase
            .from('jobs')
            .select('id, title, description')
            .eq('id', jobId)
            .single();

        if (fetchError || !job) {
            return NextResponse.json({ error: 'Job not found.' }, { status: 404 });
        }

        const score = await scoreJob(job.id, job.title, job.description || '');

        return NextResponse.json({ 
            message: 'Job scoring complete.', 
            score 
        }, { status: 200 });

    } catch (error: any) {
        console.error('Score API Error:', error);
        return NextResponse.json({ error: error.message || 'An error occurred during scoring.' }, { status: 500 });
    }
}
