import { NextRequest, NextResponse } from 'next/server';
import { requireVerifiedRecruiter } from '@/lib/recruiter/auth';
import { prisma } from '@/lib/prisma';
import { createIntroduction } from '@/lib/recruiter/attributionService';
import { isRateLimited } from '@/lib/rateLimit';
import { RECRUITER_RATE_LIMITS } from '@/lib/recruiter/config';

export async function GET() {
  try {
    const recruiter = await requireVerifiedRecruiter();

    const intros = await prisma.introduction.findMany({
      where: { organizationId: recruiter.organizationId },
      orderBy: { requestedAt: 'desc' },
      include: {
        candidate: {
          select: {
            id: true,
            name: true,
            email: true,
            userPreferences: {
              select: {
                searchKeyword: true,
                city: true,
                state: true,
                location: true,
                phone: true,
              },
            },
          },
        },
        recruiterJob: {
          select: {
            id: true,
            publicId: true,
            title: true,
            location: true,
            status: true,
          },
        },
        recruiter: {
          select: {
            firstName: true,
            lastName: true,
          },
        },
        placementEvents: {
          select: {
            id: true,
            status: true,
            confirmedAt: true,
          },
        },
      },
    });

    return NextResponse.json({
      introductions: intros.map((intro) => {
        const isContactShared =
          intro.currentStatus === 'ACCEPTED' ||
          intro.currentStatus === 'CONTACT_SHARED' ||
          intro.currentStatus === 'INTERVIEW' ||
          intro.currentStatus === 'OFFER' ||
          intro.currentStatus === 'HIRED';

        let candidateDisplayName = 'Candidate';
        if (intro.candidate.name) {
          const parts = intro.candidate.name.trim().split(/\s+/);
          candidateDisplayName =
            isContactShared
              ? intro.candidate.name
              : parts.length > 1
              ? `${parts[0]} ${parts[parts.length - 1][0]}.`
              : parts[0];
        }

        return {
          id: intro.id,
          publicId: intro.publicId,
          candidateId: intro.candidateId,
          candidateDisplayName,
          candidateEmail: isContactShared ? intro.candidate.email : null,
          candidatePhone: isContactShared ? intro.candidate.userPreferences?.phone : null,
          jobFitScore: intro.jobFitScore,
          matchVersion: intro.matchVersion,
          status: intro.currentStatus,
          requestedAt: intro.requestedAt,
          acceptedAt: intro.acceptedAt,
          declinedAt: intro.declinedAt,
          contactSharedAt: intro.contactSharedAt,
          notes: intro.notes,
          job: {
            id: intro.recruiterJob.id,
            publicId: intro.recruiterJob.publicId,
            title: intro.recruiterJob.title,
            location: intro.recruiterJob.location,
          },
          recruiter: {
            name: `${intro.recruiter.firstName} ${intro.recruiter.lastName}`,
          },
          placement: intro.placementEvents[0] || null,
        };
      }),
    });
  } catch (err: any) {
    const status = err.message?.startsWith('UNAUTHORIZED') ? 401 : err.message?.startsWith('FORBIDDEN') ? 403 : 500;
    return NextResponse.json({ error: err.message || 'Failed to list introductions' }, { status });
  }
}

export async function POST(req: NextRequest) {
  try {
    const recruiter = await requireVerifiedRecruiter();

    // 1. Rate Limiting Check
    const rateLimitKey = `rateLimit:intro-request:${recruiter.recruiterId}`;
    const rateLimit = isRateLimited(
      rateLimitKey,
      RECRUITER_RATE_LIMITS.INTRO_MAX_HITS,
      RECRUITER_RATE_LIMITS.INTRO_WINDOW_MS
    );

    if (rateLimit.limited) {
      return NextResponse.json(
        {
          error: 'Rate limit exceeded for introduction requests. Please try again later.',
          retryAfterSeconds: rateLimit.retryAfterSeconds,
        },
        { status: 429 }
      );
    }

    const body = await req.json();
    const { candidateId, recruiterJobId, notes } = body;

    if (!candidateId || !recruiterJobId) {
      return NextResponse.json(
        { error: 'candidateId and recruiterJobId are required' },
        { status: 400 }
      );
    }

    // Verify job belongs to this recruiter's organization
    const job = await prisma.recruiterJob.findFirst({
      where: { id: recruiterJobId, organizationId: recruiter.organizationId },
    });

    if (!job) {
      return NextResponse.json(
        { error: 'Job opening not found or access denied' },
        { status: 404 }
      );
    }

    const intro = await createIntroduction({
      candidateId,
      recruiterId: recruiter.recruiterId,
      organizationId: recruiter.organizationId,
      recruiterJobId,
      notes,
    });

    return NextResponse.json({
      success: true,
      introduction: {
        id: intro.id,
        publicId: intro.publicId,
        status: intro.currentStatus,
        jobFitScore: intro.jobFitScore,
        matchVersion: intro.matchVersion,
        requestedAt: intro.requestedAt,
      },
    });
  } catch (err: any) {
    const status = err.message?.startsWith('UNAUTHORIZED') ? 401 : err.message?.startsWith('FORBIDDEN') ? 403 : 400;
    return NextResponse.json({ error: err.message || 'Failed to create introduction' }, { status });
  }
}
