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
    const resumeText = prefs?.resumeMarkdown ?? assets.tailoredResumeMarkdown ?? '';

    // Extract contact info needed for form-filling
    let userName = session.user.name ?? '';
    if (!userName && resumeText) {
      const nameMatch = resumeText.match(/^#\s+([^\n]+)/);
      if (nameMatch) userName = nameMatch[1].trim();
    }

    const emailMatch = resumeText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    const userEmail = session.user.email ?? emailMatch?.[0] ?? '';

    const phoneMatch = resumeText.match(/(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/);
    const locationMatch = resumeText.match(/[A-Z][a-zA-Z\s]+,\s*[A-Z]{2}(?:\s+\d{5})?/);
    const linkedinMatch = resumeText.match(/https?:\/\/(?:www\.)?linkedin\.com\/in\/[a-zA-Z0-9_-]+/i);

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
      },
    };

    return NextResponse.json(payload);
  } catch (error: any) {
    console.error('[worker/sessions/context] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
