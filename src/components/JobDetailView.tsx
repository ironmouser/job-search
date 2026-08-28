"use client";

import { useEffect, useState, useCallback, useRef } from 'react';
import Link from 'next/link';
import { 
  MapPin, 
  DollarSign, 
  CheckCircle, 
  Lock, 
  Maximize2, 
  Loader2, 
  AlertCircle,
  AlertOctagon,
  Sparkles,
  ArrowLeft
} from 'lucide-react';
import { cleanCompanyName } from '@/lib/cleaners';
import { isDescriptionAdequate } from '@/lib/descriptionUtils';
import AutoFetchJobDetails from '@/components/AutoFetchJobDetails';

import FeedbackButtons from '@/components/FeedbackButtons';
import FeedbackButtonsWithNudge from '@/components/FeedbackButtonsWithNudge';
import FeedbackNudgeInlineBanner from '@/components/FeedbackNudgeInlineBanner';
import CoverLetterAssetCard from '@/components/CoverLetterAssetCard';
import ResumeAssetCard from '@/components/ResumeAssetCard';
import NetworkingAssetCard from '@/components/NetworkingAssetCard';
import GenerateAssetsButton from '@/components/GenerateAssetsButton';
import { ApplyStepAccordion } from '@/components/ApplyStepAccordion';
import ApplicationQA from '@/components/ApplicationQA';
import OpportunityScoreRefresh from '@/components/OpportunityScoreRefresh';

export interface JobDetailData {
  job: {
    id: string;
    title: string;
    company: string;
    location?: string | null;
    salaryRange?: string | null;
    url?: string | null;
    applicationUrl?: string | null;
    description?: string | null;
    formattedDescriptionHtml?: string | null;
    isEasyApply?: boolean;
    source?: string | null;
    isViewed?: boolean;
    createdAt?: string;
  };
  userJob: {
    status: string;
    appliedAt?: string | null;
    isArchived?: boolean;
  };
  scores: any | null;
  assets: any | null;
  feedback: any | null;
  planTier: 'FREE' | 'PRO';
  preferences: any | null;
  userContact: {
    userName: string;
    userLocation?: string;
    userPhone?: string;
    userEmail?: string;
  };
  appliesThisWeek: number;
  hasBaseResume: boolean;
  scoresExhausted: boolean;
  assetGenerationsLeft: number;
}

interface JobDetailViewProps {
  jobId: string;
  embeddedMode?: boolean;
  onJobUpdated?: (jobId: string, updates: Partial<{ status: string; is_archived: boolean; feedback_type: string | null }>) => void;
}

function ScoreRow({ label, score }: { label: string; score: number }) {
  const isHigh = score >= 80;
  const isMed = score >= 50 && score < 80;
  const color = isHigh ? 'var(--success)' : isMed ? 'var(--warning)' : 'var(--danger)';
  const cleanLabel = label.replace(/\s*\(\d+%\)/, '');

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85rem', marginBottom: '0.3rem' }}>
        <span style={{ color: 'var(--text-secondary)', textTransform: 'uppercase', fontSize: '0.7rem', fontWeight: 700 }}>{cleanLabel}</span>
        <span style={{ fontWeight: 600, color }}>{score}/100</span>
      </div>
      <div style={{ width: '100%', height: '6px', background: '#eceded', borderRadius: '99px', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${score}%`, background: color, borderRadius: '99px', transition: 'width 0.4s ease' }} />
      </div>
    </div>
  );
}

// Client-side memory cache to make jumping between selected cards instantaneous
const jobDetailCache = new Map<string, JobDetailData>();

export default function JobDetailView({ jobId, embeddedMode = false, onJobUpdated }: JobDetailViewProps) {
  const [data, setData] = useState<JobDetailData | null>(() => jobDetailCache.get(jobId) || null);
  const [loading, setLoading] = useState<boolean>(!jobDetailCache.has(jobId));
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const fetchJobData = useCallback(async (id: string, forceRefresh = false) => {
    if (!forceRefresh && jobDetailCache.has(id)) {
      setData(jobDetailCache.get(id)!);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/jobs/${id}`);
      if (!res.ok) {
        throw new Error(`Failed to load job details (${res.status})`);
      }
      const json: JobDetailData = await res.json();
      jobDetailCache.set(id, json);
      setData(json);
    } catch (err: any) {
      console.error('Error fetching job detail:', err);
      setError(err.message || 'Failed to load job details');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchJobData(jobId);
    // Scroll right pane back to top when switching selected job
    if (containerRef.current) {
      containerRef.current.scrollTop = 0;
    }
  }, [jobId, fetchJobData]);

  // Listen for auto-apply asset generation events and refresh Step 2 without a full page reload.
  // Fired by AutoApplyPanel/AutoApplyButton when the worker auto-generates tailored assets.
  useEffect(() => {
    const handleAssetsUpdated = (e: Event) => {
      const detail = (e as CustomEvent<{ jobId?: string }>).detail;
      if (!detail?.jobId || detail.jobId === jobId) {
        // Invalidate cache entry and silently re-fetch in background
        jobDetailCache.delete(jobId);
        fetchJobData(jobId, true);
      }
    };
    window.addEventListener('job-assets-updated', handleAssetsUpdated);
    return () => window.removeEventListener('job-assets-updated', handleAssetsUpdated);
  }, [jobId, fetchJobData]);

  if (loading && !data) {
    return (
      <div 
        style={{ 
          display: 'flex', 
          flexDirection: 'column', 
          alignItems: 'center', 
          justifyContent: 'center', 
          minHeight: '400px', 
          height: '100%',
          gap: '1rem',
          color: 'var(--text-secondary)'
        }}
      >
        <Loader2 size={32} className="animate-spin" style={{ color: 'var(--accent-primary)' }} />
        <span style={{ fontSize: '0.95rem' }}>Loading job details...</span>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div 
        className="glass-card"
        style={{ 
          margin: '2rem', 
          padding: '2.5rem', 
          textAlign: 'center',
          border: '1px solid rgba(239, 68, 68, 0.3)'
        }}
      >
        <AlertCircle size={36} style={{ color: 'var(--danger)', margin: '0 auto 1rem' }} />
        <h3 style={{ margin: '0 0 0.5rem 0', color: 'var(--text-primary)' }}>Unable to load job details</h3>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem', fontSize: '0.9rem' }}>{error || 'Job not found'}</p>
        <button 
          onClick={() => fetchJobData(jobId, true)} 
          className="btn-primary"
          style={{ padding: '0.5rem 1.25rem' }}
        >
          Retry
        </button>
      </div>
    );
  }

  const { job, userJob, scores, assets, feedback, planTier, preferences, userContact, appliesThisWeek, hasBaseResume, scoresExhausted, assetGenerationsLeft } = data;
  const status = userJob.status;
  const appliedAt = userJob.appliedAt;
  const totalScore = scores?.totalScore;
  const scoreClass = !totalScore ? '' : totalScore >= 80 ? 'score-high' : 'score-med';

  return (
    <div 
      ref={containerRef}
      className="job-detail-view-container animate-fade-in"
      style={{
        height: '100%',
        overflowY: 'auto',
        padding: embeddedMode ? '1.25rem 1.5rem 4rem 1.5rem' : '0 0 6rem 0',
      }}
    >
      {!embeddedMode && (
        <Link 
          href="/dashboard" 
          className="btn-outline" 
          style={{ border: 'none', padding: '0.5rem 0', marginBottom: '1rem', color: 'var(--text-secondary)' }}
        >
          <ArrowLeft size={16} /> Back to Dashboard
        </Link>
      )}

      {/* Top Section: AI Opportunity Score Analysis */}
      <section id="opportunity-scoring" data-tour="job-detail-score" style={{ marginBottom: '2.75rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
          <Sparkles size={20} style={{ color: 'var(--accent-primary)' }} />
          <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 600 }}>AI Opportunity Score Analysis</h2>
        </div>

        {scores ? (
          <div className="glass-card" style={{ padding: '1.25rem', boxShadow: '#2663eb 0px 1px 8px -4px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.85rem' }}>
              <ScoreRow label="Company Fit" score={scores.productFitScore} />
              <ScoreRow label="Compensation" score={scores.compensationScore} />
              <ScoreRow label="Remote Flex" score={scores.remoteFlexibilityScore} />
              <ScoreRow label="AI Maturity" score={scores.aiMaturityScore} />
              <ScoreRow label="Leadership" score={scores.leadershipScore} />
              <ScoreRow label="Growth" score={scores.growthScore} />
              <ScoreRow label="Culture" score={scores.cultureScore} />
              <ScoreRow label="Tech Stack" score={scores.techStackScore} />
            </div>

            <div style={{ marginTop: '1.25rem', paddingTop: '1rem', borderTop: '1px solid var(--border-glass)' }}>
              <h4 style={{ marginBottom: '0.35rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>AI Analysis Notes</h4>
              {planTier === 'PRO' ? (
                <p style={{ fontSize: '0.88rem', lineHeight: 1.5, margin: 0 }}>{scores.analysisNotes}</p>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.65rem 0.85rem', background: 'rgba(102, 252, 241, 0.05)', border: '1px dashed rgba(102, 252, 241, 0.3)', borderRadius: '8px' }}>
                  <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', fontStyle: 'italic', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                    <Lock size={13} /> Available with Pro Plan
                  </span>
                </div>
              )}
            </div>
            
            {assets?.portfolioRecommendation && planTier === 'PRO' && (
              <div style={{ marginTop: '1rem', padding: '0.85rem', background: 'rgba(102, 252, 241, 0.1)', borderRadius: '8px', border: '1px solid rgba(102, 252, 241, 0.2)' }}>
                <h4 style={{ marginBottom: '0.35rem', fontSize: '0.85rem', color: 'var(--accent-primary)' }}>Portfolio Recommendation</h4>
                <p style={{ fontSize: '0.88rem', lineHeight: 1.5, color: 'var(--text-primary)', margin: 0 }}>{assets.portfolioRecommendation}</p>
              </div>
            )}
          </div>
        ) : scoresExhausted ? (
          <div className="glass-card" style={{ textAlign: 'center', padding: '1.75rem', boxShadow: '#2663eb 0px 1px 8px -4px' }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '0.75rem' }}>
              <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'rgba(102, 252, 241, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent-primary)' }}>
                <Lock size={20} />
              </div>
            </div>
            <h3 style={{ fontSize: '1.05rem', marginBottom: '0.4rem' }}>Opportunity Score Locked</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', lineHeight: 1.5, marginBottom: '1rem' }}>
              You have reached your weekly allowance of 10 AI opportunity scores on the Free plan.
            </p>
            <a href="/api/stripe/checkout" className="btn-primary" style={{ padding: '0.45rem 1.15rem', display: 'inline-flex', fontSize: '0.85rem' }}>
              Upgrade to Pro Plan
            </a>
          </div>
        ) : (
          <OpportunityScoreRefresh jobId={job.id} hasBaseResume={hasBaseResume} />
        )}
      </section>

      {/* Header Area */}
      <div 
        style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'flex-start', 
          gap: '1.25rem', 
          marginBottom: '2rem',
          flexWrap: 'wrap'
        }}
      >
        <div style={{ flex: 1, minWidth: '260px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.35rem', flexWrap: 'wrap' }}>
            <h4 className="job-company" style={{ fontSize: '0.95rem', margin: 0, fontWeight: 700 }}>
              {cleanCompanyName(job.company)}
            </h4>
            {job.isEasyApply && (
              <span style={{ color: '#0284c7', background: 'rgba(2, 132, 199, 0.12)', border: '1px solid rgba(2, 132, 199, 0.3)', padding: '2px 7px', borderRadius: '12px', fontSize: '0.7rem', fontWeight: 600 }}>
                {job.source && !job.source.toLowerCase().includes('google') ? `${job.source} Easy Apply` : 'Easy Apply'}
              </span>
            )}
          </div>

          <h1 
            className="page-title" 
            style={{ 
              fontSize: embeddedMode ? '1.5rem' : '1.85rem', 
              margin: '0.2rem 0 0.75rem 0',
              lineHeight: 1.25,
              fontWeight: 700 
            }}
          >
            {job.title}
          </h1>

          <div className="job-meta" style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
              <MapPin size={15} style={{ color: 'var(--accent-primary)' }} /> {job.location || 'Remote'}
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
              <DollarSign size={15} style={{ color: 'var(--accent-primary)' }} /> {job.salaryRange || 'Not Listed'}
            </span>
            {status === 'applied' || appliedAt ? (
              <span className="badge badge-applied" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                <CheckCircle size={13} /> Applied {appliedAt ? new Date(appliedAt).toLocaleDateString('en-US', { timeZone: 'UTC', year: 'numeric', month: 'numeric', day: 'numeric' }) : ''}
              </span>
            ) : status === 'closed' ? (
              <span className="badge badge-closed" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                <AlertOctagon size={13} /> Closed / No Longer Hiring
              </span>
            ) : (
              <span className={`badge badge-${status}`}>{status.replace('_', ' ')}</span>
            )}
          </div>
        </div>

        {/* Header Right Actions */}
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexShrink: 0 }}>
          {embeddedMode && (
            <Link 
              href={`/job/${job.id}`} 
              target="_blank"
              rel="noreferrer"
              className="btn-outline" 
              style={{ 
                height: '38px', 
                padding: '0 0.75rem', 
                fontSize: '0.8rem', 
                display: 'inline-flex', 
                alignItems: 'center', 
                gap: '0.4rem',
                borderRadius: '8px'
              }}
              title="Open full page in new tab"
            >
              <Maximize2 size={14} /> Full Page
            </Link>
          )}

          <FeedbackButtonsWithNudge 
            jobId={job.id} 
            initialFeedback={feedback?.feedbackType as "like" | "dislike" | undefined} 
          />

          {totalScore ? (
            <div 
              className={`score-badge ${scoreClass}`} 
              style={{ 
                width: embeddedMode ? '48px' : '58px', 
                height: embeddedMode ? '48px' : '58px', 
                fontSize: embeddedMode ? '1.25rem' : '1.5rem',
                borderRadius: '12px'
              }}
            >
              {totalScore}
            </div>
          ) : scoresExhausted ? (
            <a 
              href="/api/stripe/checkout" 
              title="Weekly score allowance reached. Click to upgrade to Pro!" 
              className="score-badge" 
              style={{ 
                width: embeddedMode ? '48px' : '58px', 
                height: embeddedMode ? '48px' : '58px', 
                background: 'rgba(255, 255, 255, 0.05)', 
                border: '1px dashed rgba(255, 255, 255, 0.2)', 
                color: 'var(--text-secondary)', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center',
                borderRadius: '12px'
              }}
            >
              <Lock size={20} />
            </a>
          ) : null}
        </div>
      </div>

      {status === 'closed' && (
        <div style={{ margin: '0 0 1.5rem', padding: '0.75rem 1rem', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.25)', borderRadius: '8px', color: '#f87171', fontSize: '0.88rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <AlertOctagon size={18} />
          <span>This position has been identified as <strong>closed or no longer accepting applications</strong> by the employer.</span>
        </div>
      )}

      {/* Main Grid Content */}
      <div 
        className="job-detail-grid"
        style={{
          display: 'grid',
          gridTemplateColumns: embeddedMode ? '1fr' : undefined,
          gap: '2rem'
        }}
      >
        {/* Main Content Area */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2.5rem', minWidth: 0 }}>
          
          {/* Step 1: Review Job Description */}
          <section id="step-1-review" data-tour="job-detail-description">
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem' }}>
              <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: 'var(--accent-secondary, #2db5a5)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '0.85rem' }}>1</div>
              <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600 }}>Review Job Description</h2>
            </div>
            
            <div className="glass-card" style={{ padding: '1.5rem' }}>
              {!isDescriptionAdequate(job.description) ? (
                <AutoFetchJobDetails 
                  jobId={job.id} 
                  jobUrl={job.url || ''} 
                  initialDescription={job.description || ''} 
                />
              ) : (
                <div 
                  className="job-description-content"
                  style={{ color: 'var(--text-secondary)', wordBreak: 'break-word', overflowWrap: 'anywhere', fontSize: '0.95rem', lineHeight: '1.6', maxWidth: '100%', overflowX: 'hidden' }}
                  dangerouslySetInnerHTML={{ __html: job.formattedDescriptionHtml || '' }}
                />
              )}
            </div>

            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap', marginTop: '1.25rem' }}>
              <FeedbackButtons 
                jobId={job.id} 
                initialFeedback={feedback?.feedbackType as "like" | "dislike" | undefined} 
                initialIsArchived={userJob.isArchived}
                showSaveForLater={true}
              />
            </div>
          </section>

          {/* Feedback Nudge Inline Banner */}
          <FeedbackNudgeInlineBanner
            jobId={job.id}
            initialFeedback={feedback?.feedbackType as "like" | "dislike" | undefined}
          />

          {/* Step 2: Application Assets */}
          <section id="step-2-assets" data-tour="job-detail-assets">
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem' }}>
              <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: 'var(--accent-secondary, #2db5a5)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '0.85rem' }}>2</div>
              <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600 }}>Tailor Application</h2>
            </div>
            
            {assets ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
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
                  userName={userContact.userName}
                  userLocation={userContact.userLocation}
                  userPhone={userContact.userPhone}
                  userEmail={userContact.userEmail}
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
              <div className="glass-card" style={{ marginBottom: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem', padding: '1.5rem' }}>
                <div>
                  <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1.1rem', fontWeight: 700 }}>Tailored Application Assets</h3>
                  <p style={{ color: 'var(--text-secondary)', margin: 0, maxWidth: '640px', lineHeight: 1.5, fontSize: '0.9rem' }}>
                    Generate a highly personalized cover letter, networking message, and resume extract tailored specifically to this role using your profile and the job description.
                  </p>
                </div>
                <div>
                  <GenerateAssetsButton 
                    jobId={job.id} 
                    userPlanTier={planTier} 
                    generationsLeftThisWeek={assetGenerationsLeft} 
                    hasResume={hasBaseResume} 
                  />
                </div>
              </div>
            )}
          </section>

          {/* Step 3: Apply & Auto Apply */}
          <section id="step-3-apply" data-tour="job-detail-apply" style={{ marginBottom: '2rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem' }}>
              <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: 'var(--accent-secondary, #2db5a5)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '0.85rem' }}>3</div>
              <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600 }}>Apply</h2>
            </div>
            <ApplyStepAccordion
              jobId={job.id}
              initialUrl={job.url || ''}
              applicationUrl={job.applicationUrl || undefined}
              jobTitle={job.title}
              jobCompany={cleanCompanyName(job.company)}
              isPro={planTier === 'PRO'}
              appliesThisWeek={appliesThisWeek}
              hasAssets={!!(assets?.tailoredResumeMarkdown && assets?.coverLetterMarkdown)}
              hasResume={hasBaseResume}
              generationsLeftThisWeek={assetGenerationsLeft}
              isEasyApply={!!job.isEasyApply}
              jobSource={job.source || undefined}
              onAssetsGenerated={() => {
                // Invalidate cache and re-fetch so Step 2 shows newly generated assets
                jobDetailCache.delete(job.id);
                fetchJobData(job.id, true);
              }}
            />
          </section>

          {/* Step 4: Application Q&A */}
          <section id="step-4-qa" style={{ marginBottom: '2rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem' }}>
              <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: 'var(--accent-secondary, #2db5a5)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '0.85rem' }}>4</div>
              <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600 }}>Application Q&A</h2>
            </div>
            <ApplicationQA
              jobId={job.id}
              planTier={planTier}
              initialQaUsed={assets?.qaGenerationsUsed || 0}
              hasResume={hasBaseResume}
            />
          </section>
        </div>
      </div>
    </div>
  );
}
