import { prisma } from '@/lib/prisma';
import { ArrowLeft, CheckCircle, ChevronDown } from 'lucide-react';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import AutofillButton from '@/components/AutofillButton';
import ResumeActions from '@/components/ResumeActions';
import FeedbackButtons from '@/components/FeedbackButtons';
import ApplicationQA from '@/components/ApplicationQA';
import CopyToClipboardButton from '@/components/CopyToClipboardButton';
import BackToTopButton from '@/components/BackToTopButton';
import GenerateAssetsButton from '@/components/GenerateAssetsButton';
import NetworkingAssetCard from '@/components/NetworkingAssetCard';
import CoverLetterAssetCard from '@/components/CoverLetterAssetCard';
import ResumeAssetCard from '@/components/ResumeAssetCard';
import AutoFetchJobDetails from '@/components/AutoFetchJobDetails';
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { headers } from 'next/headers';
import { calculateResumeSimilarity } from '@/lib/similarity';

export default async function JobDetail({ params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    redirect('/');
  }
  const userId = session.user.id;
  const { id } = await params;
  
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { userPreferences: true }
  });
  const planTier = user?.planTier || 'FREE';
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

  return (
    <div className="animate-fade-in" style={{ paddingBottom: '4rem' }}>
      <Link href="/" className="btn-outline" style={{ border: 'none', padding: '0.5rem 0', marginBottom: '1rem', color: 'var(--text-secondary)' }}>
        <ArrowLeft size={16} /> Back to Dashboard
      </Link>

      <div className="flex-stack-mobile" style={{ marginBottom: '3rem' }}>
        <div>
          <h4 className="job-company" style={{ fontSize: '1rem' }}>{job.company}</h4>
          <h1 className="page-title">{job.title}</h1>
          <div className="job-meta" style={{ marginTop: '0.5rem', fontSize: '1rem' }}>
            <span>📍 {job.location || 'Remote'}</span>
            <span>💰 {job.salaryRange || 'Unlisted'}</span>
            {status === 'applied' || appliedAt ? (
              <span className="badge badge-applied" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                ✓ Applied {appliedAt ? new Date(appliedAt).toLocaleDateString() : ''}
              </span>
            ) : (
              <span className={`badge badge-${status}`}>{status.replace('_', ' ')}</span>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <FeedbackButtons jobId={job.id} initialFeedback={feedback?.feedbackType as "like" | "dislike" | undefined} />
          {totalScore && (
            <div className={`score-badge ${scoreClass}`} style={{ width: '64px', height: '64px', fontSize: '1.5rem' }}>
              {totalScore}
            </div>
          )}
          <AutofillButton jobId={job.id} jobUrl={job.url} jobTitle={job.title} jobCompany={job.company} isPro={planTier === 'PRO'} appliesThisWeek={appliesThisWeek} />
        </div>
      </div>

      <div className="job-detail-grid">
        
        {/* Main Content Area */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '3rem', minWidth: 0 }}>
          
          {/* Step 1: Review Job Description */}
          <section>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
              <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'var(--accent-primary)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}>1</div>
              <h2 style={{ margin: 0, fontSize: '1.5rem' }}>Review Job Description</h2>
            </div>
            <div className="glass-card" data-tour="job-detail-description">
              {!job.description ? (
                <AutoFetchJobDetails jobId={job.id} />
              ) : (
                <div style={{ color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: '0.95rem' }}>
                  {job.description}
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap', marginTop: '1.5rem' }}>
              <FeedbackButtons jobId={job.id} initialFeedback={feedback?.feedbackType as "like" | "dislike" | undefined} />
            </div>
          </section>

          {/* Step 2: Application Assets */}
          <section data-tour="job-detail-assets">
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
              <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'var(--accent-primary)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}>2</div>
              <h2 style={{ margin: 0, fontSize: '1.5rem' }}>Generate Assets</h2>
            </div>
            
            {assets ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                <NetworkingAssetCard 
                  jobId={job.id} 
                  initialContent={assets.networkingMessage || ''} 
                  initialRegensUsed={assets.networkingMessageRegensUsed || 0} 
                  planTier={planTier} 
                  initialTone={preferences?.networkingMessageTone || 'Confident and strategic'} 
                />

                <CoverLetterAssetCard 
                  jobId={job.id} 
                  initialContent={assets.coverLetterMarkdown || ''} 
                  initialRegensUsed={assets.coverLetterRegensUsed || 0} 
                  planTier={planTier} 
                  initialTone={preferences?.coverLetterTone || 'Confident and strategic'} 
                  userName={formattedUserName}
                />
                
                <ResumeAssetCard 
                  jobId={job.id} 
                  initialContent={assets.tailoredResumeMarkdown || ''} 
                  initialRegensUsed={assets.resumeRegensUsed || 0} 
                  planTier={planTier} 
                  initialCustomization={preferences?.resumeCustomizationMaxPercentage || 50} 
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
                <GenerateAssetsButton jobId={job.id} />
              </div>
            )}
          </section>

          {/* Step 3: Apply */}
          <section>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
              <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'var(--accent-primary)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}>3</div>
              <h2 style={{ margin: 0, fontSize: '1.5rem' }}>Apply</h2>
            </div>
            <div className="glass-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', padding: '2rem' }}>
              <div>
                <h3 style={{ margin: '0 0 0.5rem 0' }}>Smart Apply</h3>
                <p style={{ color: 'var(--text-secondary)', margin: 0, maxWidth: '600px', lineHeight: 1.5 }}>
                  Ready to apply? Click the "Smart Apply" button to open the job application on the company's career page.
                </p>
              </div>
              <AutofillButton jobId={job.id} jobUrl={job.url} jobTitle={job.title} jobCompany={job.company} isPro={planTier === 'PRO'} appliesThisWeek={appliesThisWeek} />
            </div>
          </section>

          {/* Step 4: Application Q&A */}
          <section style={{ marginBottom: '2rem' }}>
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
            <div className="glass-card" style={{ position: 'sticky', top: '2rem' }} data-tour="job-detail-score">
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
                    <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontStyle: 'italic' }}>🔒 Available with Pro Plan</span>
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
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontStyle: 'italic' }}>🔒 Portfolio Recommendation — Available with Pro Plan</span>
                </div>
              )}
            </div>
          ) : (
             <div className="glass-card">
               <p style={{ color: 'var(--text-secondary)' }}>This job hasn't been scored yet.</p>
             </div>
          )}
        </div>
        
      </div>
    </div>
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
