import { prisma } from '@/lib/prisma';

export interface RecruiterPlanDetails {
  id: 'STARTER' | 'PRO' | 'AGENCY';
  name: string;
  priceMonthly: number;
  activeJobQuota: number;
  monthlyIntroQuota: number;
  introOveragePrice: number;
  teamSeats: number;
  candidateAlerts: boolean;
  collaboration: boolean;
  analyticsTier: 'NONE' | 'BASIC' | 'ADVANCED';
}

export const RECRUITER_PLANS: Record<'STARTER' | 'PRO' | 'AGENCY', RecruiterPlanDetails> = {
  STARTER: {
    id: 'STARTER',
    name: 'Starter',
    priceMonthly: 99,
    activeJobQuota: 2,
    monthlyIntroQuota: 5,
    introOveragePrice: 30,
    teamSeats: 1,
    candidateAlerts: false,
    collaboration: false,
    analyticsTier: 'NONE',
  },
  PRO: {
    id: 'PRO',
    name: 'Pro',
    priceMonthly: 249,
    activeJobQuota: 10,
    monthlyIntroQuota: 25,
    introOveragePrice: 20,
    teamSeats: 3,
    candidateAlerts: true,
    collaboration: true,
    analyticsTier: 'BASIC',
  },
  AGENCY: {
    id: 'AGENCY',
    name: 'Agency',
    priceMonthly: 499,
    activeJobQuota: 25,
    monthlyIntroQuota: 75,
    introOveragePrice: 12,
    teamSeats: 10,
    candidateAlerts: true,
    collaboration: true,
    analyticsTier: 'ADVANCED',
  },
};

export class PaymentRequiredError extends Error {
  public statusCode = 402;
  public code: string;
  public details?: any;

  constructor(message: string, code: string, details?: any) {
    super(message);
    this.name = 'PaymentRequiredError';
    this.code = code;
    this.details = details;
  }
}

export function getPlanConfig(tier: string | null | undefined): RecruiterPlanDetails | null {
  if (!tier) return null;
  const upper = tier.toUpperCase() as 'STARTER' | 'PRO' | 'AGENCY';
  return RECRUITER_PLANS[upper] || null;
}

/**
 * Retrieves full billing entitlements and current usage for an organization.
 */
export async function getRecruiterOrgEntitlements(organizationId: string) {
  const org = await prisma.recruiterOrganization.findUnique({
    where: { id: organizationId },
    include: {
      _count: {
        select: {
          jobs: {
            where: { status: 'ACTIVE' },
          },
          recruiters: true,
          invitations: {
            where: { status: 'PENDING' },
          },
        },
      },
    },
  });

  if (!org) {
    throw new Error('Recruiter organization not found');
  }

  const isSubscribed = org.subscriptionStatus === 'ACTIVE' || org.subscriptionStatus === 'TRIALING';
  const plan = getPlanConfig(org.planTier);

  const activeJobCount = org._count.jobs;
  const activeJobQuota = org.activeJobQuota || plan?.activeJobQuota || 2;
  const monthlyIntroQuota = org.monthlyIntroQuota || plan?.monthlyIntroQuota || 0;
  const consumedIntros = org.consumedIntros || 0;
  const remainingIntros = Math.max(0, monthlyIntroQuota - consumedIntros);

  const teamSeats = org.teamSeats || plan?.teamSeats || 1;
  const consumedSeats = org._count.recruiters;
  const pendingInvites = org._count.invitations;
  const totalOccupiedSeats = consumedSeats + pendingInvites;
  const remainingSeats = Math.max(0, teamSeats - totalOccupiedSeats);

  return {
    organizationId: org.id,
    organizationName: org.name,
    verificationStatus: org.verificationStatus,
    subscriptionStatus: org.subscriptionStatus,
    isSubscribed,
    planTier: org.planTier || 'FREE_EXPLORER',
    planDetails: plan,
    currentPeriodEnd: org.stripeCurrentPeriodEnd,
    intros: {
      monthlyQuota: monthlyIntroQuota,
      consumed: consumedIntros,
      remaining: remainingIntros,
      overagePrice: plan?.introOveragePrice || 30,
    },
    jobs: {
      activeCount: activeJobCount,
      quota: activeJobQuota,
      canPostMore: activeJobCount < activeJobQuota,
    },
    seats: {
      totalSeats: teamSeats,
      activeRecruiters: consumedSeats,
      pendingInvites,
      remainingSeats,
      canInviteMore: totalOccupiedSeats < teamSeats,
    },
    features: {
      candidateAlerts: org.candidateAlertsEnabled || plan?.candidateAlerts || false,
      collaboration: org.collaborationEnabled || plan?.collaboration || false,
      analyticsTier: org.analyticsTier || plan?.analyticsTier || 'NONE',
    },
  };
}

/**
 * Validates whether the organization can request a candidate introduction.
 * Throws PaymentRequiredError (402) if no active subscription or quota exhausted.
 */
export async function assertCanRequestIntroduction(organizationId: string) {
  const entitlements = await getRecruiterOrgEntitlements(organizationId);

  if (!entitlements.isSubscribed) {
    throw new PaymentRequiredError(
      'An active subscription is required to request candidate introductions and unmask contact details.',
      'SUBSCRIPTION_REQUIRED',
      entitlements
    );
  }

  if (entitlements.intros.remaining <= 0) {
    throw new PaymentRequiredError(
      `Monthly introduction quota reached (${entitlements.intros.consumed}/${entitlements.intros.monthlyQuota}). Upgrade plan or purchase introduction credits to continue.`,
      'INTRO_QUOTA_EXHAUSTED',
      entitlements
    );
  }

  return entitlements;
}

/**
 * Validates whether the organization can publish or activate a new job opening.
 */
export async function assertCanPublishJob(organizationId: string) {
  const entitlements = await getRecruiterOrgEntitlements(organizationId);

  if (!entitlements.isSubscribed && entitlements.jobs.activeCount >= entitlements.jobs.quota) {
    throw new PaymentRequiredError(
      `Active job limit reached (${entitlements.jobs.activeCount}/${entitlements.jobs.quota}). Subscribe to post and activate more job openings.`,
      'JOB_QUOTA_REACHED',
      entitlements
    );
  }

  if (entitlements.isSubscribed && entitlements.jobs.activeCount >= entitlements.jobs.quota) {
    throw new PaymentRequiredError(
      `Active job quota reached for ${entitlements.planTier} tier (${entitlements.jobs.activeCount}/${entitlements.jobs.quota}). Upgrade your subscription to increase capacity.`,
      'JOB_QUOTA_REACHED',
      entitlements
    );
  }

  return entitlements;
}

/**
 * Validates whether the organization can invite a teammate based on team seat cap.
 */
export async function assertCanInviteTeammate(organizationId: string) {
  const entitlements = await getRecruiterOrgEntitlements(organizationId);

  if (!entitlements.features.collaboration) {
    throw new PaymentRequiredError(
      'Team collaboration and multi-seat access requires a Pro or Agency subscription.',
      'COLLABORATION_REQUIRED',
      entitlements
    );
  }

  if (!entitlements.seats.canInviteMore) {
    throw new PaymentRequiredError(
      `Seat capacity reached (${entitlements.seats.activeRecruiters + entitlements.seats.pendingInvites}/${entitlements.seats.totalSeats} seats claimed). Upgrade to Agency or add additional seats to invite more team members.`,
      'SEAT_LIMIT_REACHED',
      entitlements
    );
  }

  return entitlements;
}

/**
 * Consumes 1 introduction credit atomically.
 */
export async function consumeIntroductionCredit(organizationId: string) {
  return prisma.recruiterOrganization.update({
    where: { id: organizationId },
    data: {
      consumedIntros: {
        increment: 1,
      },
    },
  });
}
