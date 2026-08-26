'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  GitPullRequest,
  Mail,
  Phone,
  CheckCircle2,
  Clock,
  XCircle,
  Award,
  ArrowRight,
  User,
  Briefcase,
  ChevronDown,
  Loader2,
  X,
  Send,
} from 'lucide-react';
import RecruiterHeader from '@/components/recruiter/RecruiterHeader';

export default function RecruiterPipelinePage() {
  const [introductions, setIntroductions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [mounted, setMounted] = useState(false);

  // Hire Report Modal State
  const [reportingIntro, setReportingIntro] = useState<any | null>(null);
  const [hireNotes, setHireNotes] = useState('');
  const [submittingHire, setSubmittingHire] = useState(false);
  const [hireSuccess, setHireSuccess] = useState<string | null>(null);
  const [hireError, setHireError] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const fetchIntroductions = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/recruiter/introductions');
      if (res.ok) {
        const data = await res.json();
        setIntroductions(data.introductions || []);
      }
    } catch (err) {
      console.error('Failed to fetch introductions:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchIntroductions();
  }, []);

  const handleAdvanceStage = async (introId: string, newStage: string) => {
    try {
      const res = await fetch(`/api/recruiter/introductions/${introId}/stage`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage: newStage }),
      });

      if (res.ok) {
        fetchIntroductions();
      }
    } catch (err) {
      console.error('Failed to advance pipeline stage:', err);
    }
  };

  const handleReportHireSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reportingIntro) return;

    setSubmittingHire(true);
    setHireError(null);
    setHireSuccess(null);

    try {
      const res = await fetch(`/api/recruiter/introductions/${reportingIntro.id}/report-hire`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: hireNotes }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to report placement');
      }

      setHireSuccess('Placement reported! Confirmation request sent to candidate.');
      setTimeout(() => {
        setReportingIntro(null);
        setHireNotes('');
        setHireSuccess(null);
        fetchIntroductions();
      }, 1500);
    } catch (err: any) {
      setHireError(err.message || 'An error occurred');
    } finally {
      setSubmittingHire(false);
    }
  };

  const filteredIntros = introductions.filter((intro) => {
    if (statusFilter === 'ALL') return true;
    if (statusFilter === 'PENDING') return intro.status === 'REQUESTED' || intro.status === 'VIEWED';
    if (statusFilter === 'ACCEPTED') return intro.status === 'ACCEPTED' || intro.status === 'CONTACT_SHARED';
    if (statusFilter === 'INTERVIEW') return intro.status === 'INTERVIEW';
    if (statusFilter === 'OFFER') return intro.status === 'OFFER';
    if (statusFilter === 'HIRED') return intro.status === 'HIRED';
    if (statusFilter === 'DECLINED') return intro.status === 'DECLINED' || intro.status === 'CLOSED';
    return true;
  });

  const hireModalContent =
    mounted && reportingIntro && typeof document !== 'undefined' ? (
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
          if (e.target === e.currentTarget && !submittingHire) setReportingIntro(null);
        }}
      >
        <div
          role="dialog"
          aria-modal="true"
          style={{
            width: '100%',
            maxWidth: '520px',
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
              <Award size={20} color="#3695e3" />
              <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 600, color: 'var(--foreground)' }}>
                Report Placement & Hire
              </h3>
            </div>
            <button
              onClick={() => setReportingIntro(null)}
              disabled={submittingHire}
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

          <form onSubmit={handleReportHireSubmit}>
            <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              {hireError && (
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
                  {hireError}
                </div>
              )}
              {hireSuccess && (
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
                  <span>{hireSuccess}</span>
                </div>
              )}

              <div
                style={{
                  padding: '0.85rem 1rem',
                  backgroundColor: 'rgba(0, 0, 0, 0.07)',
                  border: '1px solid var(--border-glass)',
                  borderRadius: '8px',
                  fontSize: '0.875rem',
                }}
              >
                <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                  {reportingIntro.candidateDisplayName}
                </div>
                <div style={{ color: 'var(--text-secondary)', fontSize: '0.825rem', marginTop: 2 }}>
                  Position: {reportingIntro.job?.title}
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
                  Placement Notes / Start Date (Optional)
                </label>
                <textarea
                  rows={3}
                  value={hireNotes}
                  onChange={(e) => setHireNotes(e.target.value)}
                  placeholder="Candidate accepted offer with start date on the first of next month..."
                  className="input-base"
                  style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', resize: 'vertical' }}
                />
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
                disabled={submittingHire}
                onClick={() => setReportingIntro(null)}
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
                disabled={submittingHire || Boolean(hireSuccess)}
                style={{
                  padding: '0.6rem 1.35rem',
                  backgroundColor: '#10b981',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  cursor: submittingHire ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                }}
              >
                {submittingHire ? <Loader2 size={16} className="animate-spin" /> : <Award size={16} />}
                <span>Confirm Placement</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    ) : null;

  return (
    <div>
      <RecruiterHeader
        title="Pipeline & Introductions"
        subtitle="Manage candidate introduction requests, revealed contact info, and hiring outcomes."
      />

      <div className="glass-card" style={{ padding: '1.75rem', marginBottom: '2rem' }}>
        {/* Filter Tabs matching Org Admin pill buttons */}
        <div
          style={{
            display: 'flex',
            gap: '0.5rem',
            flexWrap: 'wrap',
            marginBottom: '1.5rem',
            paddingBottom: '1rem',
            borderBottom: '1px solid var(--border-glass, rgba(255, 255, 255, 0.08))',
          }}
        >
          {[
            { label: 'All', value: 'ALL', color: '#3695e3' },
            { label: 'Pending Response', value: 'PENDING', color: '#f59e0b' },
            { label: 'Accepted / Contact Shared', value: 'ACCEPTED', color: '#10b981' },
            { label: 'Interviewing', value: 'INTERVIEW', color: '#8b5cf6' },
            { label: 'Offer', value: 'OFFER', color: '#3b82f6' },
            { label: 'Hired', value: 'HIRED', color: '#10b981' },
            { label: 'Declined', value: 'DECLINED', color: '#ef4444' },
          ].map((tab) => {
            const active = statusFilter === tab.value;
            return (
              <button
                key={tab.value}
                onClick={() => setStatusFilter(tab.value)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '6px 14px',
                  borderRadius: 9999,
                  fontSize: '0.85rem',
                  fontWeight: active ? 600 : 500,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  backgroundColor: active ? `${tab.color}25` : 'rgba(255,255,255,0.05)',
                  color: active ? tab.color : 'var(--text-secondary)',
                  border: `1px solid ${active ? `${tab.color}60` : 'var(--border-glass, rgba(255,255,255,0.12))'}`,
                }}
              >
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Introductions List */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>
            <Loader2 size={24} className="animate-spin" style={{ margin: '0 auto 0.5rem auto' }} />
            <p style={{ margin: 0, fontSize: '0.9rem' }}>Loading pipeline...</p>
          </div>
        ) : filteredIntros.length === 0 ? (
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
            <GitPullRequest size={36} style={{ margin: '0 auto 0.75rem auto', color: '#64748b' }} />
            <h3 style={{ margin: '0 0 0.5rem 0', color: 'var(--text-primary)', fontSize: '1.1rem' }}>
              No introductions in this stage
            </h3>
            <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
              Request introductions from Candidate Discovery or your Job Openings matches.
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {filteredIntros.map((intro) => {
              const isContactShared =
                intro.status === 'ACCEPTED' ||
                intro.status === 'CONTACT_SHARED' ||
                intro.status === 'INTERVIEW' ||
                intro.status === 'OFFER' ||
                intro.status === 'HIRED';

              return (
                <div
                  key={intro.id}
                  style={{
                    padding: '1.5rem',
                    background: 'rgba(0, 0, 0, 0.07)',
                    border: '1px solid var(--border-glass)',
                    borderRadius: '12px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: '1.25rem',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                        {intro.candidateDisplayName}
                      </span>

                      <span
                        style={{
                          fontSize: '0.7rem',
                          fontWeight: 600,
                          padding: '0.2rem 0.55rem',
                          borderRadius: '9999px',
                          backgroundColor:
                            intro.status === 'ACCEPTED' || intro.status === 'CONTACT_SHARED'
                              ? 'rgba(16, 185, 129, 0.15)'
                              : intro.status === 'HIRED'
                              ? 'rgba(54, 149, 227, 0.15)'
                              : intro.status === 'INTERVIEW'
                              ? 'rgba(139, 92, 246, 0.15)'
                              : 'rgba(245, 158, 11, 0.15)',
                          color:
                            intro.status === 'ACCEPTED' || intro.status === 'CONTACT_SHARED'
                              ? '#10b981'
                              : intro.status === 'HIRED'
                              ? '#3695e3'
                              : intro.status === 'INTERVIEW'
                              ? '#8b5cf6'
                              : '#f59e0b',
                          border: `1px solid ${
                            intro.status === 'ACCEPTED' || intro.status === 'CONTACT_SHARED'
                              ? 'rgba(16, 185, 129, 0.3)'
                              : intro.status === 'HIRED'
                              ? 'rgba(54, 149, 227, 0.3)'
                              : intro.status === 'INTERVIEW'
                              ? 'rgba(139, 92, 246, 0.3)'
                              : 'rgba(245, 158, 11, 0.3)'
                          }`,
                        }}
                      >
                        {intro.status}
                      </span>

                      {intro.jobFitScore && (
                        <span style={{ fontSize: '0.8rem', color: '#3695e3', fontWeight: 600 }}>
                          {intro.jobFitScore}% Match (Alg {intro.matchVersion || 'v1'})
                        </span>
                      )}
                    </div>

                    <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                      Position: <strong style={{ color: 'var(--text-primary)' }}>{intro.job?.title}</strong> &bull; Ref: {intro.publicId}
                    </div>

                    {/* Revealed Contact Information */}
                    {isContactShared && intro.candidateEmail ? (
                      <div
                        style={{
                          display: 'flex',
                          flexWrap: 'wrap',
                          gap: '1.25rem',
                          marginTop: '0.5rem',
                          padding: '0.65rem 0.85rem',
                          backgroundColor: 'rgba(16, 185, 129, 0.08)',
                          border: '1px solid rgba(16, 185, 129, 0.25)',
                          borderRadius: '8px',
                          fontSize: '0.825rem',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: '#10b981' }}>
                          <Mail size={14} />
                          <a href={`mailto:${intro.candidateEmail}`} style={{ color: '#10b981', textDecoration: 'none', fontWeight: 600 }}>
                            {intro.candidateEmail}
                          </a>
                        </div>
                        {intro.candidatePhone && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: 'var(--text-secondary)' }}>
                            <Phone size={14} />
                            <span>{intro.candidatePhone}</span>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontStyle: 'italic', marginTop: 2 }}>
                        Contact information protected pending candidate acceptance.
                      </div>
                    )}
                  </div>

                  {/* Stage Controls & Placement Reporting */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                    {isContactShared && intro.status !== 'HIRED' && (
                      <>
                        <select
                          value={intro.status}
                          onChange={(e) => handleAdvanceStage(intro.id, e.target.value)}
                          className="input-base"
                          style={{ padding: '0.45rem 0.75rem', borderRadius: '6px', fontSize: '0.8rem' }}
                        >
                          <option value="ACCEPTED">Accepted</option>
                          <option value="INTERVIEW">Interviewing</option>
                          <option value="OFFER">Offer Extended</option>
                          <option value="CLOSED">Closed</option>
                        </select>

                        <button
                          onClick={() => setReportingIntro(intro)}
                          style={{
                            padding: '0.45rem 0.85rem',
                            backgroundColor: 'rgba(16, 185, 129, 0.15)',
                            border: '1px solid rgba(16, 185, 129, 0.3)',
                            color: '#10b981',
                            borderRadius: '6px',
                            fontSize: '0.8rem',
                            fontWeight: 600,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.35rem',
                            transition: 'all 0.15s ease',
                          }}
                        >
                          <Award size={14} />
                          <span>Report Hire</span>
                        </button>
                      </>
                    )}

                    {intro.status === 'HIRED' && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: '#10b981', fontSize: '0.85rem', fontWeight: 600 }}>
                        <Award size={16} />
                        <span>Hired & Confirmed</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {hireModalContent && createPortal(hireModalContent, document.body)}
    </div>
  );
}
