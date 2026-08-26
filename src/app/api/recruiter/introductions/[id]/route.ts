import { NextRequest, NextResponse } from 'next/server';
import { requireVerifiedRecruiter } from '@/lib/recruiter/auth';
import { prisma } from '@/lib/prisma';
import { getRevealedCandidateContact } from '@/lib/recruiter/sanitizer';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const recruiter = await requireVerifiedRecruiter();
    const { id } = await params;

    const intro = await prisma.introduction.findFirst({
      where: {
        id,
        organizationId: recruiter.organizationId,
      },
      include: {
        candidate: {
          select: {
            id: true,
            name: true,
            email: true,
            userPreferences: {
              select: {
                phone: true,
                linkedinUrl: true,
                searchKeyword: true,
                jobLevel: true,
                city: true,
                state: true,
                location: true,
                profile: true,
                resumeMarkdown: true,
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
            normalizedDescription: true,
          },
        },
        events: {
          orderBy: { createdAt: 'asc' },
        },
        placementEvents: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!intro) {
      return NextResponse.json({ error: 'Introduction not found' }, { status: 404 });
    }

    const isContactShared =
      intro.currentStatus === 'ACCEPTED' ||
      intro.currentStatus === 'CONTACT_SHARED' ||
      intro.currentStatus === 'INTERVIEW' ||
      intro.currentStatus === 'OFFER' ||
      intro.currentStatus === 'HIRED';

    let revealedContact = null;
    if (isContactShared) {
      try {
        revealedContact = await getRevealedCandidateContact(intro.id, recruiter.recruiterId);
      } catch (revealErr) {
        console.warn('Could not reveal candidate contact:', revealErr);
      }
    }

    return NextResponse.json({
      introduction: {
        id: intro.id,
        publicId: intro.publicId,
        status: intro.currentStatus,
        jobFitScore: intro.jobFitScore,
        matchVersion: intro.matchVersion,
        requestedAt: intro.requestedAt,
        acceptedAt: intro.acceptedAt,
        declinedAt: intro.declinedAt,
        contactSharedAt: intro.contactSharedAt,
        notes: intro.notes,
        job: intro.recruiterJob,
        candidate: {
          id: intro.candidate.id,
          name: isContactShared ? intro.candidate.name : 'Candidate',
          headline: intro.candidate.userPreferences?.searchKeyword || 'Professional',
          location: intro.candidate.userPreferences?.city || intro.candidate.userPreferences?.location || 'Remote',
        },
        revealedContact,
        events: intro.events.map((e) => ({
          id: e.id,
          type: e.eventType,
          actorType: e.actorType,
          createdAt: e.createdAt,
          metadata: e.metadata,
        })),
        placements: intro.placementEvents,
      },
    });
  } catch (err: any) {
    const status = err.message?.startsWith('UNAUTHORIZED') ? 401 : err.message?.startsWith('FORBIDDEN') ? 403 : 500;
    return NextResponse.json({ error: err.message || 'Failed to get introduction detail' }, { status });
  }
}
