import { prisma } from '@/lib/prisma';
import { ArrowLeft, CheckCircle, ChevronDown, MapPin, DollarSign, Lock } from 'lucide-react';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import AutofillButton from '@/components/AutofillButton';
import ResumeActions from '@/components/ResumeActions';
import FeedbackButtons from '@/components/FeedbackButtons';
import FeedbackButtonsWithNudge from '@/components/FeedbackButtonsWithNudge';
import FeedbackNudgeTracker from '@/components/FeedbackNudgeTracker';
import FeedbackNudgeInlineBanner from '@/components/FeedbackNudgeInlineBanner';
import ApplicationQA from '@/components/ApplicationQA';
import CopyToClipboardButton from '@/components/CopyToClipboardButton';
import BackToTopButton from '@/components/BackToTopButton';
import GenerateAssetsButton from '@/components/GenerateAssetsButton';
import NetworkingAssetCard from '@/components/NetworkingAssetCard';
import { cleanCompanyName } from '@/lib/cleaners';
import CoverLetterAssetCard from '@/components/CoverLetterAssetCard';
import ResumeAssetCard from '@/components/ResumeAssetCard';
import AutoFetchJobDetails from '@/components/AutoFetchJobDetails';
import OpportunityScoreRefresh from '@/components/OpportunityScoreRefresh';
import { isDescriptionAdequate } from '@/lib/jobFetcher';
import { AutoApplyPanel } from '@/components/AutoApplyPanel';
import { ApplyStepAccordion } from '@/components/ApplyStepAccordion';
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { headers } from 'next/headers';
import { calculateResumeSimilarity } from '@/lib/similarity';
import { marked } from 'marked';
import JobDetailsNavWrapper from '@/components/JobDetailsNavWrapper';
import JobDetailsActionBar from '@/components/JobDetailsActionBar';
import JobDetailTracker from '@/components/JobDetailTracker';
import { getEffectiveTier } from '@/lib/tier';
import { getUserSettings } from '@/lib/settings';

import { convertHtmlToMarkdown } from '@/lib/formatter';

const markedRenderer = new marked.Renderer();
markedRenderer.link = ({ text }: { text: string }) => {
  return text;
};

marked.setOptions({ gfm: true, breaks: true, renderer: markedRenderer });

function formatDescriptionMarkdown(desc?: string | null): string {
  if (!desc) return '';
  let cleaned = desc.replace(/^"|"$/g, '').replace(/\\n/g, '\n').replace(/\\"/g, '"').trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```[a-zA-Z]*\n?/, '').replace(/\n?```$/, '').trim();
  }

  // Non-LLM feature: detect if description contains HTML or encoded entities and convert to clean Markdown
  cleaned = convertHtmlToMarkdown(cleaned);

  // Strip out "Apply at: <url>" lines and variations
  cleaned = cleaned
    .replace(/(?:^|\n|\r)\s*(?:apply\s+at|apply\s+here|application\s+link):\s*(?:https?:\/\/\S+|\[[^\]]*\]\([^)]*\)|<[^>]*>|\S+)?(?:\n|\r|$)/gi, '\n')
    .replace(/\b(?:apply\s+at|apply\s+here|application\s+link):\s*(?:https?:\/\/\S+|\[[^\]]*\]\([^)]*\)|\S+)/gi, '')
    .trim();

  let html = marked.parse(cleaned) as string;
  // Remove any raw or parsed anchor tags so links inside the job description are not clickable
  html = html.replace(/<a\b[^>]*>([\s\S]*?)<\/a>/gi, '$1').replace(/<\/?a\b[^>]*>/gi, '');
  // Clean up any remaining "Apply at:" HTML blocks or empty paragraphs
  html = html
    .replace(/<p\b[^>]*>\s*(?:apply\s+at|apply\s+here|application\s+link):?\s*(?:https?:\/\/\S+|[\s\S]*?)?<\/p>/gi, '')
    .replace(/\b(?:apply\s+at|apply\s+here|application\s+link):\s*https?:\/\/\S+/gi, '')
    .replace(/<p\b[^>]*>\s*<\/p>/gi, '')
    .trim();
  return html;
}

export default async function JobDetail({ params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    redirect('/dashboard');
  }
  const userId = session.user.id;
  const { id } = await params;
  
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { userPreferences: true }
  });
  const planTier = user ? getEffectiveTier(user) : 'FREE';
  const preferences = user?.userPreferences;
  
  let userName = 'My';
  if (user?.name) {
    userName = user.name;
  } else if (preferences?.resumeMarkdown) {
    const nameMatch = preferences.resumeMarkdown.match(/^#\s+([^\n]+)/);
    if (nameMatch && nameMatch[1]) {
      userName = nameMatch[1].trim();
    }
  }
  const formattedUserName = userName.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '');

  // Extract contact info from resume markdown header
  let userLocation: string | undefined;
  let userPhone: string | undefined;
  const resumeText = preferences?.resumeMarkdown || '';
  const phoneMatch = resumeText.match(/(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/);
  if (phoneMatch) userPhone = phoneMatch[0];
  // Look for city/state pattern like "San Francisco, CA" or "New York, NY 10001"
  const locationMatch = resumeText.match(/[A-Z][a-zA-Z\s]+,\s*[A-Z]{2}(?:\s+\d{5})?/);
  if (locationMatch) userLocation = locationMatch[0];
  
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const headerStore = await headers();
  const forwardedFor = headerStore.get('x-forwarded-for');
  const ipAddress = forwardedFor ? forwardedFor.split(',')[0] : 'unknown';

  let appliesThisWeek = await prisma.userJob.count({
    where: {
      userId,
      appliedAt: { gte: sevenDaysAgo }
    }
  });

  if (ipAddress !== 'unknown') {
    const otherUsersOnIp = await prisma.userJob.findMany({
      where: {
        ipAddress,
        appliedAt: { gte: sevenDaysAgo },
        userId: { not: userId }
      },
      select: { userId: true },
      distinct: ['userId']
    });

    if (otherUsersOnIp.length > 0) {
      const currentUserResume = preferences?.resumeMarkdown;
      for (const { userId: otherUserId } of otherUsersOnIp) {
        const otherPrefs = await prisma.userPreferences.findUnique({
          where: { userId: otherUserId },
          select: { resumeMarkdown: true }
        });
        const similarity = calculateResumeSimilarity(currentUserResume, otherPrefs?.resumeMarkdown);
        if (similarity > 0.8) {
          const aliasApplies = await prisma.userJob.count({
            where: {
              userId: otherUserId,
              appliedAt: { gte: sevenDaysAgo }
            }
          });
          appliesThisWeek += aliasApplies;
        }
      }
    }
  }
  
  // Fetch user specific job status and relation, with scores and assets scoped to the user
  const userJob = await prisma.userJob.findUnique({
    where: {
      userId_jobId: {
        userId,
        jobId: id
      }
    },
    include: {
      job: {
        include: {
          opportunityScores: { where: { userId } },
          applicationAssets: { where: { userId } },
          jobFeedbacks: { where: { userId } }
        }
      }
    }
  });

  if (!userJob) {
    notFound();
  }

  const job = userJob.job;

  if (!job.isViewed) {
    await prisma.job.update({
      where: { id: job.id },
      data: { isViewed: true }
    });
  }

  const status = userJob.status;
  const appliedAt = userJob.appliedAt;
  const scores = job.opportunityScores?.[0];
  const assets = job.applicationAssets?.[0];
  const feedback = job.jobFeedbacks?.[0];
  const totalScore = scores?.totalScore;
  const scoreClass = !totalScore ? '' : totalScore >= 80 ? 'score-high' : 'score-med';

  const userPrefs = await getUserSettings(userId);
  const hasBaseResume = Boolean(
    userPrefs?.resumeMarkdown && 
    userPrefs.resumeMarkdown.trim().length > 30 && 
    !userPrefs.resumeMarkdown.startsWith('# Candidate Profile')
  );

  let scoresExhausted = false;
  let assetGenerationsLeft = 1;
  if (planTier !== 'PRO') {
    const scoresThisWeek = await prisma.opportunityScore.count({
      where: {
        userId,
        createdAt: { gte: sevenDaysAgo }
      }
    });
    if (scoresThisWeek >= 10) {
      scoresExhausted = true;
    }

    const assetGenerationsThisWeek = await prisma.applicationAsset.count({
      where: {
        userId,
        createdAt: { gte: sevenDaysAgo }
      }
    });
    assetGenerationsLeft = Math.max(0, 1 - assetGenerationsThisWeek);
  }

  return (
    <JobDetailsNavWrapper jobId={job.id}>
      <div className="animate-fade-in" style={{ paddingBottom: '6rem' }}>
        <JobDetailTracker jobId={id} company={job.company} title={job.title} score={totalScore} />
        <FeedbackNudgeTracker />
        <Link href="/dashboard" className="btn-outline" style={{ border: 'none', padding: '0.5rem 0', marginBottom: '1rem', color: 'var(--text-secondary)' }}>
          <ArrowLeft size={16} /> Back to Dashboard
        </Link>

        <div className="flex-stack-mobile" style={{ marginBottom: '3rem' }}>
          <div>
            <h4 className="job-company" style={{ fontSize: '1rem' }}>{cleanCompanyName(job.company)}</h4>
            <h1 className="page-title">{job.title}</h1>
            <div className="job-meta" style={{ marginTop: '0.5rem', fontSize: '1rem' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}><MapPin size={16} /> {job.location || 'Remote'}</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}><DollarSign size={16} /> {job.salaryRange || 'Not Listed'}</span>
              {status === 'applied' || appliedAt ? (
                <span className="badge badge-applied" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                  <CheckCircle size={14} /> Applied {appliedAt ? new Date(appliedAt).toLocaleDateString('en-US', { timeZone: 'UTC', year: 'numeric', month: 'numeric', day: 'numeric' }) : ''}
                </span>
              ) : (
                <span className={`badge badge-${status}`}>{status.replace('_', ' ')}</span>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <FeedbackButtonsWithNudge jobId={job.id} initialFeedback={feedback?.feedbackType as "like" | "dislike" | undefined} />
            {totalScore ? (
              <div className={`score-badge ${scoreClass}`} style={{ width: '64px', height: '64px', fontSize: '1.5rem' }}>
                {totalScore}
              </div>
            ) : scoresExhausted ? (
              <a href="/api/stripe/checkout" title="Weekly score allowance reached. Click to upgrade to Pro!" className="score-badge" style={{ width: '64px', height: '64px', background: 'rgba(255, 255, 255, 0.05)', border: '1px dashed rgba(255, 255, 255, 0.2)', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Lock size={22} />
              </a>
            ) : null}
          </div>
        </div>

        <div className="job-detail-grid">
          
          {/* Main Content Area */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '3rem', minWidth: 0 }}>
            
            {/* Step 1: Review Job Description */}
            <section id="step-1-review">
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
                <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'var(--accent-primary)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}>1</div>
                <h2 style={{ margin: 0, fontSize: '1.5rem' }}>Review Job Description</h2>
              </div>
              <div className="glass-card" data-tour="job-detail-description">
                {!isDescriptionAdequate(job.description) ? (
                  <AutoFetchJobDetails jobId={job.id} jobUrl={job.url} initialDescription={job.description} />
                ) : (
                  <div 
                    className="job-description-content"
                    style={{ color: 'var(--text-secondary)', wordBreak: 'break-word', overflowWrap: 'anywhere', fontSize: '0.95rem', lineHeight: '1.6', maxWidth: '100%', overflowX: 'hidden' }}
                    dangerouslySetInnerHTML={{ __html: formatDescriptionMarkdown(job.description) }}
                  />
                )}
              </div>
              <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap', marginTop: '1.5rem' }}>
                <FeedbackButtons 
                  jobId={job.id} 
                  initialFeedback={feedback?.feedbackType as "like" | "dislike" | undefined} 
                  initialIsArchived={userJob.isArchived}
                  showSaveForLater={true}
                />
              </div>
            </section>

            {/* Feedback Nudge — Inline Banner (Nudge #1) */}
            <FeedbackNudgeInlineBanner
              jobId={job.id}
              initialFeedback={feedback?.feedbackType as "like" | "dislike" | undefined}
            />

            {/* Step 2: Application Assets */}
            <section id="step-2-assets" data-tour="job-detail-assets">
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
                <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'var(--accent-primary)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}>2</div>
                <h2 style={{ margin: 0, fontSize: '1.5rem' }}>Generate Assets</h2>
              </div>
              
              {assets ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                  <NetworkingAssetCard 
                    jobId={job.id} 
                    initialContent={assets.networkingMessage || ''} 
                    initialPreviousContent={assets.previousNetworkingMessage || undefined}
                    initialRegensUsed={assets.networkingMessageRegensUsed || 0} 
                    planTier={planTier} 
                    initialTone={preferences?.networkingMessageTone || 'Confident and strategic'} 
                  />

                  <CoverLetterAssetCard 
                    jobId={job.id} 
                    initialContent={assets.coverLetterMarkdown || ''} 
                    initialPreviousContent={assets.previousCoverLetterMarkdown || undefined}
                    initialRegensUsed={assets.coverLetterRegensUsed || 0} 
                    planTier={planTier} 
                    initialTone={preferences?.coverLetterTone || 'Confident and strategic'} 
                    userName={userName}
                    userLocation={userLocation}
                    userPhone={userPhone}
                    userEmail={user?.email || undefined}
                    companyName={cleanCompanyName(job.company)}
                    companyLocation={job.location || undefined}
                    initialPdfSettings={{
                      template: preferences?.coverLetterPdfTemplate || 'classic',
                      fontFamily: preferences?.coverLetterPdfFontFamily || 'Helvetica, Arial, sans-serif',
                      fontSize: preferences?.coverLetterPdfFontSize || '11pt',
                      lineHeight: preferences?.coverLetterPdfLineHeight || '1.5',
                      primaryColor: preferences?.coverLetterPdfPrimaryColor || '#1e3a8a',
                      textColor: preferences?.coverLetterPdfTextColor || '#111827',
                      margin: preferences?.coverLetterPdfMargin || '0.5in',
                      headerLayout: preferences?.coverLetterPdfHeaderLayout || 'left',
                    }}
                  />
                  
                  <ResumeAssetCard 
                    jobId={job.id} 
                    initialContent={assets.tailoredResumeMarkdown || ''} 
                    initialPreviousContent={assets.previousTailoredResumeMarkdown || undefined}
                    initialRegensUsed={assets.resumeRegensUsed || 0} 
                    planTier={planTier} 
                    initialCustomization={preferences?.resumeCustomizationMaxPercentage || 50} 
                    initialPdfSettings={{
                      template: preferences?.resumePdfTemplate || 'classic',
                      fontFamily: preferences?.resumePdfFontFamily || 'Helvetica, Arial, sans-serif',
                      fontSize: preferences?.resumePdfFontSize || '11pt',
                      lineHeight: preferences?.resumePdfLineHeight || '1.5',
                      primaryColor: preferences?.resumePdfPrimaryColor || '#1e3a8a',
                      textColor: preferences?.resumePdfTextColor || '#111827',
                      margin: preferences?.resumePdfMargin || '0.5in',
                      headerLayout: preferences?.resumePdfHeaderLayout || 'left',
                    }}
                  />
                </div>
              ) : (
                <div className="glass-card" style={{ marginBottom: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', padding: '2rem' }}>
                  <div>
                    <h3 style={{ margin: '0 0 0.5rem 0' }}>Tailored Application Assets</h3>
                    <p style={{ color: 'var(--text-secondary)', margin: 0, maxWidth: '600px', lineHeight: 1.5 }}>
                      Generate a highly personalized cover letter, networking message, and resume extract tailored specifically to this role using your profile and the job description.
                    </p>
                  </div>
                  <GenerateAssetsButton jobId={job.id} userPlanTier={planTier} generationsLeftThisWeek={assetGenerationsLeft} />
                </div>
              )}
            </section>

            {/* Step 3: Apply & Auto Apply */}
            <section id="step-3-apply">
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
                <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'var(--accent-primary)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}>3</div>
                <h2 style={{ margin: 0, fontSize: '1.5rem' }}>Apply</h2>
              </div>
              <ApplyStepAccordion
                jobId={job.id}
                initialUrl={job.url}
                applicationUrl={(job as any).applicationUrl}
                jobTitle={job.title}
                jobCompany={cleanCompanyName(job.company)}
                isPro={planTier === 'PRO'}
                appliesThisWeek={appliesThisWeek}
                hasAssets={!!(assets?.tailoredResumeMarkdown && assets?.coverLetterMarkdown)}
                generationsLeftThisWeek={assetGenerationsLeft}
              />
            </section>

            {/* Step 4: Application Q&A */}
            <section id="step-4-qa" style={{ marginBottom: '2rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
                <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'var(--accent-primary)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}>4</div>
                <h2 style={{ margin: 0, fontSize: '1.5rem' }}>Application Q&A</h2>
              </div>
              <ApplicationQA jobId={job.id} planTier={planTier} initialQaUsed={assets?.qaGenerationsUsed || 0} />
            </section>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem', marginBottom: '2rem' }}>
              <BackToTopButton />
            </div>
          </div>

          {/* Sidebar - Scoring */}
          <div className="job-detail-sidebar">
            {scores ? (
              <div className="glass-card" data-tour="job-detail-score">
                <h3 style={{ marginBottom: '1.5rem' }}>AI Opportunity Score</h3>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <ScoreRow label="Company Fit (20%)" score={scores.productFitScore} />
                  <ScoreRow label="Compensation (20%)" score={scores.compensationScore} />
                  <ScoreRow label="Remote Flex (15%)" score={scores.remoteFlexibilityScore} />
                  <ScoreRow label="AI Maturity (10%)" score={scores.aiMaturityScore} />
                  <ScoreRow label="Leadership (10%)" score={scores.leadershipScore} />
                  <ScoreRow label="Growth (10%)" score={scores.growthScore} />
                  <ScoreRow label="Culture (10%)" score={scores.cultureScore} />
                  <ScoreRow label="Tech Stack (5%)" score={scores.techStackScore} />
                </div>

                <div style={{ marginTop: '2rem', paddingTop: '1.5rem', borderTop: '1px solid var(--border-glass)' }}>
                  <h4 style={{ marginBottom: '0.5rem', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>AI Analysis Notes</h4>
                  {planTier === 'PRO' ? (
                    <p style={{ fontSize: '0.9rem', lineHeight: 1.5 }}>{scores.analysisNotes}</p>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem 1rem', background: 'rgba(102, 252, 241, 0.05)', border: '1px dashed rgba(102, 252, 241, 0.3)', borderRadius: '8px' }}>
                      <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontStyle: 'italic', display: 'flex', alignItems: 'center', gap: '0.25rem' }}><Lock size={14} /> Available with Pro Plan</span>
                    </div>
                  )}
                </div>
                
                {assets?.portfolioRecommendation && planTier === 'PRO' && (
                  <div style={{ marginTop: '1.5rem', padding: '1rem', background: 'rgba(102, 252, 241, 0.1)', borderRadius: '8px', border: '1px solid rgba(102, 252, 241, 0.2)' }}>
                    <h4 style={{ marginBottom: '0.5rem', fontSize: '0.9rem', color: 'var(--accent-primary)' }}>Portfolio Recommendation</h4>
                    <p style={{ fontSize: '0.9rem', lineHeight: 1.5, color: 'var(--text-primary)' }}>{assets.portfolioRecommendation}</p>
                  </div>
                )}
                {planTier !== 'PRO' && (
                  <div style={{ marginTop: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem 1rem', background: 'rgba(102, 252, 241, 0.05)', border: '1px dashed rgba(102, 252, 241, 0.3)', borderRadius: '8px' }}>
                    <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontStyle: 'italic', display: 'flex', alignItems: 'center', gap: '0.25rem' }}><Lock size={14} /> Portfolio Recommendation — Available with Pro Plan</span>
                  </div>
                )}
              </div>
            ) : scoresExhausted ? (
               <div className="glass-card" style={{ textAlign: 'center', padding: '2rem' }}>
                 <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1rem' }}>
                   <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'rgba(102, 252, 241, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent-primary)' }}>
                     <Lock size={24} />
                   </div>
                 </div>
                 <h3 style={{ fontSize: '1.2rem', marginBottom: '0.75rem' }}>Opportunity Score Locked</h3>
                 <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: 1.5, marginBottom: '1.5rem' }}>
                   You have reached your weekly allowance of 10 AI opportunity scores on the Free plan. Upgrade to our Pro plan to unlock unlimited AI opportunity evaluations, custom resume tailoring, and interview preparation!
                 </p>
                 <a href="/api/stripe/checkout" className="btn-primary" style={{ width: '100%', justifyContent: 'center' }}>
                   Upgrade to Pro Plan
                 </a>
               </div>
            ) : (
               <OpportunityScoreRefresh jobId={job.id} hasBaseResume={hasBaseResume} />
            )}
          </div>
          
        </div>
      </div>
      <JobDetailsActionBar
        currentJobId={job.id}
        initialFeedback={feedback?.feedbackType as "like" | "dislike" | undefined}
        initialIsArchived={userJob.isArchived}
        hasAssets={!!(assets?.tailoredResumeMarkdown && assets?.coverLetterMarkdown)}
        jobUrl={job.url || ''}
        status={status}
        isPro={planTier === 'PRO'}
      />
    </JobDetailsNavWrapper>
  );
}

function ScoreRow({ label, score }: { label: string, score: number }) {
  const isHigh = score >= 80;
  const isMed = score >= 50 && score < 80;
  const color = isHigh ? 'var(--success)' : isMed ? 'var(--warning)' : 'var(--danger)';
  
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', marginBottom: '0.3rem' }}>
        <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
        <span style={{ fontWeight: 600, color }}>{score}/100</span>
      </div>
      <div style={{ width: '100%', height: '6px', background: 'var(--bg-color)', borderRadius: '99px', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${score}%`, background: color, borderRadius: '99px' }} />
      </div>
    </div>
  );
}
