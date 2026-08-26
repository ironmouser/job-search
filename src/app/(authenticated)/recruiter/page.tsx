'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Briefcase,
  Users,
  GitPullRequest,
  CheckCircle2,
  Plus,
  ArrowRight,
  Loader2,
  Search,
  LayoutDashboard,
} from 'lucide-react';
import RecruiterHeader from '@/components/recruiter/RecruiterHeader';

export default function RecruiterDashboardPage() {
  const [loading, setLoading] = useState(true);
  const [jobs, setJobs] = useState<any[]>([]);
  const [introductions, setIntroductions] = useState<any[]>([]);

  useEffect(() => {
    const loadDashboard = async () => {
      try {
        const [jobsRes, introsRes] = await Promise.all([
          fetch('/api/recruiter/jobs'),
          fetch('/api/recruiter/introductions'),
        ]);

        if (jobsRes.ok) {
          const data = await jobsRes.json();
          setJobs(data.jobs || []);
        }

        if (introsRes.ok) {
          const data = await introsRes.json();
          setIntroductions(data.introductions || []);
        }
      } catch (err) {
        console.error('Failed to load recruiter dashboard:', err);
      } finally {
        setLoading(false);
      }
    };

    loadDashboard();
  }, []);

  if (loading) {
    return (
      <div>
        <RecruiterHeader />
        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>
          <Loader2 size={28} className="animate-spin" style={{ margin: '0 auto 0.5rem auto' }} />
          <p style={{ margin: 0, fontSize: '0.9rem' }}>Loading recruiter dashboard...</p>
        </div>
      </div>
    );
  }

  const activeJobs = jobs.filter((j) => j.status === 'ACTIVE');
  const totalMatches = jobs.reduce((acc, j) => acc + (j.matchCount || 0), 0);
  const acceptedIntros = introductions.filter(
    (i) =>
      i.status === 'ACCEPTED' ||
      i.status === 'CONTACT_SHARED' ||
      i.status === 'INTERVIEW' ||
      i.status === 'OFFER' ||
      i.status === 'HIRED'
  );
  const acceptanceRate =
    introductions.length > 0 ? Math.round((acceptedIntros.length / introductions.length) * 100) : 0;

  const quickLinks = [
    {
      title: 'Job Openings',
      description: 'Manage position requirements and view matched candidates.',
      href: '/recruiter/jobs',
      Icon: Briefcase,
      color: '#8b5cf6',
    },
    {
      title: 'Candidate Discovery',
      description: 'Search vetted candidates who have opted into talent discovery.',
      href: '/recruiter/candidates',
      Icon: Search,
      color: '#10b981',
    },
    {
      title: 'Pipeline & Introductions',
      description: 'Track candidate response statuses and confirmed placements.',
      href: '/recruiter/pipeline',
      Icon: GitPullRequest,
      color: '#ec4899',
    },
  ];

  return (
    <div>
      <RecruiterHeader
        title="Recruiter Overview"
        subtitle="Track open positions, discover vetted candidate matches, and manage introductions."
      />

      {/* Metric Cards (Styled identically to Org Admin) */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: 16,
          marginBottom: '2rem',
        }}
      >
        {[
          {
            label: 'Active Openings',
            value: activeJobs.length,
            color: '#8b5cf6',
          },
          {
            label: 'Scored Candidates',
            value: totalMatches,
            color: '#3695e3',
          },
          {
            label: 'Total Introductions',
            value: introductions.length,
            color: '#ec4899',
          },
          {
            label: 'Acceptance Rate',
            value: `${acceptanceRate}%`,
            color: '#10b981',
          },
        ].map(({ label, value, color }) => (
          <div key={label} className="glass-card" style={{ padding: '1.5rem' }}>
            <p
              style={{
                margin: 0,
                fontSize: '0.78rem',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                color: 'var(--text-secondary)',
                marginBottom: 8,
                fontWeight: 600,
              }}
            >
              {label}
            </p>
            <p style={{ margin: 0, fontSize: '2rem', fontWeight: 700, color }}>{value}</p>
          </div>
        ))}
      </div>

      {/* Quick Navigation Actions Card */}
      <div className="glass-card" style={{ padding: '1.75rem', marginBottom: '2rem' }}>
        <h3
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.6rem',
            fontSize: '1.25rem',
            fontWeight: 600,
            color: 'var(--text-primary)',
            marginBottom: '1.5rem',
          }}
        >
          <LayoutDashboard size={22} color="#3695e3" /> Quick Recruiter Actions
        </h3>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
            gap: 16,
          }}
        >
          {quickLinks.map(({ title, description, href, Icon, color }) => (
            <Link key={title} href={href} style={{ textDecoration: 'none', color: 'inherit' }}>
              <div
                style={{
                  background: 'rgba(0, 0, 0, 0.07)',
                  border: '1px solid var(--border-glass)',
                  borderRadius: 12,
                  padding: '1.25rem',
                  transition: 'all 0.2s ease',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  height: '100%',
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                    <div
                      style={{
                        background: `${color}20`,
                        color: color,
                        padding: 8,
                        borderRadius: 8,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Icon size={20} />
                    </div>
                    <h4
                      style={{
                        margin: 0,
                        fontSize: '1rem',
                        fontWeight: 600,
                        color: 'var(--text-primary)',
                        textTransform: 'none',
                        letterSpacing: 'normal',
                      }}
                    >
                      {title}
                    </h4>
                  </div>
                  <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                    {description}
                  </p>
                </div>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    color: color,
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    marginTop: 16,
                  }}
                >
                  View {title} <ArrowRight size={14} />
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* Grid: Active Openings & Pipeline Activity */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))',
          gap: '1.5rem',
        }}
      >
        {/* Active Openings Card */}
        <div className="glass-card" style={{ padding: '1.75rem' }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '1.25rem',
            }}
          >
            <h3
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.6rem',
                margin: 0,
                fontSize: '1.15rem',
                fontWeight: 600,
                color: 'var(--text-primary)',
              }}
            >
              <Briefcase size={20} color="#8b5cf6" /> Active Openings ({activeJobs.length})
            </h3>
            <Link
              href="/recruiter/jobs"
              style={{
                fontSize: '0.85rem',
                color: '#3695e3',
                textDecoration: 'none',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              <span>View All</span>
              <ArrowRight size={14} />
            </Link>
          </div>

          {jobs.length === 0 ? (
            <div
              style={{
                padding: '2rem 1rem',
                textAlign: 'center',
                color: 'var(--text-secondary)',
                fontSize: '0.875rem',
              }}
            >
              No job openings created yet. Post your first opening to trigger candidate discovery.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {jobs.slice(0, 5).map((job) => (
                <Link
                  key={job.id}
                  href={`/recruiter/jobs/${job.id}`}
                  style={{
                    padding: '0.85rem 1rem',
                    background: 'rgba(0, 0, 0, 0.07)',
                    border: '1px solid var(--border-glass)',
                    borderRadius: 10,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    textDecoration: 'none',
                    color: 'inherit',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.925rem' }}>
                      {job.title}
                    </div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: 2 }}>
                      {job.location || 'Remote'} &bull; {job.seniority || 'Mid-Senior'}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                    <span
                      style={{
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        padding: '0.2rem 0.55rem',
                        borderRadius: '9999px',
                        backgroundColor: 'rgba(54, 149, 227, 0.15)',
                        color: '#3695e3',
                        border: '1px solid rgba(54, 149, 227, 0.3)',
                      }}
                    >
                      {job.matchCount} Matches
                    </span>
                    <ArrowRight size={14} style={{ color: 'var(--text-secondary)' }} />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Pipeline Activity Card */}
        <div className="glass-card" style={{ padding: '1.75rem' }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '1.25rem',
            }}
          >
            <h3
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.6rem',
                margin: 0,
                fontSize: '1.15rem',
                fontWeight: 600,
                color: 'var(--text-primary)',
              }}
            >
              <GitPullRequest size={20} color="#ec4899" /> Recent Introductions ({introductions.length})
            </h3>
            <Link
              href="/recruiter/pipeline"
              style={{
                fontSize: '0.85rem',
                color: '#3695e3',
                textDecoration: 'none',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              <span>View Pipeline</span>
              <ArrowRight size={14} />
            </Link>
          </div>

          {introductions.length === 0 ? (
            <div
              style={{
                padding: '2rem 1rem',
                textAlign: 'center',
                color: 'var(--text-secondary)',
                fontSize: '0.875rem',
              }}
            >
              No introductions requested yet. Discover matching candidates from your open positions.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {introductions.slice(0, 5).map((intro) => (
                <div
                  key={intro.id}
                  style={{
                    padding: '0.85rem 1rem',
                    background: 'rgba(0, 0, 0, 0.07)',
                    border: '1px solid var(--border-glass)',
                    borderRadius: 10,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.925rem' }}>
                      {intro.candidateDisplayName}
                    </div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: 2 }}>
                      for {intro.job?.title || 'Open Position'}
                    </div>
                  </div>

                  <span
                    style={{
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      padding: '0.2rem 0.55rem',
                      borderRadius: '9999px',
                      backgroundColor:
                        intro.status === 'ACCEPTED' || intro.status === 'CONTACT_SHARED'
                          ? 'rgba(16, 185, 129, 0.15)'
                          : intro.status === 'HIRED'
                          ? 'rgba(54, 149, 227, 0.15)'
                          : 'rgba(245, 158, 11, 0.15)',
                      color:
                        intro.status === 'ACCEPTED' || intro.status === 'CONTACT_SHARED'
                          ? '#10b981'
                          : intro.status === 'HIRED'
                          ? '#3695e3'
                          : '#f59e0b',
                      border: `1px solid ${
                        intro.status === 'ACCEPTED' || intro.status === 'CONTACT_SHARED'
                          ? 'rgba(16, 185, 129, 0.3)'
                          : intro.status === 'HIRED'
                          ? 'rgba(54, 149, 227, 0.3)'
                          : 'rgba(245, 158, 11, 0.3)'
                      }`,
                    }}
                  >
                    {intro.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
