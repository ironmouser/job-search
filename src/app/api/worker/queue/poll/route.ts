import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { authenticateWorker } from '@/lib/auto-apply/worker-auth';
import { AutoApplyStatus } from '@/lib/auto-apply/types';
import { healLocation } from '@/lib/locationNormalizer';

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
            select: { id: true, title: true, company: true, url: true, applicationUrl: true, description: true },
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
    let assets = await prisma.applicationAsset.findUnique({
      where: {
        userId_jobId: { userId: session.userId, jobId: session.jobId },
      },
      select: {
        tailoredResumeMarkdown: true,
        coverLetterMarkdown: true,
      },
    });

    if (!assets?.tailoredResumeMarkdown || !assets?.coverLetterMarkdown) {
      const { hasUserUploadedResume } = await import('@/lib/settings');
      const baseResume = session.user.userPreferences?.resumeMarkdown;
      if (hasUserUploadedResume(baseResume)) {
        try {
          const { generateAssetsForJob } = await import('@/lib/generator');
          const generated = await generateAssetsForJob(
            session.userId,
            session.jobId,
            session.job.title || 'Target Position',
            session.job.description || `Position: ${session.job.title} at ${session.job.company}`,
            session.job.company || 'Employer'
          );
          if (generated?.tailoredResumeMarkdown && generated?.coverLetterMarkdown) {
            assets = {
              tailoredResumeMarkdown: generated.tailoredResumeMarkdown,
              coverLetterMarkdown: generated.coverLetterMarkdown,
            };
          }
        } catch (genErr: any) {
          console.warn('[worker/queue/poll] JIT asset generation failed:', genErr?.message);
        }
      }
    }

    if (!assets?.tailoredResumeMarkdown || !assets?.coverLetterMarkdown) {
      // Mark as failed immediately — assets are required
      await prisma.autoApplySession.update({
        where: { id: session.id },
        data: {
          status: AutoApplyStatus.FAILED,
          failureReason: 'missing_assets',
          failureDetails: 'Resume or cover letter not generated. Upload a base resume before using Auto Apply.',
          completedAt: new Date(),
        },
      });
      return NextResponse.json(
        { error: 'Missing resume or cover letter assets' },
        { status: 422 }
      );
    }

    const prefs = session.user.userPreferences;
    const resumeText = prefs?.resumeMarkdown ?? assets.tailoredResumeMarkdown ?? '';

    let userName = session.user.name?.trim() ?? '';
    if (!userName && resumeText) {
      const nameMatch = resumeText.match(/^#\s+([^\n]+)/) || resumeText.match(/^([^\n]+)/);
      if (nameMatch) userName = nameMatch[1].trim();
    }

    const emailMatch = resumeText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    let userEmail = session.user.email?.trim() ?? '';
    if (!userEmail && emailMatch?.[0]) {
      userEmail = emailMatch[0].trim();
    }

    // Extract user profile from preferences (prefer explicit prefs, fallback to resume extractors)
    const userProfile = {
      name: userName,
      email: userEmail,
      phone: prefs?.phone || extractPhone(resumeText) || undefined,
      location: healLocation(prefs?.location || extractLocation(resumeText)) || undefined,
      streetAddress: (prefs as any)?.streetAddress || undefined,
      city: healLocation((prefs as any)?.city) || undefined,
      state: healLocation((prefs as any)?.state) || undefined,
      postalCode: (prefs as any)?.postalCode || undefined,
      linkedinUrl: prefs?.linkedinUrl || undefined,
      githubUrl: prefs?.githubUrl || undefined,
      websiteUrl: prefs?.websiteUrl || undefined,
      usWorkAuthorization: prefs?.usWorkAuthorization ?? undefined,
      workingRemotelyFrom: healLocation(prefs?.workingRemotelyFrom) ?? undefined,
      visaSponsorship: prefs?.visaSponsorship ?? undefined,
      country: healLocation(prefs?.country) ?? undefined,
      eeocRace: prefs?.eeocRace ?? undefined,
      eeocGender: prefs?.eeocGender ?? undefined,
      eeocVeteran: prefs?.eeocVeteran ?? undefined,
      eeocDisability: prefs?.eeocDisability ?? undefined,
      skipSelfId: (prefs as any)?.skipSelfId ?? false,
      startDate: (prefs as any)?.startDate ?? undefined,
      expectedSalary: (prefs as any)?.expectedSalary ?? undefined,
      willingToTravel: (prefs as any)?.willingToTravel ?? undefined,
      isOver18: (prefs as any)?.isOver18 ?? undefined,
      willingToRelocate: (prefs as any)?.willingToRelocate ?? undefined,
    };

    let connectedSession: { provider: string; storageState: any } | null = null;
    const targetUrl = session.job.applicationUrl ?? session.job.url;
    const targetUrlLower = (targetUrl || '').toLowerCase();
    let targetProvider: string | null = null;

    if (targetUrlLower.includes('ziprecruiter.com') || targetUrlLower.includes('zipapply.com')) {
      targetProvider = 'ziprecruiter';
    } else if (targetUrlLower.includes('dice.com')) {
      targetProvider = 'dice';
    } else if (targetUrlLower.includes('linkedin.com')) {
      targetProvider = 'linkedin';
    } else if (targetUrlLower.includes('indeed.com')) {
      targetProvider = 'indeed';
    }

    if (targetProvider) {
      try {
        const board = await prisma.connectedJobBoard.findUnique({
          where: {
            userId_provider: {
              userId: session.userId,
              provider: targetProvider,
            },
          },
        });

        if (board && board.status === 'connected') {
          const { decryptSession } = await import('@/lib/session-vault');
          const storageState = decryptSession(board.encryptedSession, board.iv, board.authTag);
          if (storageState) {
            connectedSession = { provider: targetProvider, storageState };
            prisma.connectedJobBoard
              .update({
                where: { id: board.id },
                data: { lastUsedAt: new Date() },
              })
              .catch((err) => console.warn('[worker/queue/poll] Could not update lastUsedAt:', err));
          }
        }
      } catch (err) {
        console.warn('[worker/queue/poll] Failed to resolve connected board session:', err);
      }
    }

    const payload = {
      sessionId: session.id,
      jobId: session.jobId,
      userId: session.userId,
      // Prefer applicationUrl (direct ATS link set by user) over the job listing URL
      jobUrl: targetUrl,
      simulationMode: session.simulationMode,
      resumeMarkdown: assets.tailoredResumeMarkdown,
      coverLetterMarkdown: assets.coverLetterMarkdown,
      userProfile,
      connectedSession,
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
