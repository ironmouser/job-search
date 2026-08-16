import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { AutoApplyStatus } from '@/lib/auto-apply/types';

/**
 * POST /api/auto-apply/[jobId]/start
 *
 * Initiates an Auto Apply session for a job.
 * Creates an AutoApplySession with status=queued.
 * The DigitalOcean worker picks it up within POLL_INTERVAL_MS.
 *
 * Requires:
 *  - User is authenticated
 *  - Job exists and belongs to the user
 *  - Application assets (resume + cover letter) have been generated
 *  - No active session already running for this job
 *
 * Body: { simulationMode?: boolean }
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ jobId: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { jobId } = await context.params;
  const userId = session.user.id;

  let body: { simulationMode?: boolean } = {};
  try {
    body = await request.json();
  } catch {
    // Body is optional
  }
  const simulationMode = body.simulationMode ?? true; // Default: simulation mode on

  try {
    // 1. Verify the job exists and is associated with this user
    const userJob = await prisma.userJob.findUnique({
      where: { userId_jobId: { userId, jobId } },
      include: { job: { select: { id: true, url: true, title: true, company: true, description: true } } },
    });

    if (!userJob) {
      return NextResponse.json({ error: 'Job not found for this user' }, { status: 404 });
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

    // 4. Create the session
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
    return NextResponse.json({ error: 'Failed to start Auto Apply session' }, { status: 500 });
  }
}
