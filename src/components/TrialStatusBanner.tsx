'use client';

import { useState, useEffect } from 'react';
import { Sparkles, Zap, ArrowRight, Clock, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface TrialStatusBannerProps {
  trialEndsAt: Date | string | null;
  planTier: string;
  compact?: boolean;
}

/**
 * Shows contextual plan/trial status for non-PRO users:
 *   - First 24 hours of trial: welcome message ("Pro features unlocked for 7 days")
 *   - Days 2–7 of trial: countdown ("X days left of your Pro trial")
 *   - Free tier (no active trial / expired): dismissible Starter plan notice with Upgrade CTA
 */
export default function TrialStatusBanner({ trialEndsAt, planTier, compact = false }: TrialStatusBannerProps) {
  const [freeBannerDismissed, setFreeBannerDismissed] = useState(true);

  useEffect(() => {
    let dismissed = false;
    try {
      dismissed = localStorage.getItem('jahq_free_tier_banner_dismissed') === 'true';
    } catch {
      dismissed = false;
    }
    const timer = setTimeout(() => setFreeBannerDismissed(dismissed), 0);
    return () => clearTimeout(timer);
  }, []);

  // Paid users see nothing
  if (planTier === 'PRO') return null;

  const now = new Date();
  const trialEnd = trialEndsAt ? new Date(trialEndsAt) : null;
  const hasActiveTrial = Boolean(trialEnd && trialEnd > now);

  if (!hasActiveTrial) {
    if (freeBannerDismissed) return null;

    return (
      <div
        role="region"
        aria-label="Free tier plan notice"
        style={{
          padding: compact ? '0.85rem 1.15rem' : '1rem 1.25rem',
          background: 'var(--card)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg, 12px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '0.875rem',
          width: '100%',
          boxSizing: 'border-box',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flex: '1 1 240px', minWidth: 0 }}>
          <div
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '10px',
              background: 'rgba(0, 112, 243, 0.12)',
              color: 'var(--primary, #0070f3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <Zap size={18} aria-hidden="true" />
          </div>
          <div style={{ minWidth: 0 }}>
            <p style={{ margin: 0, fontWeight: 600, fontSize: '0.9375rem', color: 'var(--foreground)' }}>
              You&apos;re on the Starter (Free) Plan
            </p>
            <p style={{ margin: '0.15rem 0 0', fontSize: '0.875rem', color: 'var(--muted-foreground)', lineHeight: 1.45 }}>
              Upgrade to Pro for unlimited AI match scoring, tailored packets, and inbox job sync.
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
          <Button
            variant="primary"
            size="sm"
            onClick={() => {
              window.location.href = '/api/stripe/checkout';
            }}
          >
            <Zap size={14} fill="currentColor" aria-hidden="true" />
            <span>Upgrade to Pro</span>
            <ArrowRight size={14} aria-hidden="true" />
          </Button>
          <button
            type="button"
            onClick={() => {
              setFreeBannerDismissed(true);
              try {
                localStorage.setItem('jahq_free_tier_banner_dismissed', 'true');
              } catch {}
            }}
            aria-label="Dismiss free tier notice"
            title="Dismiss"
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--muted-foreground)',
              cursor: 'pointer',
              padding: '0.375rem',
              borderRadius: '6px',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              minWidth: '32px',
              minHeight: '32px',
            }}
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>
      </div>
    );
  }

  const msRemaining = trialEnd!.getTime() - now.getTime();
  const daysRemaining = Math.ceil(msRemaining / (1000 * 60 * 60 * 24));
  const trialStartApprox = trialEnd!.getTime() - 7 * 24 * 60 * 60 * 1000;
  const hoursSinceStart = (now.getTime() - trialStartApprox) / (1000 * 60 * 60);
  const isWelcomeWindow = hoursSinceStart < 24;

  return (
    <div
      role="region"
      aria-label="Pro trial status"
      style={{
        padding: compact ? '0.85rem 1.15rem' : '1rem 1.25rem',
        background: isWelcomeWindow
          ? 'rgba(16, 185, 129, 0.08)'
          : 'rgba(0, 112, 243, 0.08)',
        border: isWelcomeWindow
          ? '1px solid rgba(16, 185, 129, 0.28)'
          : '1px solid rgba(0, 112, 243, 0.25)',
        borderRadius: 'var(--radius-lg, 12px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '0.875rem',
        width: '100%',
        boxSizing: 'border-box',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flex: '1 1 240px', minWidth: 0 }}>
        <div
          style={{
            width: '36px',
            height: '36px',
            borderRadius: '10px',
            background: isWelcomeWindow ? '#10b981' : 'var(--primary, #0070f3)',
            color: '#ffffff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          {isWelcomeWindow ? <Sparkles size={18} aria-hidden="true" /> : <Clock size={18} aria-hidden="true" />}
        </div>
        <div style={{ minWidth: 0 }}>
          {isWelcomeWindow ? (
            <>
              <p style={{ margin: 0, fontWeight: 600, fontSize: '0.9375rem', color: 'var(--foreground)' }}>
                Welcome! Pro features are unlocked for your first 7 days.
              </p>
              <p style={{ margin: '0.15rem 0 0', fontSize: '0.875rem', color: 'var(--muted-foreground)', lineHeight: 1.45 }}>
                Use unlimited scoring, resume tailoring, cover letters, Q&amp;A, and all job sources.
              </p>
            </>
          ) : (
            <>
              <p style={{ margin: 0, fontWeight: 600, fontSize: '0.9375rem', color: 'var(--foreground)' }}>
                {daysRemaining} day{daysRemaining === 1 ? '' : 's'} left of your Pro trial
              </p>
              <p style={{ margin: '0.15rem 0 0', fontSize: '0.875rem', color: 'var(--muted-foreground)', lineHeight: 1.45 }}>
                Upgrade before your trial ends to keep unlimited access.
              </p>
            </>
          )}
        </div>
      </div>

      <Button
        variant="primary"
        size="sm"
        onClick={() => {
          window.location.href = '/api/stripe/checkout';
        }}
      >
        <Zap size={14} fill="currentColor" aria-hidden="true" />
        <span>Upgrade to Pro</span>
        <ArrowRight size={14} aria-hidden="true" />
      </Button>
    </div>
  );
}
