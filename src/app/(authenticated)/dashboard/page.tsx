import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { prisma } from '@/lib/prisma';
import { getUserSettings } from '@/lib/settings';
import DashboardClient from '@/components/DashboardClient';
import { detectATSFromUrl } from '@/lib/auto-apply/ats-detector-lite';
import { getEffectiveTier } from '@/lib/tier';
import { isBotRelatedFailure } from '@/lib/auto-apply/failure-helpers';

export const revalidate = 0;

export default async function Dashboard() {
  const session = await getServerSession(authOptions);
  
  if (!session?.user?.id) {
    return (
      <div style={{ textAlign: 'center', padding: '4rem 2rem' }}>
        <h1 className="page-title">Welcome to Job Agent HQ</h1>
        <p className="page-subtitle">Please log in to view your dashboard.</p>
      </div>
    );
  }

  const userId = session.user.id;
  const planTier = (session.user as any).planTier || 'FREE';
  const trialEndsAt: Date | null = (session.user as any).trialEndsAt ?? null;
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);


  let userJobs: any[] = [];
  let userPrefs: any = null;
  try {
    userJobs = await prisma.userJob.findMany({
      where: { 
        userId,
        status: { not: 'deleted' }
      },
      include: {
        job: {
          include: {
            opportunityScores: { where: { userId }, select: { totalScore: true } },
            jobFeedbacks: { where: { userId }, select: { feedbackType: true } },
            autoApplySessions: { 
              where: { userId }, 
              select: { id: true, status: true, failureReason: true, failureDetails: true }, 
              orderBy: { createdAt: 'desc' }, 
              take: 5 
            }
          }
        }
      },
      orderBy: { createdAt: 'desc' },
      take: 1000
    });

    userPrefs = await getUserSettings(userId);
  } catch (error: any) {
    console.error('Error fetching jobs:', error);
  }

  const jobs = userJobs.map(uj => {
    const j = uj.job;
    const sessions = j.autoApplySessions || [];
    const isAutoApplied = sessions.some((s: any) => s.status === 'applied');
    const hasRunAutoApply = sessions.length > 0;
    const hasBotFailure = sessions.some((s: any) => 
      s.status !== 'applied' && isBotRelatedFailure(s.failureReason, s.failureDetails)
    );

    return {
      id: j.id,
      title: j.title,
      company: j.company,
      location: j.location,
      salary_range: j.salaryRange,
      url: j.url,
      description: j.description,
      source: j.source,
      isEasyApply: j.isEasyApply || false,
      
      status: uj.status,
      is_archived: uj.isArchived,
      is_viewed: j.isViewed || false,
      is_auto_applied: isAutoApplied,
      has_run_auto_apply: hasRunAutoApply,
      has_bot_failure: hasBotFailure,
      created_at: uj.createdAt,
      applied_at: uj.appliedAt,
      unlockedBySubmission: uj.unlockedBySubmission || j.addedById === userId,

      opportunity_scores: j.opportunityScores.map((s: any) => ({ total_score: s.totalScore })),
      job_feedback: j.jobFeedbacks.map((f: any) => ({ feedback_type: f.feedbackType })),
      consecutive_auto_failures: j.consecutiveAutoFailures || 0,
      automation_confidence: isAutoApplied ? 100 : detectATSFromUrl(j.applicationUrl || j.url).confidence
    };
  }).filter(j => {
    if (j.is_archived) return true;
    return new Date(j.created_at) >= thirtyDaysAgo;
  });

  const hasEmailCredentials = !!(userPrefs?.emailAddress && userPrefs?.emailAppPassword);
  const hasSeenNonUsPrompt = userPrefs?.hasSeenNonUsPrompt || false;
  const noInternational = userPrefs?.noInternational || false;

  const userRecord = await prisma.user.findUnique({
    where: { id: userId },
    select: { planTier: true, trialEndsAt: true, subscriptionType: true, orgAccessExpiresAt: true }
  });
  const effectiveTier = userRecord ? getEffectiveTier(userRecord) : planTier;
  const effectiveTrialEndsAt = userRecord?.trialEndsAt ?? trialEndsAt;
  const initialScoresExhausted = effectiveTier !== 'PRO';

  const searchLocation = userPrefs?.searchLocation || '';
  const searchKeyword = userPrefs?.searchKeyword || '';
  const hasBaseResume = Boolean(
    userPrefs?.resumeMarkdown && 
    userPrefs.resumeMarkdown.trim().length > 30 && 
    !userPrefs.resumeMarkdown.startsWith('# Candidate Profile')
  );

  return (
    <DashboardClient 
      jobs={jobs} 
      userPlanTier={effectiveTier} 
      trialEndsAt={effectiveTrialEndsAt} 
      hasEmailCredentials={hasEmailCredentials} 
      initialScoresExhausted={initialScoresExhausted} 
      hasSeenNonUsPrompt={hasSeenNonUsPrompt} 
      noInternational={noInternational} 
      searchLocation={searchLocation} 
      searchKeyword={searchKeyword}
      hasBaseResume={hasBaseResume}
    />
  );
}
