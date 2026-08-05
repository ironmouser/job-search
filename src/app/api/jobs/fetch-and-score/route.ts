import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { isDescriptionAdequate, fetchJobDescription, extractUrlFromStubDescription } from '@/lib/jobFetcher';
import { scoreJob } from '@/lib/scoring';
import { getEffectiveTier } from '@/lib/tier';
import { getUserSettings } from '@/lib/settings';

export const maxDuration = 60;

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;

    // Verify Pro tier
    const userRecord = await prisma.user.findUnique({
      where: { id: userId },
      select: { planTier: true, trialEndsAt: true, subscriptionType: true, orgAccessExpiresAt: true }
    });
    const isPro = userRecord ? getEffectiveTier(userRecord) === 'PRO' : false;

    if (!isPro) {
      return NextResponse.json({
        error: 'AI Match Scoring requires a Pro account.',
        code: 'LIMIT_REACHED'
      }, { status: 403 });
    }

    let body: any = {};
    try {
      body = await request.json();
    } catch (e) {
      body = {};
    }

    const { jobIds } = body;
    if (!jobIds || !Array.isArray(jobIds) || jobIds.length === 0) {
      return NextResponse.json({ message: 'No job IDs provided.' }, { status: 200 });
    }

    // Limit to 5 jobs per batch for economical background processing
    const targetJobIds = jobIds.slice(0, 5);

    const userJobs = await prisma.userJob.findMany({
      where: {
        userId,
        jobId: { in: targetJobIds }
      },
      include: {
        job: { select: { id: true, title: true, description: true, url: true } }
      }
    });

    if (!userJobs || userJobs.length === 0) {
      return NextResponse.json({ message: 'No matching user jobs found.' }, { status: 200 });
    }

    // Pre-fetch settings and feedback once for the batch
    const [batchSettings, batchFeedback] = await Promise.all([
      getUserSettings(userId),
      prisma.jobFeedback.findMany({
        where: { userId },
        select: { feedbackType: true, reasons: true, job: { select: { title: true, company: true } } },
        orderBy: { createdAt: 'desc' },
        take: 10
      })
    ]);

    const prefetchedData = { settings: batchSettings, feedbackData: batchFeedback };

    const results = await Promise.all(
      userJobs.map(async (uj) => {
        const job = uj.job;

        try {
          // 1. Check if job is already scored
          const existingScore = await prisma.opportunityScore.findUnique({
            where: { userId_jobId: { userId, jobId: job.id } },
            select: { id: true }
          });
          if (existingScore) {
            return { jobId: job.id, status: 'already_scored' };
          }

          let description = job.description || '';

          // 2. Fetch full description if missing or inadequate (stub)
          if (!isDescriptionAdequate(description)) {
            const stubUrl = extractUrlFromStubDescription(description);
            const urlsToTry = [...new Set([stubUrl, job.url].filter(Boolean))] as string[];

            for (const tryUrl of urlsToTry) {
              try {
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

          // 3. Skip scoring if description remains inadequate
          if (!isDescriptionAdequate(description)) {
            return { jobId: job.id, status: 'fetch_failed', reason: 'Description could not be downloaded.' };
          }

          // 4. Score job (wrap scoring in 25s timeout)
          const score = await withTimeout(
            scoreJob(userId, job.id, job.title, description, prefetchedData),
            25000,
            null
          );

          if (!score) {
            return { jobId: job.id, status: 'skipped', reason: 'Scoring timed out.' };
          }

          return { jobId: job.id, status: 'scored', score: score.total_score };
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
