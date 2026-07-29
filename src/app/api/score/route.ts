import { NextResponse } from 'next/server';
import { scoreJob } from '@/lib/scoring';
import { prisma } from '@/lib/prisma';
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { isDescriptionAdequate, fetchJobDescription, extractUrlFromStubDescription } from '@/lib/jobFetcher';

export const maxDuration = 60;

async function ensureAndScoreJob(userId: string, job: { id: string; title: string; description: string | null; url?: string | null }) {
    let description = job.description || '';
    
    // 1. Check if description is adequate
    if (!isDescriptionAdequate(description)) {
        // Try URLs in priority order: embedded URL in stub description, then job.url
        const stubUrl = extractUrlFromStubDescription(description);
        const urlsToTry = [...new Set([stubUrl, job.url].filter(Boolean))] as string[];

        for (const tryUrl of urlsToTry) {
            console.log(`Job ${job.id} description is incomplete. Attempting to download full description from ${tryUrl}...`);
            try {
                const downloaded = await fetchJobDescription(tryUrl);
                if (downloaded && isDescriptionAdequate(downloaded)) {
                    description = downloaded + `\n\nApply at: ${tryUrl}`;
                    await prisma.job.update({
                        where: { id: job.id },
                        data: { description }
                    });
                    break; // got a good description — stop trying
                }
            } catch (e: any) {
                console.warn(`Failed to auto-download description for job ${job.id} from ${tryUrl}:`, e.message);
            }
        }
    }

    // 2. If description is still inadequate, purge any invalid/stale score and skip scoring
    if (!isDescriptionAdequate(description)) {
        console.warn(`Skipping score for job ${job.id} - description cannot be downloaded or is inadequate.`);
        await prisma.opportunityScore.deleteMany({
            where: { jobId: job.id, userId }
        });
        return { jobId: job.id, skipped: true, reason: 'Description could not be downloaded.' };
    }

    // 3. Description is adequate -> Score the job!
    const score = await scoreJob(userId, job.id, job.title, description);
    return { jobId: job.id, score: score.total_score };
}

export async function POST(request: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const isPro = (session.user as any).planTier === 'PRO';

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
                return NextResponse.json({ error: 'Free accounts are limited to 10 AI scores per week. Upgrade to Pro for unlimited scoring.', code: 'LIMIT_REACHED', limitReached: true }, { status: 403 });
            }
        }

        const body = await request.json();
        const { jobId, jobIds } = body;

        // If jobIds is provided, score all those specific jobs
        if (jobIds && Array.isArray(jobIds) && jobIds.length > 0) {
            const userJobs = await prisma.userJob.findMany({
                where: { 
                    userId: session.user.id,
                    jobId: { in: jobIds }
                },
                include: { job: { select: { id: true, title: true, description: true, url: true } } }
            });

            if (!userJobs || userJobs.length === 0) {
                return NextResponse.json({ message: 'No jobs found for provided IDs.' }, { status: 200 });
            }

            console.log(`Processing ${userJobs.length} specific jobs for scoring...`);
            
            const results = await Promise.all(
                userJobs.map(async (uj) => {
                    try {
                        return await ensureAndScoreJob(session.user.id, uj.job);
                    } catch (e: any) {
                        console.error(`Error scoring job ${uj.job.id}:`, e.message);
                        return { jobId: uj.job.id, error: e.message };
                    }
                })
            );

            return NextResponse.json({ 
                message: 'Batch scoring complete.', 
                results
            }, { status: 200 });
        }

        // If no jobId or jobIds is provided, score all unscored or newly discovered jobs for this user (capped at 5 to prevent timeout)
        if (!jobId) {
          const userJobs = await prisma.userJob.findMany({
            where: { 
              userId: session.user.id,
              OR: [
                { status: 'discovered' },
                { job: { opportunityScores: { none: { userId: session.user.id } } } }
              ]
            },
            include: { job: { select: { id: true, title: true, description: true, url: true } } },
            take: 5
          });

            if (!userJobs || userJobs.length === 0) {
                return NextResponse.json({ message: 'No unscored jobs found.' }, { status: 200 });
            }

            console.log(`Processing ${userJobs.length} unscored jobs...`);
            
            const results = await Promise.all(
                userJobs.map(async (uj) => {
                    try {
                        return await ensureAndScoreJob(session.user.id, uj.job);
                    } catch (e: any) {
                        console.error(`Error scoring job ${uj.job.id}:`, e.message);
                        return { jobId: uj.job.id, error: e.message };
                    }
                })
            );

            return NextResponse.json({ 
                message: 'Batch scoring complete.', 
                results
            }, { status: 200 });
        }

        // If jobId is provided, just score that one
        const job = await prisma.job.findUnique({
            where: { id: jobId },
            select: { id: true, title: true, description: true, url: true }
        });

        if (!job) {
            return NextResponse.json({ error: 'Job not found.' }, { status: 404 });
        }

        const result = await ensureAndScoreJob(session.user.id, job);
        if (result.skipped) {
            return NextResponse.json({ error: 'Cannot score job: Job description has not or cannot be downloaded.' }, { status: 400 });
        }

        return NextResponse.json({ 
            message: 'Job scoring complete.', 
            score: result.score 
        }, { status: 200 });

    } catch (error: any) {
        console.error('Score API Error:', error);
        return NextResponse.json({ error: error.message || 'An error occurred during scoring.' }, { status: 500 });
    }
}
