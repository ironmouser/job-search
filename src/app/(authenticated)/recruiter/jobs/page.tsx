'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { createPortal } from 'react-dom';
import {
  Briefcase,
  Plus,
  Search,
  MapPin,
  DollarSign,
  Users,
  ArrowRight,
  X,
  Loader2,
  Sparkles,
} from 'lucide-react';
import RecruiterHeader from '@/components/recruiter/RecruiterHeader';

export default function RecruiterJobsPage() {
  const [jobs, setJobs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const fetchJobs = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/recruiter/jobs');
      if (res.ok) {
        const data = await res.json();
        setJobs(data.jobs || []);
      }
    } catch (err) {
      console.error('Failed to fetch recruiter jobs:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchJobs();
  }, []);

  const handleCreateJob = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setError(null);

    try {
      const res = await fetch('/api/recruiter/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, description }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to create job opening');
      }

      setIsModalOpen(false);
      setTitle('');
      setDescription('');
      fetchJobs();
    } catch (err: any) {
      setError(err.message || 'An error occurred while creating the job opening');
    } finally {
      setCreating(false);
    }
  };

  const modalContent =
    mounted && isModalOpen && typeof document !== 'undefined' ? (
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
          if (e.target === e.currentTarget && !creating) setIsModalOpen(false);
        }}
      >
        <div
          role="dialog"
          aria-modal="true"
          style={{
            width: '100%',
            maxWidth: '680px',
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
              <Sparkles size={20} color="#3695e3" />
              <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 600, color: 'var(--foreground)' }}>
                Add Job Opening
              </h3>
            </div>
            <button
              onClick={() => setIsModalOpen(false)}
              disabled={creating}
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

          <form onSubmit={handleCreateJob} style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ padding: '1.5rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              {error && (
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
                  {error}
                </div>
              )}

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
                  Job Title (Optional &bull; will be automatically extracted if left blank)
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Senior Full Stack Engineer"
                  className="input-base"
                  style={{ width: '100%', padding: '0.65rem 0.85rem', borderRadius: '8px' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
                  Job Description *
                </label>
                <textarea
                  required
                  rows={10}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Paste the full job description here. Our AI will normalize the content and extract key skills, seniority, and salary requirements automatically..."
                  className="input-base"
                  style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', lineHeight: 1.5, resize: 'vertical' }}
                />
              </div>
            </div>

            <div
              style={{
                padding: '1rem 1.5rem',
                borderTop: '1px solid var(--border-glass, rgba(255, 255, 255, 0.08))',
                backgroundColor: 'rgba(0, 0, 0, 0.07)',
                display: 'flex',
                justifyContent: 'flex-end',
                gap: '0.75rem',
              }}
            >
              <button
                type="button"
                disabled={creating}
                onClick={() => setIsModalOpen(false)}
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
                disabled={creating}
                style={{
                  padding: '0.6rem 1.35rem',
                  backgroundColor: '#3695e3',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  cursor: creating ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                }}
              >
                {creating ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    <span>Ingesting & Matching...</span>
                  </>
                ) : (
                  <>
                    <Sparkles size={16} />
                    <span>Parse & Post Opening</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    ) : null;

  return (
    <div>
      <RecruiterHeader
        title="Job Openings"
        subtitle="Manage position requirements and review AI-scored candidate matches."
      />

      <div className="glass-card" style={{ padding: '1.75rem', marginBottom: '2rem' }}>
        <div
          style={{
            marginBottom: '1.5rem',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 12,
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
            <Briefcase size={22} color="#8b5cf6" /> Active Positions ({jobs.length})
          </h3>
          <button
            onClick={() => setIsModalOpen(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              background: 'rgba(54,149,227,0.15)',
              border: '1px solid rgba(54,149,227,0.3)',
              borderRadius: 8,
              color: '#3695e3',
              padding: '8px 16px',
              fontSize: '0.875rem',
              fontWeight: 600,
              cursor: 'pointer',
              textDecoration: 'none',
              transition: 'all 0.15s ease',
            }}
          >
            <Plus size={16} /> Add Job Opening
          </button>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>
            <Loader2 size={24} className="animate-spin" style={{ margin: '0 auto 0.5rem auto' }} />
            <p style={{ margin: 0, fontSize: '0.9rem' }}>Loading job openings...</p>
          </div>
        ) : jobs.length === 0 ? (
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
            <Briefcase size={36} style={{ margin: '0 auto 0.75rem auto', color: '#64748b' }} />
            <h3 style={{ margin: '0 0 0.5rem 0', color: 'var(--text-primary)', fontSize: '1.1rem' }}>
              No job openings created yet
            </h3>
            <p style={{ margin: '0 0 1.25rem 0', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
              Paste a job description to extract structured requirements and automatically score eligible candidates.
            </p>
            <button
              onClick={() => setIsModalOpen(true)}
              style={{
                padding: '0.65rem 1.25rem',
                backgroundColor: '#3695e3',
                color: '#ffffff',
                border: 'none',
                borderRadius: '8px',
                fontSize: '0.875rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Add Job Opening
            </button>
          </div>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
              gap: '1.25rem',
            }}
          >
            {jobs.map((job) => (
              <div
                key={job.id}
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
                    <h4
                      style={{
                        margin: 0,
                        fontSize: '1.05rem',
                        fontWeight: 600,
                        color: 'var(--text-primary)',
                      }}
                    >
                      {job.title}
                    </h4>
                    <span
                      style={{
                        fontSize: '0.7rem',
                        fontWeight: 700,
                        padding: '0.15rem 0.45rem',
                        borderRadius: '9999px',
                        backgroundColor:
                          job.status === 'ACTIVE' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(148, 163, 184, 0.15)',
                        color: job.status === 'ACTIVE' ? '#10b981' : '#94a3b8',
                        border: `1px solid ${
                          job.status === 'ACTIVE' ? 'rgba(16, 185, 129, 0.3)' : 'rgba(148, 163, 184, 0.25)'
                        }`,
                      }}
                    >
                      {job.status}
                    </span>
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
                      <span>
                        {job.location || 'Remote'} ({job.remoteType || 'Remote'})
                      </span>
                    </div>
                    {job.salaryMin && job.salaryMax && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                        <DollarSign size={13} style={{ color: '#10b981' }} />
                        <span>
                          ${job.salaryMin.toLocaleString()} - ${job.salaryMax.toLocaleString()}
                        </span>
                      </div>
                    )}
                  </div>

                  {job.requiredSkills && job.requiredSkills.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                      {job.requiredSkills.slice(0, 4).map((skill: string, idx: number) => (
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
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <div style={{ fontSize: '0.825rem', color: 'var(--text-secondary)' }}>
                    <strong style={{ color: '#3695e3' }}>{job.matchCount}</strong> candidates matched
                  </div>

                  <Link
                    href={`/recruiter/jobs/${job.id}`}
                    style={{
                      padding: '0.45rem 0.9rem',
                      backgroundColor: 'rgba(54,149,227,0.15)',
                      border: '1px solid rgba(54,149,227,0.3)',
                      color: '#3695e3',
                      borderRadius: '6px',
                      fontSize: '0.8rem',
                      fontWeight: 600,
                      textDecoration: 'none',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.35rem',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <span>View Matches</span>
                    <ArrowRight size={13} />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {modalContent && createPortal(modalContent, document.body)}
    </div>
  );
}
