'use client';

import { useRouter } from 'next/navigation';
import { Sparkles, Zap, ArrowRight, Clock } from 'lucide-react';

interface TrialStatusBannerProps {
  trialEndsAt: Date | string | null;
  planTier: string;
  compact?: boolean;
}

/**
 * Shows one of three states:
 *   - First 24 hours: welcome message ("Pro features unlocked for 7 days")
 *   - Days 2–7: countdown ("3 days left of your Pro trial")
 *   - Trial expired + FREE: nothing (upgrade prompts shown at action moments instead)
 */
export default function TrialStatusBanner({ trialEndsAt, planTier, compact = false }: TrialStatusBannerProps) {
  // Paid users see nothing
  if (planTier === 'PRO') return null;

  if (!trialEndsAt) return null;

  const trialEnd = new Date(trialEndsAt);
  const now = new Date();

  // Trial expired
  if (trialEnd <= now) return null;

  const msRemaining = trialEnd.getTime() - now.getTime();
  const daysRemaining = Math.ceil(msRemaining / (1000 * 60 * 60 * 24));

  // Figure out if we're in the first 24 hours
  const trialStartApprox = trialEnd.getTime() - 7 * 24 * 60 * 60 * 1000;
  const hoursSinceStart = (now.getTime() - trialStartApprox) / (1000 * 60 * 60);
  const isWelcomeWindow = hoursSinceStart < 24;

  return (
    <div
      style={{
        marginBottom: compact ? 0 : '2rem',
        padding: compact ? '0.75rem 1.25rem' : '1.25rem 1.75rem',
        background: isWelcomeWindow
          ? 'linear-gradient(135deg, rgba(16, 185, 129, 0.12) 0%, rgba(54, 149, 227, 0.12) 100%)'
          : 'linear-gradient(135deg, rgba(38, 99, 235, 0.1) 0%, rgba(168, 85, 247, 0.1) 100%)',
        border: isWelcomeWindow
          ? '1px solid rgba(16, 185, 129, 0.35)'
          : '1px solid rgba(168, 85, 247, 0.3)',
        borderRadius: '12px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: compact ? '0.75rem' : '1rem',
        animation: 'fadeIn 0.4s ease',
        width: '100%',
        maxWidth: '1050px'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flex: 1, minWidth: '240px' }}>
        <div
          style={{
            width: '38px',
            height: '38px',
            borderRadius: '50%',
            background: isWelcomeWindow
              ? 'linear-gradient(135deg, #10b981, #3695e3)'
              : 'linear-gradient(135deg, #3b82f6, #a855f7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          {isWelcomeWindow
            ? <Sparkles size={18} color="#fff" />
            : <Clock size={18} color="#fff" />
          }
        </div>
        <div>
          {isWelcomeWindow ? (
            <>
              <p style={{ margin: 0, fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)' }}>
                Welcome! Pro features are unlocked for your first 7 days.
              </p>
              <p style={{ margin: '0.15rem 0 0', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                Use unlimited scoring, resume tailoring, cover letters, Q&amp;A, and all job sources. No credit card needed.
              </p>
            </>
          ) : (
            <>
              <p style={{ margin: 0, fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)' }}>
                {daysRemaining} day{daysRemaining === 1 ? '' : 's'} left of your Pro trial.
              </p>
              <p style={{ margin: '0.15rem 0 0', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                Upgrade before your trial ends to keep unlimited access.
              </p>
            </>
          )}
        </div>
      </div>

      <UpgradeButton />
    </div>
  );
}

function UpgradeButton() {
  const router = useRouter();
  return (
    <button
      onClick={() => router.push('/upgrade')}
      className="btn-primary"
      style={{
        padding: '0.6rem 1.25rem',
        fontSize: '0.875rem',
        fontWeight: 600,
        whiteSpace: 'nowrap',
        display: 'flex',
        alignItems: 'center',
        gap: '0.4rem',
        boxShadow: '0 4px 14px rgba(168, 85, 247, 0.3)',
      }}
    >
      <Zap size={14} fill="currentColor" />
      Upgrade to Pro
      <ArrowRight size={14} />
    </button>
  );
}
