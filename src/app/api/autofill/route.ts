import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function POST(request: Request) {
    try {
        const { jobId } = await request.json();

        if (!jobId) {
            return NextResponse.json({ error: 'jobId is required' }, { status: 400 });
        }

        // Fetch job and assets
        const { data: job, error } = await supabase
            .from('jobs')
            .select('*, application_assets(*)')
            .eq('id', jobId)
            .single();

        if (error || !job) {
            return NextResponse.json({ error: 'Job not found' }, { status: 404 });
        }

        let assets = job.application_assets?.[0];
        if (!assets) {
            console.log(`Assets missing for job ${jobId}. Generating on the fly...`);
            const { generateAssetsForJob } = require('@/lib/generator');
            assets = await generateAssetsForJob(job.id, job.title, job.description, job.company);
        }

        return NextResponse.json({ 
            success: true, 
            coverLetter: assets.cover_letter_markdown
        }, { status: 200 });

    } catch (error: any) {
        console.error('Autofill API Error:', error);
        return NextResponse.json({ error: error.message || 'An error occurred fetching assets.' }, { status: 500 });
    }
}
