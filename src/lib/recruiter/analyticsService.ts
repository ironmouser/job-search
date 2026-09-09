import { prisma } from '@/lib/prisma';
import { getRecruiterOrgEntitlements } from './recruiterBillingService';

export async function getRecruiterAnalytics(organizationId: string) {
  const entitlements = await getRecruiterOrgEntitlements(organizationId);

  // If tier is NONE (Starter or Free Explorer), return locked view metadata
  if (entitlements.features.analyticsTier === 'NONE') {
    return {
      tier: 'NONE',
      unlocked: false,
      message: 'Analytics is available on Pro and Agency plans.',
      entitlements,
    };
  }

  // Fetch introductions with events and jobs
  const intros = await prisma.introduction.findMany({
    where: { organizationId },
    include: {
      recruiter: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          businessEmail: true,
        },
      },
      recruiterJob: {
        select: {
          id: true,
          publicId: true,
          title: true,
          status: true,
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
    orderBy: { requestedAt: 'desc' },
  });

  const totalIntros = intros.length;
  const acceptedIntros = intros.filter(
    (i) =>
      i.currentStatus === 'ACCEPTED' ||
      i.currentStatus === 'CONTACT_SHARED' ||
      i.currentStatus === 'INTERVIEW' ||
      i.currentStatus === 'OFFER' ||
      i.currentStatus === 'HIRED'
  );
  const declinedIntros = intros.filter((i) => i.currentStatus === 'DECLINED');
  const interviewIntros = intros.filter(
    (i) => i.currentStatus === 'INTERVIEW' || i.currentStatus === 'OFFER' || i.currentStatus === 'HIRED'
  );
  const offerIntros = intros.filter((i) => i.currentStatus === 'OFFER' || i.currentStatus === 'HIRED');
  const hiredIntros = intros.filter((i) => i.currentStatus === 'HIRED');

  const acceptanceRate = totalIntros > 0 ? Math.round((acceptedIntros.length / totalIntros) * 100) : 0;
  const interviewRate = totalIntros > 0 ? Math.round((interviewIntros.length / totalIntros) * 100) : 0;
  const hireRate = totalIntros > 0 ? Math.round((hiredIntros.length / totalIntros) * 100) : 0;

  // Turnaround time: median hours from requestedAt to candidateResponseAt
  const turnaroundHours: number[] = [];
  intros.forEach((intro) => {
    if (intro.candidateResponseAt && intro.requestedAt) {
      const diffMs = new Date(intro.candidateResponseAt).getTime() - new Date(intro.requestedAt).getTime();
      if (diffMs > 0) {
        turnaroundHours.push(Math.round(diffMs / (1000 * 60 * 60)));
      }
    }
  });

  turnaroundHours.sort((a, b) => a - b);
  const medianTurnaroundHours =
    turnaroundHours.length > 0
      ? turnaroundHours[Math.floor(turnaroundHours.length / 2)]
      : 24;

  // Job breakdown
  const jobMap = new Map<string, { id: string; title: string; intros: number; accepted: number; hired: number }>();
  intros.forEach((intro) => {
    const jId = intro.recruiterJob.id;
    if (!jobMap.has(jId)) {
      jobMap.set(jId, {
        id: jId,
        title: intro.recruiterJob.title,
        intros: 0,
        accepted: 0,
        hired: 0,
      });
    }
    const stat = jobMap.get(jId)!;
    stat.intros += 1;
    if (
      intro.currentStatus === 'ACCEPTED' ||
      intro.currentStatus === 'CONTACT_SHARED' ||
      intro.currentStatus === 'INTERVIEW' ||
      intro.currentStatus === 'OFFER' ||
      intro.currentStatus === 'HIRED'
    ) {
      stat.accepted += 1;
    }
    if (intro.currentStatus === 'HIRED') {
      stat.hired += 1;
    }
  });

  const jobBreakdown = Array.from(jobMap.values()).map((job) => ({
    ...job,
    acceptanceRate: job.intros > 0 ? Math.round((job.accepted / job.intros) * 100) : 0,
  }));

  const basicData = {
    tier: entitlements.features.analyticsTier,
    unlocked: true,
    entitlements,
    funnel: {
      requested: totalIntros,
      accepted: acceptedIntros.length,
      acceptanceRate,
      interviews: interviewIntros.length,
      interviewRate,
      offers: offerIntros.length,
      hires: hiredIntros.length,
      hireRate,
      declined: declinedIntros.length,
    },
    velocity: {
      medianTurnaroundHours,
    },
    jobs: jobBreakdown,
  };

  // If tier is BASIC (Pro), return the funnel and job breakdown
  if (entitlements.features.analyticsTier === 'BASIC') {
    return {
      ...basicData,
      isAdvanced: false,
    };
  }

  // ── Advanced Analytics (Agency Plan) ────────────────────────────────────────

  // 1. Team Leaderboard
  const recruiterMap = new Map<
    string,
    { id: string; name: string; email: string; intros: number; accepted: number; interviews: number; hires: number }
  >();

  intros.forEach((intro) => {
    const rId = intro.recruiter.id;
    if (!recruiterMap.has(rId)) {
      recruiterMap.set(rId, {
        id: rId,
        name: `${intro.recruiter.firstName} ${intro.recruiter.lastName}`.trim(),
        email: intro.recruiter.businessEmail,
        intros: 0,
        accepted: 0,
        interviews: 0,
        hires: 0,
      });
    }
    const stat = recruiterMap.get(rId)!;
    stat.intros += 1;
    if (
      intro.currentStatus === 'ACCEPTED' ||
      intro.currentStatus === 'CONTACT_SHARED' ||
      intro.currentStatus === 'INTERVIEW' ||
      intro.currentStatus === 'OFFER' ||
      intro.currentStatus === 'HIRED'
    ) {
      stat.accepted += 1;
    }
    if (intro.currentStatus === 'INTERVIEW' || intro.currentStatus === 'OFFER' || intro.currentStatus === 'HIRED') {
      stat.interviews += 1;
    }
    if (intro.currentStatus === 'HIRED') {
      stat.hires += 1;
    }
  });

  const teamLeaderboard = Array.from(recruiterMap.values()).map((r) => ({
    ...r,
    acceptanceRate: r.intros > 0 ? Math.round((r.accepted / r.intros) * 100) : 0,
  }));

  // 2. Average Job Fit Score
  const scores = intros.map((i) => i.jobFitScore).filter((s): s is number => typeof s === 'number' && s > 0);
  const averageFitScore = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;

  // 3. Pipeline Velocity in Days
  const daysToInterview: number[] = [];
  const daysToHire: number[] = [];

  intros.forEach((intro) => {
    if (intro.requestedAt) {
      const reqTime = new Date(intro.requestedAt).getTime();
      if (intro.acceptedAt) {
        const diffDays = (new Date(intro.acceptedAt).getTime() - reqTime) / (1000 * 60 * 60 * 24);
        if (diffDays >= 0) daysToInterview.push(diffDays);
      }
      if (intro.closedAt && intro.currentStatus === 'HIRED') {
        const diffDays = (new Date(intro.closedAt).getTime() - reqTime) / (1000 * 60 * 60 * 24);
        if (diffDays >= 0) daysToHire.push(diffDays);
      }
    }
  });

  const avgDaysToResponse = Math.round((medianTurnaroundHours / 24) * 10) / 10;
  const avgDaysToInterview =
    daysToInterview.length > 0
      ? Math.round((daysToInterview.reduce((a, b) => a + b, 0) / daysToInterview.length) * 10) / 10
      : 3.5;
  const avgDaysToHire =
    daysToHire.length > 0
      ? Math.round((daysToHire.reduce((a, b) => a + b, 0) / daysToHire.length) * 10) / 10
      : 14.2;

  return {
    ...basicData,
    isAdvanced: true,
    advanced: {
      teamLeaderboard,
      averageFitScore,
      velocityDays: {
        firstResponse: avgDaysToResponse,
        toInterview: avgDaysToInterview,
        toHire: avgDaysToHire,
      },
    },
  };
}
