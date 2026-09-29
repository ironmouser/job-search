import { prisma } from '@/lib/prisma';
import { generatePublicId } from './config';
import {
  IntroductionStatus,
  IntroductionEventType,
  PlacementStatus,
  CandidateConsentType,
  ConsentStatus,
} from '@prisma/client';
import {
  sendIntroductionRequestEmail,
  sendIntroductionAcceptedEmail,
  sendIntroductionDeclinedEmail,
  sendHireConfirmationEmail,
  sendIntroductionExpiredRefundEmail,
} from '@/lib/mailer';
import { detectDirectContactInfo, calculateBusinessDayExpiry } from './linkTracker';

export interface CreateIntroductionInput {
  candidateId: string;
  recruiterId: string;
  organizationId: string;
  recruiterJobId: string;
  notes?: string;
  refundEligible?: boolean;
  directContactIncluded?: boolean;
}

/**
 * Creates an Introduction request with a permanent public ID and historical score snapshot.
 */
export async function createIntroduction(input: CreateIntroductionInput) {
  // 1. Verify candidate is discoverable and opted in
  const consent = await prisma.candidateConsent.findUnique({
    where: {
      candidateId_consentType: {
        candidateId: input.candidateId,
        consentType: CandidateConsentType.RECRUITER_DISCOVERY,
      },
    },
  });

  if (!consent || consent.status !== ConsentStatus.GRANTED) {
    throw new Error('Candidate has not opted into recruiter discovery');
  }

  // 2. Check for existing introduction for this job + candidate
  const existing = await prisma.introduction.findUnique({
    where: {
      recruiterJobId_candidateId: {
        recruiterJobId: input.recruiterJobId,
        candidateId: input.candidateId,
      },
    },
  });

  if (existing) {
    throw new Error('An introduction has already been requested for this candidate and position');
  }

  // 3. Fetch match record to snapshot historical score
  const match = await prisma.recruiterJobMatch.findUnique({
    where: {
      recruiterJobId_candidateId: {
        recruiterJobId: input.recruiterJobId,
        candidateId: input.candidateId,
      },
    },
  });

  const publicId = generatePublicId('JHQ-INTRO');

  // 4. Calculate contact details and refund eligibility
  const contactCheck = detectDirectContactInfo(input.notes);
  const directContactIncluded =
    input.directContactIncluded !== undefined ? input.directContactIncluded : contactCheck.detected;
  const refundEligible =
    input.refundEligible !== undefined ? input.refundEligible : !directContactIncluded;
  const expiresAt = refundEligible ? calculateBusinessDayExpiry(new Date(), 5) : null;

  // 5. Create introduction record
  const intro = await prisma.introduction.create({
    data: {
      publicId,
      candidateId: input.candidateId,
      recruiterId: input.recruiterId,
      organizationId: input.organizationId,
      recruiterJobId: input.recruiterJobId,
      matchId: match?.id || null,
      jobFitScore: match?.jobFitScore ?? null,
      matchVersion: match?.matchVersion ?? 'v1',
      currentStatus: IntroductionStatus.REQUESTED,
      notes: input.notes,
      refundEligible,
      directContactIncluded,
      expiresAt,
    },
    include: {
      candidate: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      recruiter: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          title: true,
          businessEmail: true,
        },
      },
      organization: {
        select: {
          name: true,
        },
      },
      recruiterJob: {
        select: {
          title: true,
          location: true,
          salaryMin: true,
          salaryMax: true,
          salaryCurrency: true,
          description: true,
        },
      },
    },
  });

  // 6. Append audit event
  try {
    await prisma.introductionEvent.create({
      data: {
        introductionId: intro.id,
        eventType: IntroductionEventType.INTRODUCTION_REQUESTED,
        actorType: 'RECRUITER',
        actorId: input.recruiterId,
        metadata: {
          publicId,
          jobFitScore: intro.jobFitScore,
          matchVersion: intro.matchVersion,
          refundEligible: intro.refundEligible,
          directContactIncluded: intro.directContactIncluded,
          expiresAt: intro.expiresAt ? intro.expiresAt.toISOString() : null,
        },
      },
    });
  } catch (err) {
    console.error('Failed to create introduction requested event:', err);
  }

  // 7. Send transactional notification email to candidate
  if (intro.candidate.email) {
    try {
      const salaryRange =
        intro.recruiterJob.salaryMin && intro.recruiterJob.salaryMax
          ? `$${Math.round(intro.recruiterJob.salaryMin / 1000)}k - $${Math.round(
              intro.recruiterJob.salaryMax / 1000
            )}k ${intro.recruiterJob.salaryCurrency || 'USD'}`
          : null;

      await sendIntroductionRequestEmail({
        to: intro.candidate.email,
        candidateName: intro.candidate.name,
        recruiterName: `${intro.recruiter.firstName} ${intro.recruiter.lastName}`,
        recruiterTitle: intro.recruiter.title,
        orgName: intro.organization.name,
        jobTitle: intro.recruiterJob.title,
        jobLocation: intro.recruiterJob.location || 'Remote',
        introPublicId: intro.publicId,
        notes: intro.notes,
        salaryRange,
        jobDescription: intro.recruiterJob.description,
        directContactIncluded: intro.directContactIncluded,
        recruiterEmail: intro.recruiter.businessEmail,
      });
    } catch (err) {
      console.warn('Failed to send introduction request email:', err);
    }
  }

  return intro;
}

/**
 * Handles candidate response (ACCEPT or DECLINE) to an introduction request.
 */
export async function respondToIntroduction(params: {
  introductionId: string;
  candidateId: string;
  response: 'ACCEPTED' | 'DECLINED';
  notes?: string;
}) {
  const intro = await prisma.introduction.findUnique({
    where: { id: params.introductionId },
    include: {
      candidate: {
        select: { name: true, email: true },
      },
      recruiter: {
        select: { businessEmail: true, firstName: true, lastName: true },
      },
      recruiterJob: {
        select: { title: true },
      },
    },
  });

  if (!intro) {
    throw new Error('Introduction not found');
  }

  if (intro.candidateId !== params.candidateId) {
    throw new Error('Unauthorized to respond to this introduction');
  }

  if (intro.currentStatus !== IntroductionStatus.REQUESTED && intro.currentStatus !== IntroductionStatus.VIEWED) {
    throw new Error(`Introduction is already in status ${intro.currentStatus}`);
  }

  const now = new Date();

  if (params.response === 'ACCEPTED') {
    const updated = await prisma.introduction.update({
      where: { id: params.introductionId },
      data: {
        candidateResponse: 'ACCEPTED',
        candidateResponseAt: now,
        acceptedAt: now,
        contactSharedAt: now,
        currentStatus: IntroductionStatus.CONTACT_SHARED,
      },
    });

    // Log acceptance and contact shared events
    try {
      await prisma.introductionEvent.createMany({
        data: [
          {
            introductionId: intro.id,
            eventType: IntroductionEventType.CANDIDATE_ACCEPTED,
            actorType: 'CANDIDATE',
            actorId: params.candidateId,
          },
          {
            introductionId: intro.id,
            eventType: IntroductionEventType.CONTACT_SHARED,
            actorType: 'SYSTEM',
            actorId: 'system',
            metadata: { sharedAt: now.toISOString() },
          },
        ],
      });
    } catch (err) {
      console.error('Failed to log acceptance events:', err);
    }

    // Notify recruiter via email
    if (intro.recruiter.businessEmail && intro.candidate.email) {
      try {
        await sendIntroductionAcceptedEmail({
          to: intro.recruiter.businessEmail,
          recruiterName: `${intro.recruiter.firstName} ${intro.recruiter.lastName}`,
          candidateName: intro.candidate.name || 'Candidate',
          candidateEmail: intro.candidate.email,
          jobTitle: intro.recruiterJob.title,
          introPublicId: intro.publicId,
        });
      } catch (err) {
        console.warn('Failed to send introduction accepted email:', err);
      }
    }

    return updated;
  } else {
    const updated = await prisma.introduction.update({
      where: { id: params.introductionId },
      data: {
        candidateResponse: 'DECLINED',
        candidateResponseAt: now,
        declinedAt: now,
        currentStatus: IntroductionStatus.DECLINED,
      },
    });

    try {
      await prisma.introductionEvent.create({
        data: {
          introductionId: intro.id,
          eventType: IntroductionEventType.CANDIDATE_DECLINED,
          actorType: 'CANDIDATE',
          actorId: params.candidateId,
        },
      });
    } catch (err) {
      console.error('Failed to log decline event:', err);
    }

    // Notify recruiter of decline
    if (intro.recruiter.businessEmail) {
      try {
        await sendIntroductionDeclinedEmail({
          to: intro.recruiter.businessEmail,
          recruiterName: `${intro.recruiter.firstName} ${intro.recruiter.lastName}`,
          jobTitle: intro.recruiterJob.title,
          introPublicId: intro.publicId,
        });
      } catch (err) {
        console.warn('Failed to send introduction declined email:', err);
      }
    }

    return updated;
  }
}

/**
 * Advances the pipeline stage of an introduction (e.g. INTERVIEW, OFFER, CLOSED).
 */
export async function advanceIntroductionStage(params: {
  introductionId: string;
  recruiterId: string;
  stage: IntroductionStatus;
  notes?: string;
}) {
  const intro = await prisma.introduction.findUnique({
    where: { id: params.introductionId },
  });

  if (!intro) {
    throw new Error('Introduction not found');
  }

  if (intro.recruiterId !== params.recruiterId) {
    throw new Error('Unauthorized to update this introduction');
  }

  const updated = await prisma.introduction.update({
    where: { id: params.introductionId },
    data: {
      currentStatus: params.stage,
      notes: params.notes || intro.notes,
      closedAt: params.stage === IntroductionStatus.CLOSED ? new Date() : undefined,
    },
  });

  let eventType: IntroductionEventType = IntroductionEventType.STAGE_CHANGED;
  if (params.stage === IntroductionStatus.INTERVIEW) {
    eventType = IntroductionEventType.RECRUITER_MARKED_INTERVIEW;
  } else if (params.stage === IntroductionStatus.OFFER) {
    eventType = IntroductionEventType.RECRUITER_MARKED_OFFER;
  } else if (params.stage === IntroductionStatus.HIRED) {
    eventType = IntroductionEventType.RECRUITER_MARKED_HIRED;
  } else if (params.stage === IntroductionStatus.CLOSED) {
    eventType = IntroductionEventType.INTRODUCTION_CLOSED;
  }

  try {
    await prisma.introductionEvent.create({
      data: {
        introductionId: intro.id,
        eventType,
        actorType: 'RECRUITER',
        actorId: params.recruiterId,
        metadata: { newStage: params.stage, notes: params.notes },
      },
    });
  } catch (err) {
    console.error('Failed to log stage transition event:', err);
  }

  return updated;
}

/**
 * Reports a candidate placement / hire by a recruiter, requesting candidate confirmation.
 */
export async function reportHire(params: {
  introductionId: string;
  recruiterId: string;
  notes?: string;
}) {
  const intro = await prisma.introduction.findUnique({
    where: { id: params.introductionId },
    include: {
      candidate: { select: { id: true, name: true, email: true } },
      recruiter: { select: { firstName: true, lastName: true } },
      organization: { select: { name: true } },
      recruiterJob: { select: { title: true } },
    },
  });

  if (!intro) {
    throw new Error('Introduction not found');
  }

  if (intro.recruiterId !== params.recruiterId) {
    throw new Error('Unauthorized');
  }

  const placement = await prisma.placementEvent.create({
    data: {
      introductionId: intro.id,
      candidateId: intro.candidateId,
      recruiterId: intro.recruiterId,
      organizationId: intro.organizationId,
      recruiterJobId: intro.recruiterJobId,
      reportedBy: params.recruiterId,
      status: PlacementStatus.CANDIDATE_PENDING_CONFIRMATION,
      notes: params.notes,
    },
  });

  await prisma.introduction.update({
    where: { id: intro.id },
    data: { currentStatus: IntroductionStatus.HIRED },
  });

  try {
    await prisma.introductionEvent.create({
      data: {
        introductionId: intro.id,
        eventType: IntroductionEventType.RECRUITER_MARKED_HIRED,
        actorType: 'RECRUITER',
        actorId: params.recruiterId,
        metadata: { placementId: placement.id },
      },
    });
  } catch (err) {
    console.error('Failed to log placement report event:', err);
  }

  // Send hire confirmation request email to candidate
  if (intro.candidate.email) {
    try {
      await sendHireConfirmationEmail({
        to: intro.candidate.email,
        candidateName: intro.candidate.name,
        recruiterName: `${intro.recruiter.firstName} ${intro.recruiter.lastName}`,
        orgName: intro.organization.name,
        jobTitle: intro.recruiterJob.title,
        placementId: placement.id,
      });
    } catch (err) {
      console.warn('Failed to send hire confirmation email:', err);
    }
  }

  return placement;
}

/**
 * Confirms a placement by the candidate.
 */
export async function confirmHire(placementId: string, candidateId: string) {
  const placement = await prisma.placementEvent.findUnique({
    where: { id: placementId },
  });

  if (!placement) {
    throw new Error('Placement event not found');
  }

  if (placement.candidateId !== candidateId) {
    throw new Error('Unauthorized');
  }

  const updated = await prisma.placementEvent.update({
    where: { id: placementId },
    data: {
      status: PlacementStatus.CONFIRMED,
      confirmedAt: new Date(),
    },
  });

  try {
    await prisma.introductionEvent.create({
      data: {
        introductionId: placement.introductionId,
        eventType: IntroductionEventType.CANDIDATE_CONFIRMED_HIRE,
        actorType: 'CANDIDATE',
        actorId: candidateId,
      },
    });
  } catch (err) {
    console.error('Failed to log hire confirmation event:', err);
  }

  return updated;
}

/**
 * Background worker helper to process expired introduction requests.
 * Automatically refunds 1 credit per expired introduction and marks it EXPIRED.
 */
export async function processExpiredIntroductions(): Promise<{
  processedCount: number;
  refundedCount: number;
  expiredIds: string[];
}> {
  const now = new Date();

  const expiredIntros = await prisma.introduction.findMany({
    where: {
      currentStatus: IntroductionStatus.REQUESTED,
      refundEligible: true,
      expiresAt: { lte: now },
    },
    include: {
      organization: true,
      recruiter: {
        select: {
          businessEmail: true,
          firstName: true,
          lastName: true,
        },
      },
      recruiterJob: {
        select: {
          title: true,
        },
      },
      candidate: {
        select: {
          name: true,
        },
      },
    },
  });

  const expiredIds: string[] = [];
  let refundedCount = 0;

  for (const intro of expiredIntros) {
    try {
      await prisma.$transaction([
        prisma.introduction.update({
          where: { id: intro.id },
          data: {
            currentStatus: IntroductionStatus.EXPIRED,
            closedAt: now,
            refundedAt: now,
          },
        }),
        prisma.recruiterOrganization.update({
          where: { id: intro.organizationId },
          data: {
            consumedIntros: {
              decrement: 1,
            },
          },
        }),
        prisma.introductionEvent.createMany({
          data: [
            {
              introductionId: intro.id,
              eventType: IntroductionEventType.INTRODUCTION_EXPIRED,
              actorType: 'SYSTEM',
              actorId: 'system',
              metadata: { expiredAt: now.toISOString() },
            },
            {
              introductionId: intro.id,
              eventType: IntroductionEventType.CREDIT_REFUNDED,
              actorType: 'SYSTEM',
              actorId: 'system',
              metadata: {
                refundedAt: now.toISOString(),
                reason: '5_DAY_NON_RESPONSE_TIMEOUT',
                refundedCredits: 1,
              },
            },
          ],
        }),
      ]);

      expiredIds.push(intro.id);
      refundedCount++;

      let candidateDisplayName = 'Candidate';
      if (intro.candidate.name) {
        const parts = intro.candidate.name.trim().split(/\s+/);
        candidateDisplayName = parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0]}.` : parts[0];
      }

      if (intro.recruiter.businessEmail) {
        try {
          await sendIntroductionExpiredRefundEmail({
            to: intro.recruiter.businessEmail,
            recruiterName: `${intro.recruiter.firstName} ${intro.recruiter.lastName}`,
            candidateDisplayName,
            jobTitle: intro.recruiterJob.title,
            refundedCredits: 1,
          });
        } catch (emailErr) {
          console.warn('[REFUND_WORKER] Failed to send refund notification email:', emailErr);
        }
      }
    } catch (err) {
      console.error(`[REFUND_WORKER] Error processing expired intro ${intro.id}:`, err);
    }
  }

  return {
    processedCount: expiredIntros.length,
    refundedCount,
    expiredIds,
  };
}
