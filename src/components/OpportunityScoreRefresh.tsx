'use client';

import { useState } from 'react';
import { RefreshCw, AlertCircle, CheckCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';

interface OpportunityScoreRefreshProps {
  jobId: string;
}

export default function OpportunityScoreRefresh({ jobId }: OpportunityScoreRefreshProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleRefresh() {
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
          {success ? <CheckCircle size={26} /> : <RefreshCw size={26} className={loading ? 'animate-spin' : ''} />}
        </div>
      </div>

      <h3 style={{ fontSize: '1.1rem', marginBottom: '0.6rem' }}>No Opportunity Score Yet</h3>

      <p
        style={{
          color: 'var(--text-secondary)',
          fontSize: '0.88rem',
          lineHeight: 1.55,
          marginBottom: '1.5rem',
        }}
      >
        The AI didn't have enough information to score this job yet. Click below to try scoring it
        now using the latest job details.
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
        <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
        {loading ? 'Scoring…' : success ? 'Done!' : 'Retry Opportunity Score'}
      </button>
    </div>
  );
}
