import { NextResponse } from 'next/server';
import { generateAssetsForJob } from '@/lib/generator';
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
        const aiAssetGenerationIsPro = globalSettings?.aiAssetGenerationIsPro ?? true;
        const isPro = (session.user as any).planTier === 'PRO';

        if (aiAssetGenerationIsPro && !isPro) {
            return NextResponse.json({ error: 'Tailored Resume & Cover Letter generation is a Pro feature. Please upgrade to Pro.' }, { status: 403 });
        }

        // Free tier rate-limit: 3 asset generations per rolling 7-day window
        if (!isPro) {
            const sevenDaysAgo = new Date();
            sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
            const generationsThisWeek = await prisma.applicationAsset.count({
                where: {
                    userId: session.user.id,
                    createdAt: { gte: sevenDaysAgo }
                }
            });
            if (generationsThisWeek >= 3) {
                return NextResponse.json({ error: 'Free accounts are limited to 3 asset generations per week. Upgrade to Pro for unlimited generation.' }, { status: 403 });
            }
        }

        const body = await request.json();
        const { jobId } = body;

        // If no jobId is provided, find jobs that have been scored >= 80 but have no assets yet
        if (!jobId) {
            // First find highly scored jobs
            const highlyScoredJobs = await prisma.opportunityScore.findMany({
                where: { totalScore: { gte: 80 } },
                select: { jobId: true, totalScore: true }
            });

            if (!highlyScoredJobs || highlyScoredJobs.length === 0) {
                return NextResponse.json({ message: 'No jobs found meeting the >= 80 score threshold.' }, { status: 200 });
            }

            const highScoreJobIds = highlyScoredJobs.map(s => s.jobId);

            // Now filter to those that are still in 'scored' status (haven't had assets generated)
            const pendingJobs = await prisma.job.findMany({
                where: {
                    id: { in: highScoreJobIds },
                    status: 'scored'
                },
                select: { id: true, title: true, description: true, company: true }
            });

            if (!pendingJobs || pendingJobs.length === 0) {
                return NextResponse.json({ message: 'No new highly-scored jobs require asset generation.' }, { status: 200 });
            }

            console.log(`Found ${pendingJobs.length} highly-scored jobs. Generating assets...`);
            
            const results = [];
            for (const job of pendingJobs) {
                try {
                    await generateAssetsForJob(session.user.id, job.id, job.title, job.description || '', job.company);
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
        const job = await prisma.job.findUnique({
            where: { id: jobId },
            select: { id: true, title: true, description: true, company: true }
        });

        if (!job) {
            return NextResponse.json({ error: 'Job not found.' }, { status: 404 });
        }

        const assets = await generateAssetsForJob(session.user.id, job.id, job.title, job.description || '', job.company);

        return NextResponse.json({ 
            message: 'Asset generation complete.', 
            assets 
        }, { status: 200 });

    } catch (error: any) {
        console.error('Generate API Error:', error);
        return NextResponse.json({ error: error.message || 'An error occurred during generation.' }, { status: 500 });
    }
}
