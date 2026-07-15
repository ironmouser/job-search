import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
    try {
        // We'll fetch all jobs to compute funnel metrics client-side, 
        // or we can aggregate them here. 
        // For simplicity and to allow recent activity, fetching all light job data is fine.
        const jobs = await prisma.job.findMany({
            select: { id: true, title: true, company: true, status: true, createdAt: true, opportunityScores: { select: { totalScore: true } } },
            orderBy: { createdAt: 'desc' }
        });

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
