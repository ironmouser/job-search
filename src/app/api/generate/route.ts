import { NextResponse } from 'next/server';
import { generateAssetsForJob } from '@/lib/generator';
import { supabase } from '@/lib/supabase';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { jobId } = body;

        // If no jobId is provided, find jobs that have been scored >= 80 but have no assets yet
        if (!jobId) {
            // First find highly scored jobs
            const { data: highlyScoredJobs, error: scoreError } = await supabase
                .from('opportunity_scores')
                .select('job_id, total_score')
                .gte('total_score', 80);

            if (scoreError) throw scoreError;

            if (!highlyScoredJobs || highlyScoredJobs.length === 0) {
                return NextResponse.json({ message: 'No jobs found meeting the >= 80 score threshold.' }, { status: 200 });
            }

            const highScoreJobIds = highlyScoredJobs.map(s => s.job_id);

            // Now filter to those that are still in 'scored' status (haven't had assets generated)
            const { data: pendingJobs, error: jobError } = await supabase
                .from('jobs')
                .select('id, title, description, company')
                .in('id', highScoreJobIds)
                .eq('status', 'scored');

            if (jobError) throw jobError;

            if (!pendingJobs || pendingJobs.length === 0) {
                return NextResponse.json({ message: 'No new highly-scored jobs require asset generation.' }, { status: 200 });
            }

            console.log(`Found ${pendingJobs.length} highly-scored jobs. Generating assets...`);
            
            const results = [];
            for (const job of pendingJobs) {
                try {
                    await generateAssetsForJob(job.id, job.title, job.description || '', job.company);
                    results.push({ jobId: job.id, status: 'success' });
                } catch (e: any) {
                    console.error(`Error generating assets for job ${job.id}:`, e.message);
                    results.push({ jobId: job.id, error: e.message });
                }
            }

            return NextResponse.json({ 
                message: 'Batch asset generation complete.', 
                results 
            }, { status: 200 });
        }

        // If a specific jobId is provided
        const { data: job, error: fetchError } = await supabase
            .from('jobs')
            .select('id, title, description, company')
            .eq('id', jobId)
            .single();

        if (fetchError || !job) {
            return NextResponse.json({ error: 'Job not found.' }, { status: 404 });
        }

        const assets = await generateAssetsForJob(job.id, job.title, job.description || '', job.company);

        return NextResponse.json({ 
            message: 'Asset generation complete.', 
            assets 
        }, { status: 200 });

    } catch (error: any) {
        console.error('Generate API Error:', error);
        return NextResponse.json({ error: error.message || 'An error occurred during generation.' }, { status: 500 });
    }
}
