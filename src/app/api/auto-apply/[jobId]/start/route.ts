import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { AutoApplyStatus } from '@/lib/auto-apply/types';
import { isAggregatorUrl, isKnownATSUrl, fetchWithScraperAPI, extractATSUrlFromHtml } from '@/lib/scraperapi';
import { getAutoApplyQuota } from '@/lib/auto-apply/quota';

/**
 * POST /api/auto-apply/[jobId]/start
 *
 * Initiates an Auto Apply session for a job.
 * Creates an AutoApplySession with status=queued.
 * The Railway worker picks it up within POLL_INTERVAL_MS.
 *
 * Pre-flight: If the job only has an aggregator URL (no applicationUrl saved),
 * we attempt to resolve the direct ATS portal URL via ScraperAPI before queuing.
 * This lets the worker navigate straight to the ATS instead of hitting aggregator
 * bot walls.
 *
 * Requires:
 *  - User is authenticated
 *  - Job exists and belongs to the user
 *  - Application assets (resume + cover letter) have been generated
 *  - No active session already running for this job
 *  - User is within monthly and daily auto-apply quotas
 *
 * Body: { simulationMode?: boolean }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const resolvedParams = await params;
  const jobId = resolvedParams?.jobId;
  if (!jobId) {
    return NextResponse.json({ error: 'Missing jobId parameter' }, { status: 400 });
  }
  const userId = session.user.id;

  let body: { simulationMode?: boolean; applicationUrl?: string } = {};
  try {
    body = await request.json();
  } catch {
    // Body is optional
  }
  const simulationMode = body.simulationMode ?? false; // Default to real apply
  const customApplicationUrl = body.applicationUrl?.trim() || null;

  try {
    // 0. Enforce Auto Apply Quota & Velocity Limits
    const quota = await getAutoApplyQuota(userId);
    if (!quota.canApply) {
      let errorMsg = 'Auto-apply limit reached.';
      if (quota.blockedReason === 'FREE_TIER') {
        errorMsg = 'Auto Apply is a Pro feature. Please upgrade to Pro to unlock automated applications.';
      } else if (quota.blockedReason === 'MONTHLY_LIMIT_EXCEEDED') {
        errorMsg = `You have used all ${quota.monthlyLimit} auto-applies for this billing period. Quota resets on ${new Date(quota.monthlyResetsAt).toLocaleDateString()}.`;
      } else if (quota.blockedReason === 'DAILY_LIMIT_EXCEEDED') {
        errorMsg = `You have reached your daily safety limit of ${quota.dailyLimit} auto-applies. Limit resets tonight at midnight UTC so your monthly quota stays protected.`;
      }

      return NextResponse.json(
        {
          error: errorMsg,
          errorCode: quota.blockedReason,
          quota,
        },
        { status: 429 }
      );
    }

    // 1. Verify the job exists and is associated with this user
    const userJob = await prisma.userJob.findUnique({
      where: { userId_jobId: { userId, jobId } },
      include: { job: { select: { id: true, url: true, applicationUrl: true, title: true, company: true, description: true, isEasyApply: true, source: true } } },
    });

    if (!userJob) {
      return NextResponse.json({ error: 'Job not found for this user' }, { status: 404 });
    }

    // If a direct applicationUrl was provided in the start request, update the job record immediately
    if (customApplicationUrl && customApplicationUrl !== userJob.job.applicationUrl) {
      await prisma.job.update({
        where: { id: jobId },
        data: { applicationUrl: customApplicationUrl, consecutiveAutoFailures: 0 },
      });
      userJob.job.applicationUrl = customApplicationUrl;
    }

    // 2. Check for assets; if missing, auto-generate assets for seamless 1-click apply
    let assets = await prisma.applicationAsset.findUnique({
      where: { userId_jobId: { userId, jobId } },
      select: { tailoredResumeMarkdown: true, coverLetterMarkdown: true },
    });

    if (!assets?.tailoredResumeMarkdown || !assets?.coverLetterMarkdown) {
      const { getUserSettings, hasUserUploadedResume } = await import('@/lib/settings');
      const userSettings = await getUserSettings(userId);
      if (!hasUserUploadedResume(userSettings?.resumeMarkdown)) {
        return NextResponse.json(
          {
            error: 'Base resume is required to use Auto Apply. Please upload your resume first.',
            errorCode: 'MISSING_BASE_RESUME',
          },
          { status: 400 }
        );
      }

      try {
        const { generateAssetsForJob } = await import('@/lib/generator');
        await generateAssetsForJob(
          userId,
          jobId,
          userJob.job.title,
          userJob.job.description || '',
          userJob.job.company
        );
      } catch (assetErr: any) {
        console.error('[auto-apply/start] Auto asset generation failed:', assetErr);
        return NextResponse.json(
          { error: 'Failed to auto-generate assets for application: ' + (assetErr.message || assetErr) },
          { status: 500 }
        );
      }
    }

    // 3. Check for existing active session
    const activeSession = await prisma.autoApplySession.findFirst({
      where: {
        userId,
        jobId,
        status: {
          in: [
            AutoApplyStatus.QUEUED,
            AutoApplyStatus.PROCESSING,
            AutoApplyStatus.DETECTING_ATS,
            AutoApplyStatus.PREPARING,
            AutoApplyStatus.APPLYING,
            AutoApplyStatus.VALIDATING,
            AutoApplyStatus.NEEDS_INTERVENTION,
          ],
        },
      },
    });

    if (activeSession) {
      return NextResponse.json(
        { error: 'An Auto Apply session is already active for this job', sessionId: activeSession.id },
        { status: 409 }
      );
    }

    // If the job is already known to be Easy Apply / personal account required, block automation early
    if (userJob.job.isEasyApply) {
      const sourceName = userJob.job.source || 'the platform';
      return NextResponse.json(
        {
          error: `This role uses ${sourceName} Easy Apply and requires your personal account. Please apply directly.`,
          isEasyApply: true,
          source: userJob.job.source,
        },
        { status: 400 }
      );
    }

    // 4. Pre-flight: Resolve aggregator URL to direct ATS portal URL via ScraperAPI.
    //    If applicationUrl is already a direct ATS link, skip this step entirely.
    //    This ensures the worker navigates straight to the ATS form, bypassing bot walls.
    const jobUrl = userJob.job.url;
    const existingApplicationUrl = userJob.job.applicationUrl;

    const needsResolution =
      !existingApplicationUrl &&
      jobUrl &&
      isAggregatorUrl(jobUrl) &&
      !isKnownATSUrl(jobUrl);

    if (needsResolution) {
      console.info(`[auto-apply/start] Pre-flight: resolving aggregator URL for job ${jobId}: ${jobUrl}`);
      try {
        let html = await fetchWithScraperAPI(jobUrl, false);
        let resolvedUrl = html ? extractATSUrlFromHtml(html) : null;
        if (!resolvedUrl) {
          html = await fetchWithScraperAPI(jobUrl, true);
          resolvedUrl = html ? extractATSUrlFromHtml(html) : null;
        }

        if (html) {
          if (resolvedUrl) {
            console.info(`[auto-apply/start] Resolved direct ATS URL: ${resolvedUrl}`);
            await prisma.job.update({
              where: { id: jobId },
              data: { applicationUrl: resolvedUrl },
            });
          } else {
            // Check if page is an in-network Easy Apply / sign-in wall
            const htmlLower = html.toLowerCase();
            const isInNetworkEasyApply =
              htmlLower.includes('cold-join') ||
              htmlLower.includes('join to apply') ||
              htmlLower.includes('sign-in-modal') ||
              htmlLower.includes('ia-directapply') ||
              htmlLower.includes('indeed-apply-widget') ||
              htmlLower.includes('1-click apply');

            if (isInNetworkEasyApply) {
              console.info(`[auto-apply/start] Identified in-network Easy Apply role. Updating job ${jobId} to isEasyApply=true.`);
              await prisma.job.update({
                where: { id: jobId },
                data: { isEasyApply: true },
              });
              const sourceName = userJob.job.source || 'the job board';
              return NextResponse.json(
                {
                  error: `This position is hosted on ${sourceName} 'Easy Apply' and requires your personal account. Please click the link to apply directly.`,
                  isEasyApply: true,
                },
                { status: 400 }
              );
            }
            console.info(`[auto-apply/start] ScraperAPI rendered the page but no direct ATS URL found — worker will attempt aggregator navigation.`);
          }
        }
      } catch (resolveErr: any) {
        // Non-fatal — worker will attempt aggregator navigation as fallback
        console.warn(`[auto-apply/start] Pre-flight URL resolution failed for ${jobUrl}: ${resolveErr.message}`);
      }
    }

    // 5. Create the session
    const applySession = await prisma.autoApplySession.create({
      data: {
        userId,
        jobId,
        status: AutoApplyStatus.QUEUED,
        simulationMode,
      },
    });

    return NextResponse.json({
      sessionId: applySession.id,
      status: AutoApplyStatus.QUEUED,
      simulationMode,
      message: simulationMode
        ? 'Auto Apply queued in simulation mode — worker will test the flow without submitting'
        : 'Auto Apply queued — worker will submit your application',
    }, { status: 201 });
  } catch (error: any) {
    console.error('[auto-apply/start] Error:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to start Auto Apply session' },
      { status: 500 }
    );
  }
}



