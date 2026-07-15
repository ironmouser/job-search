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
          <AutofillButton jobId={job.id} jobUrl={job.url} />
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
            <div className="glass-card">
              <div style={{ color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: '0.95rem' }}>
                {job.description}
              </div>
            </div>
            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap', marginTop: '1.5rem' }}>
              <FeedbackButtons jobId={job.id} initialFeedback={feedback?.feedbackType as "like" | "dislike" | undefined} />
            </div>
          </section>

          {/* Step 2: Application Assets */}
          <section>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
              <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'var(--accent-primary)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}>2</div>
              <h2 style={{ margin: 0, fontSize: '1.5rem' }}>Generate Assets</h2>
            </div>
            
            {assets ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                <details className="glass-card" style={{ cursor: 'pointer' }}>
                  <summary style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', listStyle: 'none' }}>
                    <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--accent-primary)', margin: 0 }}>
                      <CheckCircle size={20} /> Tailored Networking Message
                    </h3>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                      <CopyToClipboardButton textToCopy={assets.networkingMessage || ''} />
                      <ChevronDown className="accordion-chevron" size={20} style={{ color: 'var(--text-secondary)' }} />
                    </div>
                  </summary>
                  <div style={{ background: 'var(--bg-color)', padding: '1.5rem', borderRadius: '8px', border: '1px solid var(--border-glass)', marginTop: '1.5rem', cursor: 'auto' }}>
                    <p>{assets.networkingMessage}</p>
                  </div>
                </details>

                <details className="glass-card" style={{ cursor: 'pointer' }}>
                  <summary style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', listStyle: 'none' }}>
                    <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--accent-primary)', margin: 0 }}>
                      <CheckCircle size={20} /> Cover Letter
                    </h3>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                      <CopyToClipboardButton textToCopy={assets.coverLetterMarkdown || ''} />
                      <ChevronDown className="accordion-chevron" size={20} style={{ color: 'var(--text-secondary)' }} />
                    </div>
                  </summary>
                  <div style={{ background: 'var(--bg-color)', padding: '1.5rem', borderRadius: '8px', border: '1px solid var(--border-glass)', whiteSpace: 'pre-wrap', wordBreak: 'break-word', marginTop: '1.5rem', cursor: 'auto' }}>
                    {assets.coverLetterMarkdown}
                  </div>
                </details>
                
                <details className="glass-card" style={{ cursor: 'pointer' }}>
                  <summary style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', listStyle: 'none' }}>
                    <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--accent-primary)', margin: 0 }}>
                      <CheckCircle size={20} /> Tailored Resume Extract
                    </h3>
                    <ChevronDown className="accordion-chevron" size={20} style={{ color: 'var(--text-secondary)' }} />
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
              <AutofillButton jobId={job.id} jobUrl={job.url} />
            </div>
          </section>

          {/* Step 4: Application Q&A */}
          <section style={{ marginBottom: '2rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
              <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'var(--accent-primary)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}>4</div>
              <h2 style={{ margin: 0, fontSize: '1.5rem' }}>Application Q&A</h2>
            </div>
            <ApplicationQA jobId={job.id} />
          </section>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem', marginBottom: '2rem' }}>
            <BackToTopButton />
          </div>
        </div>

        {/* Sidebar - Scoring */}
        <div style={{ paddingTop: '3.5rem' }}>
          {scores ? (
            <div className="glass-card" style={{ position: 'sticky', top: '2rem' }}>
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
