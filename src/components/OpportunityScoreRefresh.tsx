'use client';

import { useState } from 'react';
import { RefreshCw, AlertCircle, CheckCircle, FileText, Sparkles } from 'lucide-react';
import { useRouter } from 'next/navigation';
import JitResumeUploadModal from '@/components/common/JitResumeUploadModal';

interface OpportunityScoreRefreshProps {
  jobId: string;
  hasBaseResume?: boolean;
}

export default function OpportunityScoreRefresh({ jobId, hasBaseResume = true }: OpportunityScoreRefreshProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isJitModalOpen, setIsJitModalOpen] = useState(false);

  async function handleRefresh() {
    if (!hasBaseResume) {
      setIsJitModalOpen(true);
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(false);

    try {
      const res = await fetch('/api/score', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (data.error?.toLowerCase().includes('resume')) {
          setIsJitModalOpen(true);
        }
        setError(data.error || 'Scoring failed. Please try again.');
        setLoading(false);
        return;
      }

      // Score generated — refresh the page so the sidebar renders with the new score
      setSuccess(true);
      setTimeout(() => {
        router.refresh();
      }, 600);
    } catch {
      setError('Network error. Please try again.');
      setLoading(false);
    }
  }

  return (
    <>
      <div
        className="glass-card"
        style={{ textAlign: 'center', padding: '2rem' }}
      >
        {/* Icon */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1rem' }}>
          <div
            style={{
              width: '52px',
              height: '52px',
              borderRadius: '50%',
              background: success
                ? 'rgba(var(--success-rgb, 100, 220, 130), 0.15)'
                : 'rgba(102, 252, 241, 0.08)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: success ? 'var(--success, #64DC82)' : 'var(--accent-primary)',
              transition: 'background 0.3s',
            }}
          >
            {success ? <CheckCircle size={26} /> : hasBaseResume ? <RefreshCw size={26} className={loading ? 'animate-spin' : ''} /> : <Sparkles size={26} />}
          </div>
        </div>

        <h3 style={{ fontSize: '1.1rem', marginBottom: '0.6rem' }}>
          {hasBaseResume ? 'No Opportunity Score Yet' : 'AI Opportunity Fit Pending'}
        </h3>

        <p
          style={{
            color: 'var(--text-secondary)',
            fontSize: '0.88rem',
            lineHeight: 1.55,
            marginBottom: '1.5rem',
          }}
        >
          {hasBaseResume 
            ? "The AI didn't have enough information to score this job yet. Click below to evaluate it now using the latest job details."
            : "Upload your base resume to calculate personalized match criteria breakdown and AI insights for this opportunity."}
        </p>

        {error && (
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '0.5rem',
              padding: '0.75rem 1rem',
              background: 'rgba(255, 80, 80, 0.08)',
              border: '1px solid rgba(255, 80, 80, 0.25)',
              borderRadius: '8px',
              marginBottom: '1rem',
              textAlign: 'left',
            }}
          >
            <AlertCircle size={14} style={{ color: 'var(--danger)', flexShrink: 0, marginTop: '2px' }} />
            <span style={{ fontSize: '0.83rem', color: 'var(--danger)', lineHeight: 1.45 }}>{error}</span>
          </div>
        )}

        <button
          onClick={handleRefresh}
          disabled={loading || success}
          className="btn-primary"
          style={{
            width: '100%',
            justifyContent: 'center',
            gap: '0.5rem',
            opacity: loading || success ? 0.7 : 1,
            cursor: loading || success ? 'not-allowed' : 'pointer',
          }}
        >
          {hasBaseResume ? (
            <>
              <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
              {loading ? 'Scoring…' : success ? 'Done!' : 'Calculate Opportunity Score'}
            </>
          ) : (
            <>
              <FileText size={15} />
              Upload Resume to Score
            </>
          )}
        </button>
      </div>

      <JitResumeUploadModal
        isOpen={isJitModalOpen}
        onClose={() => setIsJitModalOpen(false)}
        onSuccess={() => {
          setIsJitModalOpen(false);
          router.refresh();
        }}
        title="Upload Resume to Score Job"
        description="Add your base resume template to calculate personalized match breakdown and evaluate fit for this role."
      />
    </>
  );
}
