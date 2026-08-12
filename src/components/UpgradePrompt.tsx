'use client';


import { Zap, ArrowRight, TrendingUp } from 'lucide-react';
import { createPortal } from 'react-dom';
import { useState, useEffect } from 'react';

interface UpgradePromptProps {
  /** How the prompt is displayed */
  variant?: 'inline' | 'modal';
  /** Personalized stats to show in the prompt */
  stats?: {
    resumesTailored?: number;
    jobsApplied?: number;
    jobsSynced?: number;
  };
  /** Which feature triggered this prompt */
  feature?: 'scoring' | 'generation' | 'autofill' | 'qa' | 'email-sync';
  onDismiss?: () => void;
}

function buildMessage(
  feature: UpgradePromptProps['feature'],
  stats?: UpgradePromptProps['stats']
): { headline: string; sub: string } {
  const hasStats =
    stats &&
    ((stats.resumesTailored && stats.resumesTailored > 0) ||
      (stats.jobsApplied && stats.jobsApplied > 0) ||
      (stats.jobsSynced && stats.jobsSynced > 0));

  if (hasStats) {
    const parts: string[] = [];
    if (stats!.resumesTailored && stats!.resumesTailored > 0) {
      parts.push(`tailored ${stats!.resumesTailored} resume${stats!.resumesTailored === 1 ? '' : 's'}`);
    }
    if (stats!.jobsApplied && stats!.jobsApplied > 0) {
      parts.push(`applied to ${stats!.jobsApplied} job${stats!.jobsApplied === 1 ? '' : 's'}`);
    } else if (stats!.jobsSynced && stats!.jobsSynced > 0) {
      parts.push(`synced ${stats!.jobsSynced} job${stats!.jobsSynced === 1 ? '' : 's'}`);
    }

    const statStr = parts.join(' and ');
    const actionLabel =
      feature === 'generation'
        ? 'continue unlimited tailoring'
        : feature === 'autofill'
        ? 'keep applying without limits'
        : feature === 'scoring'
        ? 'unlock unlimited match scoring'
        : feature === 'qa'
        ? 'unlock Q&A answers'
        : 'unlock all Pro features';

    return {
      headline: `You've already ${statStr}.`,
      sub: `Upgrade to Pro to ${actionLabel}.`,
    };
  }

  // Generic fallback
  const subMap: Record<string, string> = {
    scoring: 'Upgrade to Pro for unlimited AI Match Scoring.',
    generation: 'Upgrade to Pro for unlimited resume and cover letter generation.',
    autofill: 'Upgrade to Pro for unlimited Smart Applies.',
    qa: 'Upgrade to Pro to unlock Application Q&A answers.',
    'email-sync': 'Upgrade to Pro to sync job leads from your inbox.',
  };

  return {
    headline: 'Unlock Pro to keep going.',
    sub: subMap[feature ?? 'scoring'] ?? 'Upgrade to Pro for unlimited access.',
  };
}

/** Inline variant — renders in-place where limit was hit */
function InlineUpgradePrompt({ stats, feature, onDismiss }: UpgradePromptProps) {
  const { headline, sub } = buildMessage(feature, stats);

  return (
    <div
      style={{
        background: 'linear-gradient(135deg, rgba(38, 99, 235, 0.08) 0%, rgba(168, 85, 247, 0.08) 100%)',
        border: '1px solid rgba(168, 85, 247, 0.3)',
        borderRadius: '12px',
        padding: '1.25rem 1.5rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '1rem',
        flexWrap: 'wrap',
        marginTop: '0.75rem',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', flex: 1, minWidth: '220px' }}>
        <TrendingUp size={18} style={{ color: '#a855f7', flexShrink: 0, marginTop: '2px' }} />
        <div>
          <p style={{ margin: 0, fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-primary)' }}>{headline}</p>
          <p style={{ margin: '0.2rem 0 0', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>{sub}</p>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <button
          onClick={() => { window.location.href = '/api/stripe/checkout'; }}
          className="btn-primary"
          style={{
            padding: '0.5rem 1.1rem',
            fontSize: '0.85rem',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem',
            whiteSpace: 'nowrap',
            boxShadow: '0 4px 12px rgba(168, 85, 247, 0.3)',
          }}
        >
          <Zap size={14} fill="currentColor" />
          Upgrade to Pro
          <ArrowRight size={14} />
        </button>
        {onDismiss && (
          <button
            onClick={onDismiss}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontSize: '1.1rem',
              color: 'var(--text-secondary)',
              padding: '0.25rem',
              lineHeight: 1,
            }}
            aria-label="Dismiss"
          >
            ×
          </button>
        )}
      </div>
    </div>
  );
}

/** Modal variant — centered overlay via portal */
function ModalUpgradePrompt({ stats, feature, onDismiss }: UpgradePromptProps) {
  const { headline, sub } = buildMessage(feature, stats);
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  if (!mounted) return null;

  const modalContent = (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        background: 'rgba(0, 0, 0, 0.6)',
      }}
      onClick={onDismiss}
    >
      <div
        style={{
          background: 'var(--card)',
          color: 'var(--card-foreground)',
          border: '1px solid var(--border)',
          borderRadius: '20px',
          padding: '2.5rem',
          maxWidth: '480px',
          width: '90%',
          boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
          textAlign: 'center',
          position: 'relative',
        }}
        onClick={e => e.stopPropagation()}
      >
        {onDismiss && (
          <button
            onClick={onDismiss}
            style={{
              position: 'absolute',
              top: '1rem',
              right: '1rem',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontSize: '1.4rem',
              color: 'var(--text-secondary)',
              lineHeight: 1,
            }}
            aria-label="Close"
          >
            ×
          </button>
        )}
        <div
          style={{
            width: '56px',
            height: '56px',
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #3b82f6, #a855f7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 1.5rem',
          }}
        >
          <Zap size={26} color="#fff" fill="#fff" />
        </div>
        <h2 style={{ margin: '0 0 0.5rem', fontSize: '1.4rem', fontWeight: 700, color: 'var(--text-primary)' }}>
          {headline}
        </h2>
        <p style={{ margin: '0 0 2rem', fontSize: '0.95rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
          {sub}
        </p>
        <button
          onClick={() => { window.location.href = '/api/stripe/checkout'; }}
          className="btn-primary"
          style={{
            width: '100%',
            padding: '0.85rem',
            fontSize: '1rem',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.5rem',
            boxShadow: '0 6px 20px rgba(168, 85, 247, 0.4)',
          }}
        >
          <Zap size={16} fill="currentColor" />
          Upgrade to Pro
          <ArrowRight size={16} />
        </button>
        {onDismiss && (
          <button
            onClick={onDismiss}
            style={{
              marginTop: '0.75rem',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontSize: '0.85rem',
              color: 'var(--text-secondary)',
              textDecoration: 'underline',
            }}
          >
            Maybe later
          </button>
        )}
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}

export default function UpgradePrompt({ variant = 'inline', stats, feature, onDismiss }: UpgradePromptProps) {
  if (variant === 'modal') {
    return <ModalUpgradePrompt stats={stats} feature={feature} onDismiss={onDismiss} />;
  }
  return <InlineUpgradePrompt stats={stats} feature={feature} onDismiss={onDismiss} />;
}
