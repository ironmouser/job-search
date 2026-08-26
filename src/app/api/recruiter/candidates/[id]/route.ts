import { NextRequest, NextResponse } from 'next/server';
import { requireVerifiedRecruiter } from '@/lib/recruiter/auth';
import { prisma } from '@/lib/prisma';
import { isRateLimited } from '@/lib/rateLimit';
import { RECRUITER_RATE_LIMITS } from '@/lib/recruiter/config';
import { sanitizeCandidateForDiscovery } from '@/lib/recruiter/sanitizer';
import { getOrComputeCandidateIntent } from '@/lib/recruiter/intentService';
import { isCandidateDiscoverable } from '@/lib/recruiter/consent';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const recruiter = await requireVerifiedRecruiter();
    const { id } = await params;

    // Self-recruitment guard
    if (id === recruiter.userId) {
      return NextResponse.json({ error: 'Candidate profile unavailable' }, { status: 404 });
    }

    // Rate Limiting on profile views
    const rateLimitKey = `rateLimit:candidate-view:${recruiter.recruiterId}`;
    const rateLimit = isRateLimited(
      rateLimitKey,
      RECRUITER_RATE_LIMITS.PROFILE_VIEW_MAX_HITS,
      RECRUITER_RATE_LIMITS.PROFILE_VIEW_WINDOW_MS
    );

    if (rateLimit.limited) {
      return NextResponse.json(
        {
          error: 'Rate limit exceeded for candidate profile views.',
          retryAfterSeconds: rateLimit.retryAfterSeconds,
        },
        { status: 429 }
      );
    }

    // Check candidate discoverability consent (server-side boundary)
    const discoverable = await isCandidateDiscoverable(id);
    if (!discoverable) {
      return NextResponse.json({ error: 'Candidate is not discoverable' }, { status: 404 });
    }

    const candidate = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        userPreferences: {
          select: {
            profile: true,
            resumeMarkdown: true,
            city: true,
            state: true,
            location: true,
            remoteOnly: true,
            searchKeyword: true,
            jobLevel: true,
            expectedSalary: true,
          },
        },
      },
    });

    if (!candidate) {
      return NextResponse.json({ error: 'Candidate not found' }, { status: 404 });
    }

    const intent = await getOrComputeCandidateIntent(candidate.id);
    const sanitized = sanitizeCandidateForDiscovery({
      user: candidate,
      preferences: candidate.userPreferences,
      intent,
    });

    // Check any existing introductions by this organization for this candidate
    const existingIntroductions = await prisma.introduction.findMany({
      where: {
        organizationId: recruiter.organizationId,
        candidateId: candidate.id,
      },
      select: {
        id: true,
        publicId: true,
        recruiterJobId: true,
        currentStatus: true,
        requestedAt: true,
        acceptedAt: true,
        recruiterJob: {
          select: {
            title: true,
          },
        },
      },
    });

    return NextResponse.json({
      candidate: sanitized,
      existingIntroductions: existingIntroductions.map((intro) => ({
        id: intro.id,
        publicId: intro.publicId,
        jobId: intro.recruiterJobId,
        jobTitle: intro.recruiterJob.title,
        status: intro.currentStatus,
        requestedAt: intro.requestedAt,
        acceptedAt: intro.acceptedAt,
      })),
    });
  } catch (err: any) {
    const status = err.message?.startsWith('UNAUTHORIZED') ? 401 : err.message?.startsWith('FORBIDDEN') ? 403 : 500;
    return NextResponse.json({ error: err.message || 'Failed to get candidate profile' }, { status });
  }
}
