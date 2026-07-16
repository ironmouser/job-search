import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        
        // Fetch all jobs for this user from UserJob to get the correct user-specific status
        const userJobs = await prisma.userJob.findMany({
            where: { userId: session.user.id },
            include: {
                job: {
                    select: { id: true, title: true, company: true, opportunityScores: { select: { totalScore: true } } }
                }
            },
            orderBy: { createdAt: 'desc' }
        });

        const jobs = userJobs.map((uj: any) => ({
            id: uj.job.id,
            title: uj.job.title,
            company: uj.job.company,
            status: uj.status,
            createdAt: uj.createdAt,
            appliedAt: uj.appliedAt,
            opportunityScores: uj.job.opportunityScores
        }));

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
