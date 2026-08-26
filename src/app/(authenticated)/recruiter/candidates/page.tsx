'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  Search,
  Filter,
  MapPin,
  DollarSign,
  Send,
  UserCheck,
  CheckCircle2,
  X,
  Loader2,
} from 'lucide-react';
import RecruiterHeader from '@/components/recruiter/RecruiterHeader';

export default function CandidateDiscoveryPage() {
  const [candidates, setCandidates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [keyword, setKeyword] = useState('');
  const [location, setLocation] = useState('');
  const [remoteOnly, setRemoteOnly] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Job selection for Introduction
  const [jobs, setJobs] = useState<any[]>([]);
  const [selectedCandidate, setSelectedCandidate] = useState<any | null>(null);
  const [selectedJobId, setSelectedJobId] = useState<string>('');
  const [introNotes, setIntroNotes] = useState('');
  const [sendingIntro, setSendingIntro] = useState(false);
  const [introSuccess, setIntroSuccess] = useState<string | null>(null);
  const [introError, setIntroError] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const fetchCandidates = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (keyword) params.append('keyword', keyword);
      if (location) params.append('location', location);
      if (remoteOnly) params.append('remoteOnly', 'true');

      const res = await fetch(`/api/recruiter/candidates?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setCandidates(data.candidates || []);
      }
    } catch (err) {
      console.error('Failed to search candidates:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchRecruiterJobs = async () => {
    try {
      const res = await fetch('/api/recruiter/jobs');
      if (res.ok) {
        const data = await res.json();
        const activeJobs = (data.jobs || []).filter((j: any) => j.status === 'ACTIVE');
        setJobs(activeJobs);
        if (activeJobs.length > 0) {
          setSelectedJobId(activeJobs[0].id);
        }
      }
    } catch (err) {
      console.error('Failed to load jobs for intro:', err);
    }
  };

  useEffect(() => {
    fetchCandidates();
    fetchRecruiterJobs();
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchCandidates();
  };

  const handleSendIntro = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCandidate || !selectedJobId) return;

    setSendingIntro(true);
    setIntroError(null);
    setIntroSuccess(null);

    try {
      const res = await fetch('/api/recruiter/introductions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          candidateId: selectedCandidate.id,
          recruiterJobId: selectedJobId,
          notes: introNotes,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to send introduction request');
      }

      setIntroSuccess(`Introduction request sent (Ref: ${data.introduction.publicId})`);
      setTimeout(() => {
        setSelectedCandidate(null);
        setIntroNotes('');
        setIntroSuccess(null);
      }, 1500);
    } catch (err: any) {
      setIntroError(err.message || 'An error occurred');
    } finally {
      setSendingIntro(false);
    }
  };

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
          if (e.target === e.currentTarget && !sendingIntro) setSelectedCandidate(null);
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
              disabled={sendingIntro}
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

          <form onSubmit={handleSendIntro}>
            <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              {introError && (
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
                  {introError}
                </div>
              )}
              {introSuccess && (
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
                  <span>{introSuccess}</span>
                </div>
              )}

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
                  Target Candidate
                </label>
                <div
                  style={{
                    padding: '0.75rem 1rem',
                    backgroundColor: 'rgba(0, 0, 0, 0.07)',
                    border: '1px solid var(--border-glass)',
                    borderRadius: '8px',
                    fontSize: '0.9rem',
                    fontWeight: 600,
                    color: 'var(--text-primary)',
                  }}
                >
                  {selectedCandidate.displayName} &bull; {selectedCandidate.headline}
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
                  Select Position / Job Opening *
                </label>
                {jobs.length === 0 ? (
                  <div style={{ fontSize: '0.85rem', color: '#fca5a5' }}>
                    No active job openings found. Please create a job opening first.
                  </div>
                ) : (
                  <select
                    value={selectedJobId}
                    onChange={(e) => setSelectedJobId(e.target.value)}
                    className="input-base"
                    style={{ width: '100%', padding: '0.65rem 0.85rem', borderRadius: '8px' }}
                  >
                    {jobs.map((j) => (
                      <option key={j.id} value={j.id}>
                        {j.title} ({j.location || 'Remote'})
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
                  Note to Candidate (Optional)
                </label>
                <textarea
                  rows={3}
                  value={introNotes}
                  onChange={(e) => setIntroNotes(e.target.value)}
                  placeholder="We think your background in technical leadership would be a great fit..."
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
                disabled={sendingIntro}
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
                disabled={sendingIntro || Boolean(introSuccess) || jobs.length === 0}
                style={{
                  padding: '0.6rem 1.35rem',
                  backgroundColor: '#3695e3',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  cursor: sendingIntro ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                }}
              >
                {sendingIntro ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                <span>Send Request</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    ) : null;

  return (
    <div>
      <RecruiterHeader
        title="Candidate Discovery"
        subtitle="Search opted-in talent profiles. Candidate contact details are revealed upon introduction acceptance."
      />

      {/* Filter Bar inside a glass card */}
      <div className="glass-card" style={{ padding: '1.25rem', marginBottom: '1.75rem' }}>
        <form
          onSubmit={handleSearch}
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '1rem',
            alignItems: 'center',
          }}
        >
          <div style={{ flex: '1 1 260px' }}>
            <input
              type="text"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="Search by role, title, or skills (e.g. React, Product Manager)..."
              className="input-base"
              style={{ width: '100%', padding: '0.65rem 0.85rem', borderRadius: '8px' }}
            />
          </div>

          <div style={{ flex: '1 1 180px' }}>
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Location or State..."
              className="input-base"
              style={{ width: '100%', padding: '0.65rem 0.85rem', borderRadius: '8px' }}
            />
          </div>

          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              fontSize: '0.85rem',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              userSelect: 'none',
            }}
          >
            <input
              type="checkbox"
              checked={remoteOnly}
              onChange={(e) => setRemoteOnly(e.target.checked)}
              style={{ borderRadius: '4px' }}
            />
            <span>Remote Only</span>
          </label>

          <button
            type="submit"
            disabled={loading}
            style={{
              padding: '0.65rem 1.25rem',
              backgroundColor: 'rgba(54,149,227,0.15)',
              border: '1px solid rgba(54,149,227,0.3)',
              borderRadius: '8px',
              color: '#3695e3',
              fontSize: '0.875rem',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              transition: 'all 0.15s ease',
            }}
          >
            <Search size={16} />
            <span>Search Talent</span>
          </button>
        </form>
      </div>

      {/* Candidate List */}
      <div className="glass-card" style={{ padding: '1.75rem', marginBottom: '2rem' }}>
        <div style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
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
            <UserCheck size={22} color="#10b981" /> Talent Pool ({candidates.length})
          </h3>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>
            <Loader2 size={24} className="animate-spin" style={{ margin: '0 auto 0.5rem auto' }} />
            <p style={{ margin: 0, fontSize: '0.9rem' }}>Searching discoverable talent...</p>
          </div>
        ) : candidates.length === 0 ? (
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
              No candidates found matching criteria
            </h3>
            <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
              Try broadening your search query or removing location filters.
            </p>
          </div>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
              gap: '1.25rem',
            }}
          >
            {candidates.map((candidate) => (
              <div
                key={candidate.id}
                style={{
                  padding: '1.5rem',
                  background: 'rgba(0, 0, 0, 0.07)',
                  border: '1px solid var(--border-glass)',
                  borderRadius: '12px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  gap: '1rem',
                  transition: 'all 0.15s ease',
                }}
              >
                <div>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'flex-start',
                      gap: '0.5rem',
                      marginBottom: '0.5rem',
                    }}
                  >
                    <div>
                      <h4
                        style={{
                          margin: 0,
                          fontSize: '1.05rem',
                          fontWeight: 600,
                          color: 'var(--text-primary)',
                        }}
                      >
                        {candidate.displayName}
                      </h4>
                      <div style={{ fontSize: '0.85rem', color: '#3695e3', marginTop: '0.15rem', fontWeight: 500 }}>
                        {candidate.headline}
                      </div>
                    </div>

                    {candidate.intent && (
                      <span
                        style={{
                          fontSize: '0.7rem',
                          fontWeight: 600,
                          padding: '0.15rem 0.5rem',
                          borderRadius: '9999px',
                          backgroundColor:
                            candidate.intent.intentLevel === 'HIGH'
                              ? 'rgba(249, 115, 22, 0.15)'
                              : 'rgba(148, 163, 184, 0.12)',
                          color: candidate.intent.intentLevel === 'HIGH' ? '#fb923c' : 'var(--text-secondary)',
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

                  <div
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: '0.75rem',
                      fontSize: '0.8rem',
                      color: 'var(--text-secondary)',
                      marginBottom: '0.75rem',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                      <MapPin size={13} style={{ color: '#3695e3' }} />
                      <span>{candidate.location}</span>
                    </div>
                    <span>&bull;</span>
                    <span>{candidate.remotePreference}</span>
                    {candidate.expectedSalaryRange && (
                      <>
                        <span>&bull;</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                          <DollarSign size={13} style={{ color: '#10b981' }} />
                          <span>{candidate.expectedSalaryRange}</span>
                        </div>
                      </>
                    )}
                  </div>

                  {candidate.professionalSummary && (
                    <p
                      style={{
                        margin: '0 0 0.75rem 0',
                        fontSize: '0.825rem',
                        color: 'var(--text-secondary)',
                        lineHeight: 1.4,
                      }}
                    >
                      {candidate.professionalSummary}
                    </p>
                  )}

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

                <div
                  style={{
                    borderTop: '1px solid var(--border-glass)',
                    paddingTop: '0.75rem',
                    display: 'flex',
                    justifyContent: 'flex-end',
                  }}
                >
                  <button
                    onClick={() => setSelectedCandidate(candidate)}
                    style={{
                      padding: '0.45rem 0.9rem',
                      backgroundColor: 'rgba(54,149,227,0.15)',
                      border: '1px solid rgba(54,149,227,0.3)',
                      borderRadius: '6px',
                      color: '#3695e3',
                      fontSize: '0.825rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.35rem',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <Send size={13} />
                    <span>Request Introduction</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {introModalContent && createPortal(introModalContent, document.body)}
    </div>
  );
}
