import { NextResponse } from 'next/server';
import { scoreJob, scoreJobsBatch } from '@/lib/scoring';
import { prisma } from '@/lib/prisma';
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { isDescriptionAdequate, fetchJobDescription, extractUrlFromStubDescription } from '@/lib/jobFetcher';
import { getEffectiveTier } from '@/lib/tier';
import { getUserSettings } from '@/lib/settings';

export const maxDuration = 60;

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  let timerId: NodeJS.Timeout | null = null;
  const timeoutPromise = new Promise<T>((resolve) => {
    timerId = setTimeout(() => resolve(fallback), ms);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timerId) clearTimeout(timerId);
  });
}


async function ensureJobDescription(
    job: { id: string; title: string; description: string | null; url?: string | null; createdAt?: Date }
): Promise<string | null> {
    let description = job.description || '';

    if (isDescriptionAdequate(description)) {
        return description;
    }

    // Freshness check: If job was created in the last 6 hours and has an inadequate description,
    // only attempt auto-download once if url is present
    const stubUrl = extractUrlFromStubDescription(description);
    const urlsToTry = [...new Set([stubUrl, job.url].filter(Boolean))] as string[];

    for (const tryUrl of urlsToTry) {
        console.log(`Job ${job.id} description is incomplete. Attempting fast fetch from ${tryUrl}...`);
        try {
            const downloaded = await withTimeout(fetchJobDescription(tryUrl), 15000, null);
            if (downloaded && isDescriptionAdequate(downloaded)) {
                description = downloaded + `\n\nApply at: ${tryUrl}`;
                await prisma.job.update({
                    where: { id: job.id },
                    data: { description }
                }).catch(() => {});
                return description;
            }
        } catch (e: any) {
            console.warn(`Failed to auto-download description for job ${job.id} from ${tryUrl}:`, e.message);
        }
    }

    return isDescriptionAdequate(description) ? description : null;
}

async function ensureAndScoreJob(
    userId: string,
    job: { id: string; title: string; description: string | null; url?: string | null; createdAt?: Date },
    prefetchedData?: { settings: any; feedbackData: any[] }
) {
    const existing = await prisma.opportunityScore.findUnique({
        where: { userId_jobId: { userId, jobId: job.id } },
        select: { id: true, totalScore: true }
    });
    if (existing) {
        return { jobId: job.id, score: existing.totalScore, skipped: true, reason: 'Already scored.' };
    }

    const description = await ensureJobDescription(job);

    if (!description) {
        console.warn(`Skipping score for job ${job.id} - description cannot be downloaded or is inadequate.`);
        return { jobId: job.id, skipped: true, reason: 'Description could not be downloaded.' };
    }

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
        } catch {
          body = {};
        }

        const { jobId, jobIds } = body;

        // If jobIds is provided, score specific jobs (capped at 5 per batch)
        if (jobIds && Array.isArray(jobIds) && jobIds.length > 0) {
            const userJobs = await prisma.userJob.findMany({
                where: { 
                    userId: session.user.id,
                    jobId: { in: jobIds.slice(0, 5) }
                },
                include: { job: { select: { id: true, title: true, description: true, url: true, createdAt: true } } }
            });

            if (!userJobs || userJobs.length === 0) {
                return NextResponse.json({ message: 'No jobs found for provided IDs.' }, { status: 200 });
            }

            console.log(`Processing ${userJobs.length} specific jobs for scoring...`);

            const [batchSettings, batchFeedback] = await Promise.all([
                getUserSettings(session.user.id),
                prisma.jobFeedback.findMany({
                    where: { userId: session.user.id },
                    select: { feedbackType: true, reasons: true, job: { select: { title: true, company: true } } },
                    orderBy: { createdAt: 'desc' },
                    take: 10
                })
            ]);

            // Ensure descriptions first in parallel
            const jobsWithDesc: Array<{ id: string; title: string; description: string }> = [];
            const skippedResults: any[] = [];

            await Promise.all(
                userJobs.map(async (uj) => {
                    const desc = await ensureJobDescription(uj.job);
                    if (desc) {
                        jobsWithDesc.push({ id: uj.job.id, title: uj.job.title, description: desc });
                    } else {
                        skippedResults.push({ jobId: uj.job.id, skipped: true, reason: 'Description inadequate.' });
                    }
                })
            );

            let batchResults: any[] = [];
            if (jobsWithDesc.length > 0) {
                batchResults = await scoreJobsBatch(
                    session.user.id,
                    jobsWithDesc,
                    { settings: batchSettings, feedbackData: batchFeedback }
                );
            }

            return NextResponse.json({ 
                message: 'Batch scoring complete.', 
                results: [...batchResults, ...skippedResults]
            }, { status: 200 });
        }

        // If no jobId or jobIds is provided, score unscored jobs (capped at 4 per request)
        if (!jobId) {
            const userJobs = await prisma.userJob.findMany({
                where: { 
                    userId: session.user.id,
                    OR: [
                        { status: 'discovered' },
                        { job: { opportunityScores: { none: { userId: session.user.id } } } }
                    ]
                },
                include: { job: { select: { id: true, title: true, description: true, url: true, createdAt: true } } },
                take: 4
            });

            if (!userJobs || userJobs.length === 0) {
                return NextResponse.json({ message: 'No unscored jobs found.' }, { status: 200 });
            }

            console.log(`Processing ${userJobs.length} unscored jobs...`);

            const [batchSettings, batchFeedback] = await Promise.all([
                getUserSettings(session.user.id),
                prisma.jobFeedback.findMany({
                    where: { userId: session.user.id },
                    select: { feedbackType: true, reasons: true, job: { select: { title: true, company: true } } },
                    orderBy: { createdAt: 'desc' },
                    take: 10
                })
            ]);

            const jobsWithDesc: Array<{ id: string; title: string; description: string }> = [];
            const skippedResults: any[] = [];

            await Promise.all(
                userJobs.map(async (uj) => {
                    const desc = await ensureJobDescription(uj.job);
                    if (desc) {
                        jobsWithDesc.push({ id: uj.job.id, title: uj.job.title, description: desc });
                    } else {
                        skippedResults.push({ jobId: uj.job.id, skipped: true, reason: 'Description inadequate.' });
                    }
                })
            );

            let batchResults: any[] = [];
            if (jobsWithDesc.length > 0) {
                batchResults = await scoreJobsBatch(
                    session.user.id,
                    jobsWithDesc,
                    { settings: batchSettings, feedbackData: batchFeedback }
                );
            }

            return NextResponse.json({ 
                message: 'Batch scoring complete.', 
                results: [...batchResults, ...skippedResults]
            }, { status: 200 });
        }

        // If single jobId is provided, score that one with timeout protection
        const job = await prisma.job.findUnique({
            where: { id: jobId },
            select: { id: true, title: true, description: true, url: true, createdAt: true }
        });

        if (!job) {
            return NextResponse.json({ error: 'Job not found.' }, { status: 404 });
        }

        const result = await ensureAndScoreJob(session.user.id, job);
        if (result.skipped && !result.score) {
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
