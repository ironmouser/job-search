import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { isDescriptionAdequate, fetchJobDescription, fetchJobDescriptionDetailed, extractUrlFromStubDescription } from '@/lib/jobFetcher';
import { scoreJob } from '@/lib/scoring';
import { getEffectiveTier } from '@/lib/tier';
import { getUserSettings } from '@/lib/settings';
import { isClosedJobRecord, isClosedJobText } from '@/lib/jobStatusDetector';

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


export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;
    const body = await request.json().catch(() => ({}));
    const { jobIds } = body;

    if (!Array.isArray(jobIds) || jobIds.length === 0) {
      return NextResponse.json({ error: 'jobIds array is required' }, { status: 400 });
    }

    // Prefetch user settings, user tier, and feedback data for all jobs in batch
    const [settings, user, feedbackData] = await Promise.all([
      getUserSettings(userId),
      prisma.user.findUnique({
        where: { id: userId },
        select: { planTier: true, trialEndsAt: true, subscriptionType: true, orgAccessExpiresAt: true }
      }),
      prisma.jobFeedback.findMany({
        where: { userId },
        include: { job: { select: { title: true, company: true, description: true } } }
      })
    ]);

    const isPro = user ? getEffectiveTier(user) === 'PRO' : false;
    const targetJobIds = isPro ? jobIds.slice(0, 50) : jobIds.slice(0, 10);

    const jobs = await prisma.job.findMany({
      where: { id: { in: targetJobIds } }
    });

    const prefetchedData = {
      settings,
      feedbackData,
    };

    const results = await Promise.all(
      jobs.map(async (job) => {
        try {
          // 1. If already scored for this user, return existing score
          const existingScore = await prisma.opportunityScore.findUnique({
            where: { userId_jobId: { userId, jobId: job.id } }
          });
          if (existingScore) {
            return { jobId: job.id, status: 'already_scored', score: existingScore.totalScore };
          }

          let description = job.description || '';

          // 1b. Check if already marked closed or closed text present
          if (isClosedJobRecord(job) || isClosedJobText(description).isClosed) {
            await prisma.job.update({ where: { id: job.id }, data: { status: 'closed' } });
            await prisma.userJob.deleteMany({ where: { jobId: job.id, userId } });
            return { jobId: job.id, status: 'closed', reason: 'Position closed' };
          }

          // 2. Fetch full description if missing or inadequate (stub)
          if (!isDescriptionAdequate(description)) {
            const stubUrl = extractUrlFromStubDescription(description);
            const urlsToTry = [...new Set([stubUrl, job.url].filter(Boolean))] as string[];

            for (const tryUrl of urlsToTry) {
              try {
                const detailRes = await withTimeout(fetchJobDescriptionDetailed(tryUrl), 15000, null);
                if (detailRes?.isClosed) {
                  await prisma.job.update({ where: { id: job.id }, data: { status: 'closed' } });
                  await prisma.userJob.deleteMany({ where: { jobId: job.id, userId } });
                  return { jobId: job.id, status: 'closed', reason: detailRes.closedReason || 'Position closed' };
                }
                if (detailRes?.description && isDescriptionAdequate(detailRes.description)) {
                  description = detailRes.description + `\n\nApply at: ${tryUrl}`;
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

          const isAdequate = isDescriptionAdequate(description);

          // 3. Score job (wrap scoring in 25s timeout)
          const score = await withTimeout(
            scoreJob(userId, job.id, job.title, description, prefetchedData, { allowPartialDescription: true }),
            25000,
            null
          );

          if (!score) {
            return { jobId: job.id, status: 'skipped', reason: 'Scoring timed out.' };
          }

          return { jobId: job.id, status: 'scored', score: score.total_score, isPartial: !isAdequate };
        } catch (e: any) {
          console.error(`Error in fetch-and-score for job ${job.id}:`, e.message);
          return { jobId: job.id, status: 'skipped', error: e.message };
        }
      })
    );

    return NextResponse.json({ message: 'Batch fetch and score complete.', results }, { status: 200 });

  } catch (error: any) {
    console.error('Fetch and score API Error:', error);
    return NextResponse.json({ error: error.message || 'An error occurred.' }, { status: 500 });
  }
}
