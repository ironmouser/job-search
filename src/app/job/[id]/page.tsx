import { prisma } from '@/lib/prisma';
import { ArrowLeft, CheckCircle, Copy } from 'lucide-react';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import AutofillButton from '@/components/AutofillButton';
import ResumeActions from '@/components/ResumeActions';
import FeedbackButtons from '@/components/FeedbackButtons';
import ApplicationQA from '@/components/ApplicationQA';
import CopyToClipboardButton from '@/components/CopyToClipboardButton';
import BackToTopButton from '@/components/BackToTopButton';
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";

export default async function JobDetail({ params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    redirect('/');
  }
  const userId = session.user.id;
  const { id } = await params;
  
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
          <AutofillButton jobId={job.id} jobUrl={job.url} />
        </div>
      </div>

      <div className="job-detail-grid">
        
        {/* Main Content Area */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem', minWidth: 0 }}>
          <ApplicationQA jobId={job.id} />

          {/* Generated Assets Section */}
          {assets ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem', marginBottom: '3rem' }}>
              <details className="glass-card" style={{ cursor: 'pointer' }}>
                <summary style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                  <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--accent-primary)', margin: 0 }}>
                    <CheckCircle size={20} /> Tailored Networking Message
                  </h3>
                  <CopyToClipboardButton textToCopy={assets.networkingMessage || ''} />
                </summary>
                <div style={{ background: 'var(--bg-color)', padding: '1.5rem', borderRadius: '8px', border: '1px solid var(--border-glass)', marginTop: '1.5rem', cursor: 'auto' }}>
                  <p>{assets.networkingMessage}</p>
                </div>
              </details>

              <details className="glass-card" style={{ cursor: 'pointer' }}>
                <summary style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                  <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--accent-primary)', margin: 0 }}>
                    <CheckCircle size={20} /> Cover Letter
                  </h3>
                  <CopyToClipboardButton textToCopy={assets.coverLetterMarkdown || ''} />
                </summary>
                <div style={{ background: 'var(--bg-color)', padding: '1.5rem', borderRadius: '8px', border: '1px solid var(--border-glass)', whiteSpace: 'pre-wrap', wordBreak: 'break-word', marginTop: '1.5rem', cursor: 'auto' }}>
                  {assets.coverLetterMarkdown}
                </div>
              </details>
              
              <details className="glass-card" style={{ cursor: 'pointer' }}>
                <summary style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--accent-primary)', margin: 0 }}>
                  <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--accent-primary)', margin: 0 }}>
                    <CheckCircle size={20} /> Tailored Resume Extract
                  </h3>
                </summary>
                <div style={{ background: 'var(--bg-color)', padding: '1.5rem', borderRadius: '8px', border: '1px solid var(--border-glass)', marginTop: '1.5rem', cursor: 'auto', overflow: 'auto' }}>
                  <div style={{ whiteSpace: 'pre-wrap', fontFamily: 'monospace', fontSize: '0.9rem' }}>
                    {assets.tailoredResumeMarkdown}
                  </div>
                  <ResumeActions jobId={job.id} markdownText={assets.tailoredResumeMarkdown || ''} />
                </div>
              </details>
            </div>
          ) : (
            <div className="glass-card" style={{ marginBottom: '2rem', textAlign: 'center', padding: '3rem' }}>
              <p style={{ color: 'var(--text-secondary)' }}>Assets haven't been generated for this job yet.</p>
              {totalScore >= 80 && (
                <button className="btn-outline" style={{ marginTop: '1rem' }}>Generate Assets</button>
              )}
            </div>
          )}

          {/* Raw JD */}
          <div className="glass-card">
            <h3 style={{ marginBottom: '1rem' }}>Original Job Description</h3>
            <div style={{ color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: '0.95rem' }}>
              {job.description}
            </div>
          </div>
          
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginTop: '1rem', marginBottom: '2rem' }}>
            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <FeedbackButtons jobId={job.id} initialFeedback={feedback?.feedbackType as "like" | "dislike" | undefined} />
              {totalScore && (
                <div className={`score-badge ${scoreClass}`} style={{ width: '64px', height: '64px', fontSize: '1.5rem' }}>
                  {totalScore}
                </div>
              )}
              <AutofillButton jobId={job.id} jobUrl={job.url} />
            </div>
            
            <BackToTopButton />
          </div>
        </div>

        {/* Sidebar - Scoring */}
        <div>
          {scores ? (
            <div className="glass-card" style={{ position: 'sticky', top: '2rem' }}>
              <h3 style={{ marginBottom: '1.5rem' }}>AI Opportunity Score</h3>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <ScoreRow label="Product Fit (20%)" score={scores.productFitScore} />
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
                <p style={{ fontSize: '0.9rem', lineHeight: 1.5 }}>{scores.analysisNotes}</p>
              </div>
              
              {assets?.portfolioRecommendation && (
                <div style={{ marginTop: '1.5rem', padding: '1rem', background: 'rgba(102, 252, 241, 0.1)', borderRadius: '8px', border: '1px solid rgba(102, 252, 241, 0.2)' }}>
                  <h4 style={{ marginBottom: '0.5rem', fontSize: '0.9rem', color: 'var(--accent-primary)' }}>Portfolio Recommendation</h4>
                  <p style={{ fontSize: '0.9rem', lineHeight: 1.5, color: 'var(--text-primary)' }}>{assets.portfolioRecommendation}</p>
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
