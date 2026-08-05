import { NextResponse } from 'next/server';
import { scoreJob } from '@/lib/scoring';
import { prisma } from '@/lib/prisma';
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { isDescriptionAdequate, fetchJobDescription, extractUrlFromStubDescription } from '@/lib/jobFetcher';
import { getEffectiveTier } from '@/lib/tier';
import { getUserSettings } from '@/lib/settings';


export const maxDuration = 60;

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

async function ensureAndScoreJob(
    userId: string,
    job: { id: string; title: string; description: string | null; url?: string | null },
    prefetchedData?: { settings: any; feedbackData: any[] }
) {
    // Option 5: bail out immediately if already scored — avoids a full AI call on stale sequence data
    const existing = await prisma.opportunityScore.findUnique({
        where: { userId_jobId: { userId, jobId: job.id } },
        select: { id: true }
    });
    if (existing) {
        return { jobId: job.id, skipped: true, reason: 'Already scored.' };
    }

    let description = job.description || '';
    
    // 1. Check if description is adequate
    if (!isDescriptionAdequate(description)) {
        const stubUrl = extractUrlFromStubDescription(description);
        const urlsToTry = [...new Set([stubUrl, job.url].filter(Boolean))] as string[];

        for (const tryUrl of urlsToTry) {
            console.log(`Job ${job.id} description is incomplete. Attempting fast fetch from ${tryUrl}...`);
            try {
                // Allow 15-second timeout on fetching description to give career sites time to respond
                const downloaded = await withTimeout(fetchJobDescription(tryUrl), 15000, null);
                if (downloaded && isDescriptionAdequate(downloaded)) {
                    description = downloaded + `\n\nApply at: ${tryUrl}`;
                    await prisma.job.update({
                        where: { id: job.id },
                        data: { description }
                    });
                    break;
                }
            } catch (e: any) {
                console.warn(`Failed to auto-download description for job ${job.id} from ${tryUrl}:`, e.message);
            }
        }
    }

    // 2. If description is still inadequate, skip scoring
    if (!isDescriptionAdequate(description)) {
        console.warn(`Skipping score for job ${job.id} - description cannot be downloaded or is inadequate.`);
        await prisma.opportunityScore.deleteMany({
            where: { jobId: job.id, userId }
        });
        return { jobId: job.id, skipped: true, reason: 'Description could not be downloaded.' };
    }

    // 3. Score the job! (Wrap scoring in 25s timeout)
    const score = await withTimeout(
      scoreJob(userId, job.id, job.title, description, prefetchedData),
      25000,
      null
    );

    if (!score) {
      return { jobId: job.id, skipped: true, reason: 'Scoring timed out.' };
    }

    return { jobId: job.id, score: score.total_score };
}

export async function POST(request: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const userRecord = await prisma.user.findUnique({
            where: { id: session.user.id },
            select: { planTier: true, trialEndsAt: true, subscriptionType: true, orgAccessExpiresAt: true }
        });
        const isPro = userRecord ? getEffectiveTier(userRecord) === 'PRO' : false;

        // Free tier (post-trial): scoring is fully blocked
        if (!isPro) {
            return NextResponse.json({
                error: 'AI Match Scoring requires a Pro account. Upgrade to Pro to unlock unlimited scoring.',
                code: 'LIMIT_REACHED',
                limitReached: true
            }, { status: 403 });
        }

        let body: any = {};
        try {
          body = await request.json();
        } catch (e) {
          // Allow empty POST body
          body = {};
        }

        const { jobId, jobIds } = body;

        // If jobIds is provided, score specific jobs (capped at 3 per batch)
        if (jobIds && Array.isArray(jobIds) && jobIds.length > 0) {
            const userJobs = await prisma.userJob.findMany({
                where: { 
                    userId: session.user.id,
                    jobId: { in: jobIds.slice(0, 3) }
                },
                include: { job: { select: { id: true, title: true, description: true, url: true } } }
            });

            if (!userJobs || userJobs.length === 0) {
                return NextResponse.json({ message: 'No jobs found for provided IDs.' }, { status: 200 });
            }

            console.log(`Processing ${userJobs.length} specific jobs for scoring...`);

            // Option 3: fetch user context once for the whole batch instead of once per job
            const [batchSettings, batchFeedback] = await Promise.all([
                getUserSettings(session.user.id),
                prisma.jobFeedback.findMany({
                    where: { userId: session.user.id },
                    select: { feedbackType: true, reasons: true, job: { select: { title: true, company: true } } },
                    orderBy: { createdAt: 'desc' },
                    take: 10
                })
            ]);
            
            const results = await Promise.all(
                userJobs.map(async (uj) => {
                    try {
                        return await ensureAndScoreJob(
                            session.user.id,
                            uj.job,
                            { settings: batchSettings, feedbackData: batchFeedback }
                        );
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

        // If no jobId or jobIds is provided, score unscored jobs (capped at 2 per request to prevent 502 timeouts)
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
                take: 2
            });

            if (!userJobs || userJobs.length === 0) {
                return NextResponse.json({ message: 'No unscored jobs found.' }, { status: 200 });
            }

            console.log(`Processing ${userJobs.length} unscored jobs...`);

            // Option 3: fetch user context once for the whole batch
            const [batchSettings, batchFeedback] = await Promise.all([
                getUserSettings(session.user.id),
                prisma.jobFeedback.findMany({
                    where: { userId: session.user.id },
                    select: { feedbackType: true, reasons: true, job: { select: { title: true, company: true } } },
                    orderBy: { createdAt: 'desc' },
                    take: 10
                })
            ]);
            
            const results = await Promise.all(
                userJobs.map(async (uj) => {
                    try {
                        return await ensureAndScoreJob(
                            session.user.id,
                            uj.job,
                            { settings: batchSettings, feedbackData: batchFeedback }
                        );
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

        // If single jobId is provided, score that one with timeout protection
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
