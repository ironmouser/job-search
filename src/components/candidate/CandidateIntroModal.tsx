'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, CheckCircle2, Building2, MapPin, DollarSign, UserCheck, ShieldCheck, Loader2 } from 'lucide-react';

interface IntroductionDetails {
  id: string;
  publicId: string;
  jobTitle: string;
  orgName: string;
  orgLogo?: string | null;
  recruiterName: string;
  recruiterTitle: string;
  location: string;
  remoteType?: string | null;
  salaryRange?: string | null;
  description?: string | null;
  requiredSkills?: string[];
  notes?: string | null;
  status: string;
}

interface CandidateIntroModalProps {
  isOpen: boolean;
  intro: IntroductionDetails | null;
  onClose: () => void;
  onSuccess: () => void;
}

export default function CandidateIntroModal({
  isOpen,
  intro,
  onClose,
  onSuccess,
}: CandidateIntroModalProps) {
  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!isOpen || !intro || !mounted) return null;

  const handleRespond = async (response: 'ACCEPTED' | 'DECLINED') => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/candidate/introductions/${intro.id}/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ response }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to respond to introduction');
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || 'An error occurred while submitting your response');
    } finally {
      setLoading(false);
    }
  };

  const modalContent = (
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
        if (e.target === e.currentTarget && !loading) onClose();
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '580px',
          backgroundColor: '#0f172a',
          border: '1px solid rgba(255, 255, 255, 0.12)',
          borderRadius: '16px',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.5)',
          color: '#f8fafc',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '1.25rem 1.5rem',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '10px',
                backgroundColor: 'rgba(37, 99, 235, 0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#38bdf8',
              }}
            >
              <UserCheck size={20} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600, color: '#f8fafc' }}>
                Recruiter Introduction Request
              </h3>
              <p style={{ margin: 0, fontSize: '0.8rem', color: '#94a3b8' }}>
                Reference ID: {intro.publicId}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={loading}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#94a3b8',
              cursor: 'pointer',
              padding: '0.25rem',
              borderRadius: '6px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Scrollable Body */}
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

          {/* Job Overview Card */}
          <div
            style={{
              padding: '1.25rem',
              backgroundColor: 'rgba(255, 255, 255, 0.03)',
              border: '1px solid rgba(255, 255, 255, 0.06)',
              borderRadius: '12px',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.75rem',
            }}
          >
            <div style={{ fontSize: '1.2rem', fontWeight: 700, color: '#f8fafc' }}>
              {intro.jobTitle}
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', fontSize: '0.875rem', color: '#cbd5e1' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <Building2 size={15} style={{ color: '#38bdf8' }} />
                <span>{intro.orgName}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <MapPin size={15} style={{ color: '#38bdf8' }} />
                <span>{intro.location}</span>
              </div>
              {intro.salaryRange && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <DollarSign size={15} style={{ color: '#4ade80' }} />
                  <span>{intro.salaryRange}</span>
                </div>
              )}
            </div>

            <div style={{ fontSize: '0.85rem', color: '#94a3b8', paddingTop: '0.25rem' }}>
              Contacting Recruiter: <strong style={{ color: '#e2e8f0' }}>{intro.recruiterName}</strong> ({intro.recruiterTitle})
            </div>
          </div>

          {/* Recruiter Note if present */}
          {intro.notes && (
            <div
              style={{
                padding: '1rem',
                backgroundColor: 'rgba(56, 189, 248, 0.06)',
                borderLeft: '3px solid #38bdf8',
                borderRadius: '6px',
                fontSize: '0.875rem',
                color: '#e2e8f0',
                lineHeight: 1.5,
              }}
            >
              <div style={{ fontWeight: 600, color: '#38bdf8', marginBottom: '0.25rem', fontSize: '0.8rem' }}>
                Note from Recruiter:
              </div>
              {intro.notes}
            </div>
          )}

          {/* Privacy & Contact Disclosure */}
          <div
            style={{
              padding: '1rem',
              backgroundColor: 'rgba(34, 197, 94, 0.06)',
              border: '1px solid rgba(34, 197, 94, 0.15)',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '0.75rem',
              fontSize: '0.825rem',
              color: '#cbd5e1',
              lineHeight: 1.5,
            }}
          >
            <ShieldCheck size={20} style={{ color: '#4ade80', flexShrink: 0, marginTop: '2px' }} />
            <div>
              <strong style={{ color: '#f8fafc' }}>Your Privacy is Protected.</strong> If you accept, your primary email address will be shared directly with {intro.recruiterName} to arrange interview steps. If you decline, no contact details are shared.
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div
          style={{
            padding: '1rem 1.5rem',
            borderTop: '1px solid rgba(255, 255, 255, 0.08)',
            backgroundColor: 'rgba(0, 0, 0, 0.2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: '0.75rem',
          }}
        >
          <button
            type="button"
            disabled={loading}
            onClick={() => handleRespond('DECLINED')}
            style={{
              padding: '0.65rem 1.25rem',
              backgroundColor: 'transparent',
              color: '#94a3b8',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              borderRadius: '8px',
              fontSize: '0.875rem',
              fontWeight: 500,
              cursor: loading ? 'not-allowed' : 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            Decline
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={() => handleRespond('ACCEPTED')}
            style={{
              padding: '0.65rem 1.5rem',
              backgroundColor: '#2563eb',
              color: '#ffffff',
              border: 'none',
              borderRadius: '8px',
              fontSize: '0.875rem',
              fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              boxShadow: '0 4px 6px -1px rgba(37, 99, 235, 0.3)',
            }}
          >
            {loading ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                <span>Processing...</span>
              </>
            ) : (
              <>
                <CheckCircle2 size={16} />
                <span>Accept Introduction</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
