import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { authenticateWorker } from '@/lib/auto-apply/worker-auth';

/**
 * GET /api/worker/sessions/[sessionId]/context
 *
 * Returns the full context the worker needs to execute the automation.
 * Called once per session, after the worker claims it from the queue.
 *
 * Only sends data the worker actually needs — does NOT return full user record.
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ sessionId: string }> }
) {
  const authError = authenticateWorker(request);
  if (authError) return authError;

  const { sessionId } = await context.params;

  try {
    const session = await prisma.autoApplySession.findUnique({
      where: { id: sessionId },
      include: {
        job: {
          select: {
            id: true,
            title: true,
            company: true,
            url: true,
            description: true,
            requirements: true,
          },
        },
        user: {
          include: { userPreferences: true },
        },
      },
    });

    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    const assets = await prisma.applicationAsset.findUnique({
      where: {
        userId_jobId: { userId: session.userId, jobId: session.jobId },
      },
      select: {
        tailoredResumeMarkdown: true,
        coverLetterMarkdown: true,
      },
    });

    if (!assets?.tailoredResumeMarkdown || !assets?.coverLetterMarkdown) {
      return NextResponse.json(
        { error: 'Resume or cover letter assets not found' },
        { status: 422 }
      );
    }

    const prefs = session.user.userPreferences;
    const resumeText = prefs?.resumeMarkdown ?? '';

    // Extract minimal contact info needed for form-filling
    const phoneMatch = resumeText.match(/(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/);
    const locationMatch = resumeText.match(/[A-Z][a-zA-Z\s]+,\s*[A-Z]{2}(?:\s+\d{5})?/);

    const payload = {
      session: {
        id: session.id,
        status: session.status,
        simulationMode: session.simulationMode,
        retryCount: session.retryCount,
        maxRetries: session.maxRetries,
      },
      job: session.job,
      assets: {
        resumeMarkdown: assets.tailoredResumeMarkdown,
        coverLetterMarkdown: assets.coverLetterMarkdown,
      },
      userProfile: {
        name: session.user.name ?? '',
        email: session.user.email ?? '',
        phone: phoneMatch?.[0],
        location: locationMatch?.[0],
      },
    };

    return NextResponse.json(payload);
  } catch (error: any) {
    console.error('[worker/sessions/context] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
