import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET() {
    try {
        // We'll fetch all jobs to compute funnel metrics client-side, 
        // or we can aggregate them here. 
        // For simplicity and to allow recent activity, fetching all light job data is fine.
        const { data: jobs, error } = await supabase
            .from('jobs')
            .select('id, title, company, status, created_at, opportunity_scores(total_score)')
            .order('created_at', { ascending: false });

        if (error) {
            throw error;
        }

        // Funnel counts
        const funnel = {
            discovered: 0,
            scored: 0,
            asset_generated: 0,
            applied: 0,
            interviewing: 0,
            rejected: 0,
            offer: 0
        };

        jobs?.forEach(job => {
            if (job.status && funnel[job.status as keyof typeof funnel] !== undefined) {
                funnel[job.status as keyof typeof funnel]++;
            }
        });

        // Recent applied/interviewing activity
        const recentActivity = jobs
            ?.filter(j => j.status === 'applied' || j.status === 'interviewing' || j.status === 'offer' || j.status === 'rejected')
            .slice(0, 10);

        return NextResponse.json({ funnel, recentActivity, total: jobs?.length || 0 });
    } catch (e: any) {
        console.error('Analytics error:', e);
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
