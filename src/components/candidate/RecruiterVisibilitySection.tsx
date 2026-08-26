'use client';

import { useState, useEffect } from 'react';
import { UserCheck, Eye, EyeOff, Shield, ShieldCheck, Mail, CheckCircle2, Clock, XCircle, ArrowRight, Loader2, Award } from 'lucide-react';
import CandidateIntroModal from './CandidateIntroModal';

interface IntroductionItem {
  id: string;
  publicId: string;
  requestedAt: string;
  status: string;
  acceptedAt?: string | null;
  declinedAt?: string | null;
  jobFitScore?: number | null;
  job: {
    title: string;
    location?: string | null;
    remoteType?: string | null;
    salaryRange?: string | null;
    description?: string | null;
    requiredSkills?: string[];
  };
  organization: {
    name: string;
    website?: string | null;
    logoUrl?: string | null;
  };
  recruiter: {
    name: string;
    title: string;
    profilePhotoUrl?: string | null;
  };
}

export default function RecruiterVisibilitySection() {
  const [isDiscoverable, setIsDiscoverable] = useState<boolean>(false);
  const [shareResume, setShareResume] = useState<boolean>(true);
  const [shareContactOnAccept, setShareContactOnAccept] = useState<boolean>(true);
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [introductions, setIntroductions] = useState<IntroductionItem[]>([]);
  const [selectedIntro, setSelectedIntro] = useState<any | null>(null);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [visibilityRes, introsRes] = await Promise.all([
        fetch('/api/candidate/recruiter-visibility'),
        fetch('/api/candidate/introductions'),
      ]);

      if (visibilityRes.ok) {
        const visData = await visibilityRes.json();
        setIsDiscoverable(Boolean(visData.isDiscoverable));
        setShareResume(Boolean(visData.shareResume ?? true));
        setShareContactOnAccept(Boolean(visData.shareContactOnAccept ?? true));
      }

      if (introsRes.ok) {
        const introData = await introsRes.json();
        setIntroductions(introData.introductions || []);
      }
    } catch (err) {
      console.error('Failed to load candidate recruiter visibility:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleToggleDiscovery = async (newValue: boolean) => {
    setIsDiscoverable(newValue);
    setSaving(true);
    try {
      await fetch('/api/candidate/recruiter-visibility', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          isDiscoverable: newValue,
          shareResume,
          shareContactOnAccept,
        }),
      });
    } catch (err) {
      console.error('Failed to save visibility:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleOpenIntro = (intro: IntroductionItem) => {
    setSelectedIntro({
      id: intro.id,
      publicId: intro.publicId,
      jobTitle: intro.job.title,
      orgName: intro.organization.name,
      orgLogo: intro.organization.logoUrl,
      recruiterName: intro.recruiter.name,
      recruiterTitle: intro.recruiter.title,
      location: intro.job.location || 'Remote',
      remoteType: intro.job.remoteType,
      salaryRange: intro.job.salaryRange,
      description: intro.job.description,
      requiredSkills: intro.job.requiredSkills,
      status: intro.status,
    });
    setIsModalOpen(true);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem' }}>
      {/* Header Banner */}
      <div
        style={{
          padding: '1.5rem',
          backgroundColor: 'rgba(255, 255, 255, 0.02)',
          border: '1px solid var(--border-glass, rgba(255, 255, 255, 0.08))',
          borderRadius: '12px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '1rem',
        }}
      >
        <div style={{ maxWidth: '600px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
            <UserCheck size={20} style={{ color: '#38bdf8' }} />
            <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 600, color: 'var(--text-primary)' }}>
              Recruiter Discovery Network
            </h3>
            <span
              style={{
                fontSize: '0.75rem',
                fontWeight: 600,
                padding: '0.2rem 0.5rem',
                borderRadius: '6px',
                backgroundColor: isDiscoverable ? 'rgba(34, 197, 94, 0.15)' : 'rgba(148, 163, 184, 0.15)',
                color: isDiscoverable ? '#4ade80' : '#94a3b8',
                border: isDiscoverable ? '1px solid rgba(34, 197, 94, 0.3)' : '1px solid rgba(148, 163, 184, 0.2)',
              }}
            >
              {isDiscoverable ? 'DISCOVERABLE' : 'PRIVATE (OPTED OUT)'}
            </span>
          </div>
          <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            Allow verified recruiters and talent partners on Job Agent HQ to discover your professional profile for active positions. Your contact information is never shared until you explicitly accept an introduction request.
          </p>
        </div>

        {/* Toggle Switch */}
        <button
          onClick={() => handleToggleDiscovery(!isDiscoverable)}
          disabled={loading || saving}
          type="button"
          style={{
            width: '56px',
            height: '30px',
            borderRadius: '15px',
            backgroundColor: isDiscoverable ? '#2563eb' : 'rgba(255, 255, 255, 0.1)',
            position: 'relative',
            border: '1px solid var(--border-glass, rgba(255, 255, 255, 0.15))',
            cursor: loading || saving ? 'not-allowed' : 'pointer',
            transition: 'background-color 0.2s ease',
            padding: 0,
            display: 'flex',
            alignItems: 'center',
            flexShrink: 0,
          }}
        >
          <div
            style={{
              width: '24px',
              height: '24px',
              borderRadius: '50%',
              backgroundColor: '#ffffff',
              position: 'absolute',
              left: isDiscoverable ? '29px' : '3px',
              transition: 'left 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
              boxShadow: '0 2px 4px rgba(0,0,0,0.3)',
            }}
          />
        </button>
      </div>

      {/* Privacy Guarantees Info */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: '1rem',
        }}
      >
        <div
          style={{
            padding: '1.25rem',
            backgroundColor: 'rgba(255, 255, 255, 0.015)',
            border: '1px solid var(--border-glass, rgba(255, 255, 255, 0.06))',
            borderRadius: '10px',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.5rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#38bdf8', fontWeight: 600, fontSize: '0.9rem' }}>
            <Shield size={18} />
            <span>Anonymous Discovery</span>
          </div>
          <p style={{ margin: 0, fontSize: '0.825rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
            Recruiters view skills, experience levels, and job preferences. Direct contact details and full names remain private until introduction acceptance.
          </p>
        </div>

        <div
          style={{
            padding: '1.25rem',
            backgroundColor: 'rgba(255, 255, 255, 0.015)',
            border: '1px solid var(--border-glass, rgba(255, 255, 255, 0.06))',
            borderRadius: '10px',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.5rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#4ade80', fontWeight: 600, fontSize: '0.9rem' }}>
            <ShieldCheck size={18} />
            <span>Explicit Consent</span>
          </div>
          <p style={{ margin: 0, fontSize: '0.825rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
            You maintain full control over who reaches out. Review the job details and recruiter notes first, then choose whether to accept.
          </p>
        </div>
      </div>

      {/* Introductions Received Section */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '0.5rem' }}>
        <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)' }}>
          Received Introduction Requests ({introductions.length})
        </h4>

        {loading ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
            <Loader2 size={24} className="animate-spin" style={{ margin: '0 auto 0.5rem auto' }} />
            <span>Loading introduction requests...</span>
          </div>
        ) : introductions.length === 0 ? (
          <div
            style={{
              padding: '2.5rem 1.5rem',
              backgroundColor: 'rgba(255, 255, 255, 0.01)',
              border: '1px dashed var(--border-glass, rgba(255, 255, 255, 0.1))',
              borderRadius: '10px',
              textAlign: 'center',
              color: 'var(--text-secondary)',
              fontSize: '0.9rem',
            }}
          >
            <Mail size={28} style={{ margin: '0 auto 0.75rem auto', color: '#64748b' }} />
            <p style={{ margin: '0 0 0.25rem 0', fontWeight: 500, color: 'var(--text-primary)' }}>
              No introduction requests yet
            </p>
            <p style={{ margin: 0, fontSize: '0.825rem', color: '#94a3b8' }}>
              {isDiscoverable
                ? 'When a verified recruiter requests an introduction for an open role, it will appear here.'
                : 'Turn on Recruiter Discovery above to allow verified recruiters to discover your profile.'}
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {introductions.map((intro) => {
              const isPending = intro.status === 'REQUESTED' || intro.status === 'VIEWED';
              const isAccepted = intro.status === 'ACCEPTED' || intro.status === 'CONTACT_SHARED' || intro.status === 'INTERVIEW' || intro.status === 'OFFER';
              const isHired = intro.status === 'HIRED';
              const isDeclined = intro.status === 'DECLINED';

              return (
                <div
                  key={intro.id}
                  style={{
                    padding: '1.25rem',
                    backgroundColor: 'rgba(255, 255, 255, 0.02)',
                    border: '1px solid var(--border-glass, rgba(255, 255, 255, 0.08))',
                    borderRadius: '10px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: '1rem',
                  }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                      <span style={{ fontWeight: 600, fontSize: '1rem', color: 'var(--text-primary)' }}>
                        {intro.job.title}
                      </span>
                      <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                        at {intro.organization.name}
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', fontSize: '0.8rem', color: '#94a3b8' }}>
                      <span>Recruiter: {intro.recruiter.name}</span>
                      <span>Requested: {new Date(intro.requestedAt).toLocaleDateString()}</span>
                      {intro.jobFitScore && (
                        <span style={{ color: '#38bdf8', fontWeight: 600 }}>{intro.jobFitScore}% Match</span>
                      )}
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    {isPending && (
                      <button
                        onClick={() => handleOpenIntro(intro)}
                        style={{
                          padding: '0.5rem 1rem',
                          backgroundColor: '#2563eb',
                          color: '#ffffff',
                          border: 'none',
                          borderRadius: '8px',
                          fontSize: '0.825rem',
                          fontWeight: 600,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.35rem',
                        }}
                      >
                        <span>Review Request</span>
                        <ArrowRight size={14} />
                      </button>
                    )}

                    {isAccepted && (
                      <span
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.35rem',
                          padding: '0.35rem 0.75rem',
                          backgroundColor: 'rgba(34, 197, 94, 0.15)',
                          color: '#4ade80',
                          border: '1px solid rgba(34, 197, 94, 0.3)',
                          borderRadius: '6px',
                          fontSize: '0.8rem',
                          fontWeight: 600,
                        }}
                      >
                        <CheckCircle2 size={14} />
                        <span>Accepted</span>
                      </span>
                    )}

                    {isHired && (
                      <span
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.35rem',
                          padding: '0.35rem 0.75rem',
                          backgroundColor: 'rgba(56, 189, 248, 0.15)',
                          color: '#38bdf8',
                          border: '1px solid rgba(56, 189, 248, 0.3)',
                          borderRadius: '6px',
                          fontSize: '0.8rem',
                          fontWeight: 600,
                        }}
                      >
                        <Award size={14} />
                        <span>Placed / Hired</span>
                      </span>
                    )}

                    {isDeclined && (
                      <span
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.35rem',
                          padding: '0.35rem 0.75rem',
                          backgroundColor: 'rgba(148, 163, 184, 0.15)',
                          color: '#94a3b8',
                          border: '1px solid rgba(148, 163, 184, 0.2)',
                          borderRadius: '6px',
                          fontSize: '0.8rem',
                        }}
                      >
                        <XCircle size={14} />
                        <span>Declined</span>
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Intro Modal */}
      <CandidateIntroModal
        isOpen={isModalOpen}
        intro={selectedIntro}
        onClose={() => {
          setIsModalOpen(false);
          setSelectedIntro(null);
        }}
        onSuccess={fetchData}
      />
    </div>
  );
}
