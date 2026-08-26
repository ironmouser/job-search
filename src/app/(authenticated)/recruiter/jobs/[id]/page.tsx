'use client';

import { useState, useEffect, use } from 'react';
import Link from 'next/link';
import { createPortal } from 'react-dom';
import {
  Briefcase,
  ArrowLeft,
  RefreshCw,
  Send,
  CheckCircle2,
  Sparkles,
  MapPin,
  DollarSign,
  UserCheck,
  X,
  Loader2,
  Award,
} from 'lucide-react';
import RecruiterHeader from '@/components/recruiter/RecruiterHeader';

export default function RecruiterJobDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [job, setJob] = useState<any | null>(null);
  const [matches, setMatches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [matching, setMatching] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Intro Request Modal State
  const [selectedCandidate, setSelectedCandidate] = useState<any | null>(null);
  const [introNotes, setIntroNotes] = useState('');
  const [requesting, setRequesting] = useState(false);
  const [requestSuccess, setRequestSuccess] = useState<string | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const fetchJobData = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/recruiter/jobs/${id}`);
      if (res.ok) {
        const data = await res.json();
        setJob(data.job);
        setMatches(data.matches || []);
      }
    } catch (err) {
      console.error('Failed to load recruiter job details:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchJobData();
  }, [id]);

  const handleRunMatching = async () => {
    try {
      setMatching(true);
      const res = await fetch(`/api/recruiter/jobs/${id}/match`, { method: 'POST' });
      if (res.ok) {
        await fetchJobData();
      }
    } catch (err) {
      console.error('Failed to re-run candidate matching:', err);
    } finally {
      setMatching(false);
    }
  };

  const handleSendIntroduction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCandidate) return;

    setRequesting(true);
    setRequestError(null);
    setRequestSuccess(null);

    try {
      const res = await fetch('/api/recruiter/introductions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          candidateId: selectedCandidate.id,
          recruiterJobId: job.id,
          notes: introNotes,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to send introduction request');
      }

      setRequestSuccess(`Introduction request sent (Ref: ${data.introduction.publicId})`);
      setTimeout(() => {
        setSelectedCandidate(null);
        setIntroNotes('');
        setRequestSuccess(null);
        fetchJobData();
      }, 1500);
    } catch (err: any) {
      setRequestError(err.message || 'An error occurred');
    } finally {
      setRequesting(false);
    }
  };

  if (loading) {
    return (
      <div>
        <RecruiterHeader />
        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>
          <Loader2 size={24} className="animate-spin" style={{ margin: '0 auto 0.5rem auto' }} />
          <p style={{ margin: 0, fontSize: '0.9rem' }}>Loading position details and candidate matches...</p>
        </div>
      </div>
    );
  }

  if (!job) {
    return (
      <div>
        <RecruiterHeader />
        <div className="glass-card" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
          Job opening not found.
        </div>
      </div>
    );
  }

  const introModalContent =
    mounted && selectedCandidate && typeof document !== 'undefined' ? (
      <div
        style={{
          position: 'fixed',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          backgroundColor: 'rgba(0, 0, 0, 0.6)',
          padding: '1rem',
        }}
        onClick={(e) => {
          if (e.target === e.currentTarget && !requesting) setSelectedCandidate(null);
        }}
      >
        <div
          role="dialog"
          aria-modal="true"
          style={{
            width: '100%',
            maxWidth: '540px',
            backgroundColor: 'var(--card)',
            color: 'var(--card-foreground)',
            border: '1px solid var(--border)',
            borderRadius: 16,
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.3), 0 8px 10px -6px rgba(0, 0, 0, 0.2)',
            maxHeight: '90vh',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              padding: '1.25rem 1.5rem',
              borderBottom: '1px solid var(--border-glass, rgba(255, 255, 255, 0.08))',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <Send size={18} color="#3695e3" />
              <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 600, color: 'var(--foreground)' }}>
                Request Candidate Introduction
              </h3>
            </div>
            <button
              onClick={() => setSelectedCandidate(null)}
              disabled={requesting}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--muted-foreground)',
                padding: '4px',
                borderRadius: '6px',
              }}
            >
              <X size={18} />
            </button>
          </div>

          <form onSubmit={handleSendIntroduction}>
            <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              {requestError && (
                <div
                  style={{
                    padding: '0.75rem 1rem',
                    backgroundColor: 'rgba(239, 68, 68, 0.15)',
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                    borderRadius: '8px',
                    color: '#fca5a5',
                    fontSize: '0.875rem',
                  }}
                >
                  {requestError}
                </div>
              )}
              {requestSuccess && (
                <div
                  style={{
                    padding: '0.75rem 1rem',
                    backgroundColor: 'rgba(16, 185, 129, 0.15)',
                    border: '1px solid rgba(16, 185, 129, 0.3)',
                    borderRadius: '8px',
                    color: '#10b981',
                    fontSize: '0.875rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                  }}
                >
                  <CheckCircle2 size={16} />
                  <span>{requestSuccess}</span>
                </div>
              )}

              <div
                style={{
                  padding: '1rem',
                  backgroundColor: 'rgba(0, 0, 0, 0.07)',
                  border: '1px solid var(--border-glass)',
                  borderRadius: '8px',
                  fontSize: '0.875rem',
                }}
              >
                <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.25rem' }}>
                  Target Candidate: {selectedCandidate.displayName}
                </div>
                <div style={{ color: 'var(--text-secondary)' }}>
                  Position: {job.title}
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
                  Personalized Note to Candidate (Optional)
                </label>
                <textarea
                  rows={4}
                  value={introNotes}
                  onChange={(e) => setIntroNotes(e.target.value)}
                  placeholder="Hi! We noticed your strong background in full stack development and think you would be an exceptional fit for our team. We'd love to connect..."
                  className="input-base"
                  style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', lineHeight: 1.5, resize: 'vertical' }}
                />
              </div>

              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                The candidate will receive an email notification detailing the role. Contact information will be revealed once the candidate accepts.
              </div>
            </div>

            <div
              style={{
                padding: '1rem 1.5rem',
                borderTop: '1px solid var(--border-glass, rgba(255, 255, 255, 0.08))',
                display: 'flex',
                justifyContent: 'flex-end',
                gap: '0.75rem',
                backgroundColor: 'rgba(0, 0, 0, 0.07)',
              }}
            >
              <button
                type="button"
                disabled={requesting}
                onClick={() => setSelectedCandidate(null)}
                style={{
                  padding: '0.6rem 1.1rem',
                  backgroundColor: 'transparent',
                  color: 'var(--text-secondary)',
                  border: '1px solid var(--border-glass, rgba(255, 255, 255, 0.12))',
                  borderRadius: '8px',
                  fontSize: '0.875rem',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={requesting || Boolean(requestSuccess)}
                style={{
                  padding: '0.6rem 1.35rem',
                  backgroundColor: '#3695e3',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  cursor: requesting ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                }}
              >
                {requesting ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                <span>Send Introduction Request</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    ) : null;

  return (
    <div>
      <RecruiterHeader
        title={job.title}
        subtitle="Review position details, AI-scored candidate matches, and request introductions."
      />

      {/* Back Link */}
      <div style={{ marginBottom: '1.5rem' }}>
        <Link
          href="/recruiter/jobs"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.4rem',
            color: 'var(--text-secondary)',
            fontSize: '0.875rem',
            textDecoration: 'none',
            fontWeight: 500,
          }}
        >
          <ArrowLeft size={16} />
          <span>Back to Job Openings</span>
        </Link>
      </div>

      {/* Header Summary Card in glass-card */}
      <div className="glass-card" style={{ padding: '1.75rem', marginBottom: '2rem' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            flexWrap: 'wrap',
            gap: '1rem',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxWidth: '750px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
              <h2 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                {job.title}
              </h2>
              <span
                style={{
                  fontSize: '0.7rem',
                  fontWeight: 700,
                  padding: '0.15rem 0.5rem',
                  borderRadius: '9999px',
                  backgroundColor: 'rgba(16, 185, 129, 0.15)',
                  color: '#10b981',
                  border: '1px solid rgba(16, 185, 129, 0.3)',
                }}
              >
                {job.status}
              </span>
            </div>

            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: '1.25rem',
                fontSize: '0.875rem',
                color: 'var(--text-secondary)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <MapPin size={15} style={{ color: '#3695e3' }} />
                <span>
                  {job.location || 'Remote'} ({job.remoteType})
                </span>
              </div>
              {job.salaryMin && job.salaryMax && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <DollarSign size={15} style={{ color: '#10b981' }} />
                  <span>
                    ${job.salaryMin.toLocaleString()} - ${job.salaryMax.toLocaleString()} {job.salaryCurrency}
                  </span>
                </div>
              )}
            </div>

            {job.requiredSkills && job.requiredSkills.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginTop: '0.25rem' }}>
                {job.requiredSkills.map((skill: string, i: number) => (
                  <span
                    key={i}
                    style={{
                      fontSize: '0.75rem',
                      padding: '0.2rem 0.5rem',
                      borderRadius: '6px',
                      backgroundColor: 'rgba(255, 255, 255, 0.05)',
                      color: 'var(--text-secondary)',
                      border: '1px solid var(--border-glass, rgba(255, 255, 255, 0.06))',
                    }}
                  >
                    {skill}
                  </span>
                ))}
              </div>
            )}
          </div>

          <button
            onClick={handleRunMatching}
            disabled={matching}
            style={{
              padding: '0.65rem 1.25rem',
              backgroundColor: 'rgba(54,149,227,0.15)',
              border: '1px solid rgba(54,149,227,0.3)',
              borderRadius: '8px',
              color: '#3695e3',
              fontSize: '0.875rem',
              fontWeight: 600,
              cursor: matching ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              transition: 'all 0.15s ease',
            }}
          >
            <RefreshCw size={15} className={matching ? 'animate-spin' : ''} />
            <span>{matching ? 'Scoring Candidates...' : 'Re-run Matching'}</span>
          </button>
        </div>
      </div>

      {/* Scored Candidate Matches */}
      <div className="glass-card" style={{ padding: '1.75rem', marginBottom: '2rem' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '1.5rem',
            flexWrap: 'wrap',
            gap: '0.75rem',
          }}
        >
          <h3
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.6rem',
              margin: 0,
              fontSize: '1.25rem',
              fontWeight: 600,
              color: 'var(--text-primary)',
            }}
          >
            <UserCheck size={22} color="#3695e3" /> Scored Candidate Matches ({matches.length})
          </h3>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            Ranked by Job Fit Score & Intent
          </span>
        </div>

        {matches.length === 0 ? (
          <div
            style={{
              padding: '3rem 1.5rem',
              background: 'rgba(0, 0, 0, 0.05)',
              border: '1px dashed var(--border-glass, rgba(255, 255, 255, 0.1))',
              borderRadius: '12px',
              textAlign: 'center',
              color: 'var(--text-secondary)',
            }}
          >
            <UserCheck size={36} style={{ margin: '0 auto 0.75rem auto', color: '#64748b' }} />
            <h3 style={{ margin: '0 0 0.5rem 0', color: 'var(--text-primary)', fontSize: '1.1rem' }}>
              No candidate matches found yet
            </h3>
            <p style={{ margin: '0 0 1rem 0', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
              Eligible candidates who have opted into discovery will be scored automatically.
            </p>
            <button
              onClick={handleRunMatching}
              disabled={matching}
              style={{
                padding: '0.6rem 1.25rem',
                backgroundColor: '#3695e3',
                color: '#ffffff',
                border: 'none',
                borderRadius: '8px',
                fontSize: '0.875rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Run Matching Now
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {matches.map((candidate) => {
              const hasIntro = Boolean(candidate.introductionStatus);

              return (
                <div
                  key={candidate.id}
                  style={{
                    padding: '1.5rem',
                    background: 'rgba(0, 0, 0, 0.07)',
                    border: '1px solid var(--border-glass)',
                    borderRadius: '12px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '1rem',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'flex-start',
                      flexWrap: 'wrap',
                      gap: '1rem',
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                          {candidate.displayName}
                        </span>

                        {/* Fit Score Badge */}
                        {candidate.jobFitScore && (
                          <span
                            style={{
                              fontSize: '0.75rem',
                              fontWeight: 700,
                              padding: '0.15rem 0.55rem',
                              borderRadius: '9999px',
                              backgroundColor:
                                candidate.jobFitScore >= 80
                                  ? 'rgba(16, 185, 129, 0.15)'
                                  : 'rgba(54, 149, 227, 0.15)',
                              color: candidate.jobFitScore >= 80 ? '#10b981' : '#3695e3',
                              border:
                                candidate.jobFitScore >= 80
                                  ? '1px solid rgba(16, 185, 129, 0.3)'
                                  : '1px solid rgba(54, 149, 227, 0.3)',
                            }}
                          >
                            {candidate.jobFitScore}% Job Match
                          </span>
                        )}

                        {/* Intent Badge */}
                        {candidate.intent && (
                          <span
                            style={{
                              fontSize: '0.75rem',
                              fontWeight: 600,
                              padding: '0.15rem 0.55rem',
                              borderRadius: '9999px',
                              backgroundColor:
                                candidate.intent.intentLevel === 'HIGH'
                                  ? 'rgba(249, 115, 22, 0.15)'
                                  : 'rgba(148, 163, 184, 0.12)',
                              color:
                                candidate.intent.intentLevel === 'HIGH' ? '#fb923c' : 'var(--text-secondary)',
                              border: `1px solid ${
                                candidate.intent.intentLevel === 'HIGH'
                                  ? 'rgba(249, 115, 22, 0.3)'
                                  : 'rgba(148, 163, 184, 0.25)'
                              }`,
                            }}
                          >
                            {candidate.intent.displayLabel}
                          </span>
                        )}
                      </div>

                      <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                        {candidate.headline} &bull; {candidate.location} &bull; {candidate.remotePreference}
                      </div>
                    </div>

                    {/* Action Button */}
                    <div>
                      {hasIntro ? (
                        <span
                          style={{
                            padding: '0.45rem 0.85rem',
                            borderRadius: '9999px',
                            fontSize: '0.8rem',
                            fontWeight: 600,
                            backgroundColor:
                              candidate.introductionStatus === 'ACCEPTED' ||
                              candidate.introductionStatus === 'CONTACT_SHARED'
                                ? 'rgba(16, 185, 129, 0.15)'
                                : 'rgba(54, 149, 227, 0.15)',
                            color:
                              candidate.introductionStatus === 'ACCEPTED' ||
                              candidate.introductionStatus === 'CONTACT_SHARED'
                                ? '#10b981'
                                : '#3695e3',
                            border: `1px solid ${
                              candidate.introductionStatus === 'ACCEPTED' ||
                              candidate.introductionStatus === 'CONTACT_SHARED'
                                ? 'rgba(16, 185, 129, 0.3)'
                                : 'rgba(54, 149, 227, 0.3)'
                            }`,
                          }}
                        >
                          Intro Status: {candidate.introductionStatus}
                        </span>
                      ) : (
                        <button
                          onClick={() => setSelectedCandidate(candidate)}
                          style={{
                            padding: '0.5rem 1rem',
                            backgroundColor: 'rgba(54,149,227,0.15)',
                            border: '1px solid rgba(54,149,227,0.3)',
                            borderRadius: '8px',
                            color: '#3695e3',
                            fontSize: '0.85rem',
                            fontWeight: 600,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.4rem',
                            transition: 'all 0.15s ease',
                          }}
                        >
                          <Send size={14} />
                          <span>Request Introduction</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Match Reasons */}
                  {candidate.matchReasons && candidate.matchReasons.length > 0 && (
                    <div
                      style={{
                        padding: '0.85rem 1rem',
                        backgroundColor: 'rgba(54, 149, 227, 0.05)',
                        borderLeft: '3px solid #3695e3',
                        borderRadius: '6px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.35rem',
                        fontSize: '0.825rem',
                        color: 'var(--text-secondary)',
                      }}
                    >
                      <div style={{ fontWeight: 600, color: '#3695e3', fontSize: '0.8rem' }}>
                        Match Highlights:
                      </div>
                      {candidate.matchReasons.map((reason: string, idx: number) => (
                        <div key={idx} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.4rem' }}>
                          <span style={{ color: '#3695e3' }}>&bull;</span>
                          <span>{reason}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Skills tags */}
                  {candidate.skills && candidate.skills.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                      {candidate.skills.map((skill: string, idx: number) => (
                        <span
                          key={idx}
                          style={{
                            fontSize: '0.75rem',
                            padding: '0.15rem 0.45rem',
                            borderRadius: '6px',
                            backgroundColor: 'rgba(255, 255, 255, 0.05)',
                            color: 'var(--text-secondary)',
                            border: '1px solid var(--border-glass, rgba(255, 255, 255, 0.06))',
                          }}
                        >
                          {skill}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {introModalContent && createPortal(introModalContent, document.body)}
    </div>
  );
}
