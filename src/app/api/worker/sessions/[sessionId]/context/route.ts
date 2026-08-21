import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { authenticateWorker } from '@/lib/auto-apply/worker-auth';
import { decrypt } from '@/lib/encryption';

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
            applicationUrl: true,
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
    const resumeText = prefs?.resumeMarkdown ?? assets.tailoredResumeMarkdown ?? '';

    // Extract contact info needed for form-filling
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

    const phoneMatch = resumeText.match(/(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/);
    const locationMatch = resumeText.match(/[A-Z][a-zA-Z\s]+,\s*[A-Z]{2}(?:\s+\d{5})?/);
    const linkedinMatch = resumeText.match(/https?:\/\/(?:www\.)?linkedin\.com\/in\/[a-zA-Z0-9_-]+/i);

    let connectedSession: { provider: string; storageState: any } | null = null;
    const jobUrlLower = (session.job.url || '').toLowerCase();
    let targetProvider: string | null = null;

    if (jobUrlLower.includes('ziprecruiter.com') || jobUrlLower.includes('zipapply.com')) {
      targetProvider = 'ziprecruiter';
    } else if (jobUrlLower.includes('dice.com')) {
      targetProvider = 'dice';
    } else if (jobUrlLower.includes('linkedin.com')) {
      targetProvider = 'linkedin';
    } else if (jobUrlLower.includes('indeed.com')) {
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
            // Update lastUsedAt in background
            prisma.connectedJobBoard
              .update({
                where: { id: board.id },
                data: { lastUsedAt: new Date() },
              })
              .catch((err) => console.warn('[worker/context] Could not update lastUsedAt:', err));
          }
        }
      } catch (err) {
        console.warn('[worker/context] Failed to resolve connected board session:', err);
      }
    }

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
        name: userName,
        email: userEmail,
        phone: prefs?.phone || phoneMatch?.[0] || undefined,
        location: prefs?.location || locationMatch?.[0] || undefined,
        streetAddress: (prefs as any)?.streetAddress || undefined,
        city: (prefs as any)?.city || undefined,
        state: (prefs as any)?.state || undefined,
        postalCode: (prefs as any)?.postalCode || undefined,
        linkedinUrl: prefs?.linkedinUrl || linkedinMatch?.[0] || undefined,
        githubUrl: prefs?.githubUrl || undefined,
        websiteUrl: prefs?.websiteUrl || undefined,
        usWorkAuthorization: prefs?.usWorkAuthorization ?? undefined,
        workingRemotelyFrom: prefs?.workingRemotelyFrom ?? undefined,
        visaSponsorship: prefs?.visaSponsorship ?? undefined,
        country: prefs?.country ?? undefined,
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
        accountPassword: (prefs as any)?.defaultAccountPassword ? decrypt((prefs as any).defaultAccountPassword) : undefined,
        accountEmail: prefs?.emailAddress || userEmail || undefined,
        accountAuthMode: ((prefs?.sources as any)?.accountAuthMode === 'create_account' ? 'create_account' : 'sign_in'),
      },
      connectedSession,
    };

    return NextResponse.json(payload);
  } catch (error: any) {
    console.error('[worker/sessions/context] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
