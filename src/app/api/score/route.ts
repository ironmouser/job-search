import { NextResponse } from 'next/server';
import { scoreJob } from '@/lib/scoring';
import { prisma } from '@/lib/prisma';
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";

export async function POST(request: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const globalSettings = await prisma.globalSettings.findUnique({ where: { id: 'system' } });
        const aiOpportunityScoringIsPro = globalSettings?.aiOpportunityScoringIsPro ?? true;
        const isPro = (session.user as any).planTier === 'PRO';

        if (aiOpportunityScoringIsPro && !isPro) {
            return NextResponse.json({ error: 'AI Opportunity Scoring is a Pro feature. Please upgrade to Pro.' }, { status: 403 });
        }

        // Free tier rate-limit: 10 AI scores per rolling 7-day window
        if (!isPro) {
            const sevenDaysAgo = new Date();
            sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
            const scoresThisWeek = await prisma.opportunityScore.count({
                where: {
                    userId: session.user.id,
                    createdAt: { gte: sevenDaysAgo }
                }
            });
            if (scoresThisWeek >= 10) {
                return NextResponse.json({ error: 'Free accounts are limited to 10 AI scores per week. Upgrade to Pro for unlimited scoring.' }, { status: 403 });
            }
        }

        const body = await request.json();
        const { jobId } = body;

        // If no jobId is provided, score all unscored jobs for this user
        if (!jobId) {
            const unscoredUserJobs = await prisma.userJob.findMany({
                where: { 
                    userId: session.user.id,
                    status: 'discovered',
                    job: { opportunityScores: { none: { userId: session.user.id } } }
                },
                include: { job: { select: { id: true, title: true, description: true } } }
            });

            if (!unscoredUserJobs || unscoredUserJobs.length === 0) {
                return NextResponse.json({ message: 'No unscored jobs found.' }, { status: 200 });
            }

            console.log(`Found ${unscoredUserJobs.length} unscored jobs. Scoring...`);
            
            const results = [];
            for (const uj of unscoredUserJobs) {
                const job = uj.job;
                try {
                    const score = await scoreJob(session.user.id, job.id, job.title, job.description || '');
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
        const job = await prisma.job.findUnique({
            where: { id: jobId },
            select: { id: true, title: true, description: true }
        });

        if (!job) {
            return NextResponse.json({ error: 'Job not found.' }, { status: 404 });
        }

        const score = await scoreJob(session.user.id, job.id, job.title, job.description || '');

        return NextResponse.json({ 
            message: 'Job scoring complete.', 
            score 
        }, { status: 200 });

    } catch (error: any) {
        console.error('Score API Error:', error);
        return NextResponse.json({ error: error.message || 'An error occurred during scoring.' }, { status: 500 });
    }
}
