import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { authenticateWorker } from '@/lib/auto-apply/worker-auth';
import { AutoApplyStatus } from '@/lib/auto-apply/types';

/**
 * GET /api/worker/queue/poll
 *
 * Called by the DigitalOcean worker every POLL_INTERVAL_MS.
 * Atomically claims the oldest queued session to prevent double-pickup.
 *
 * Returns 204 if no work is available.
 * Returns 200 with the session context if work is found.
 */
export async function GET(request: NextRequest) {
  const authError = authenticateWorker(request);
  if (authError) return authError;

  const workerId = request.headers.get('x-worker-id') ?? 'unknown';

  try {
    // Atomically find + claim the oldest queued session in a transaction
    const session = await prisma.$transaction(async (tx) => {
      const queued = await tx.autoApplySession.findFirst({
        where: { status: AutoApplyStatus.QUEUED },
        orderBy: { createdAt: 'asc' },
        include: {
          job: {
            select: { id: true, title: true, company: true, url: true },
          },
          user: {
            include: { userPreferences: true },
          },
        },
      });

      if (!queued) return null;

      // Claim the session — prevents another worker from picking it up
      await tx.autoApplySession.update({
        where: { id: queued.id },
        data: {
          status: AutoApplyStatus.PROCESSING,
          workerId,
          startedAt: new Date(),
        },
      });

      return queued;
    });

    if (!session) {
      return new NextResponse(null, { status: 204 });
    }

    // Fetch application assets for this user+job
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
      // Mark as failed immediately — assets are required
      await prisma.autoApplySession.update({
        where: { id: session.id },
        data: {
          status: AutoApplyStatus.FAILED,
          failureReason: 'missing_assets',
          failureDetails: 'Resume or cover letter not generated. Generate assets before using Auto Apply.',
          completedAt: new Date(),
        },
      });
      return NextResponse.json(
        { error: 'Missing resume or cover letter assets' },
        { status: 422 }
      );
    }

    const prefs = session.user.userPreferences;

    // Extract user profile from preferences (no full PII — only what's needed for forms)
    const userProfile = {
      name: session.user.name ?? '',
      email: session.user.email ?? '',
      phone: extractPhone(prefs?.resumeMarkdown),
      location: extractLocation(prefs?.resumeMarkdown),
      linkedinUrl: undefined as string | undefined,
      websiteUrl: undefined as string | undefined,
    };

    const payload = {
      sessionId: session.id,
      jobId: session.jobId,
      userId: session.userId,
      jobUrl: session.job.url,
      simulationMode: session.simulationMode,
      resumeMarkdown: assets.tailoredResumeMarkdown,
      coverLetterMarkdown: assets.coverLetterMarkdown,
      userProfile,
    };

    return NextResponse.json(payload);
  } catch (error: any) {
    console.error('[worker/queue/poll] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function extractPhone(resumeMarkdown?: string | null): string | undefined {
  if (!resumeMarkdown) return undefined;
  const match = resumeMarkdown.match(/(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/);
  return match?.[0];
}

function extractLocation(resumeMarkdown?: string | null): string | undefined {
  if (!resumeMarkdown) return undefined;
  const match = resumeMarkdown.match(/[A-Z][a-zA-Z\s]+,\s*[A-Z]{2}(?:\s+\d{5})?/);
  return match?.[0];
}
