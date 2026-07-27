'use client';

import { useState, useEffect, useRef } from 'react';
import { Sparkles, X } from 'lucide-react';

/**
 * A contextual tooltip that appears next to existing FeedbackButtons.
 * Used for Nudge #2 (job detail header) and Nudge #3 (dashboard).
 * 
 * Renders as a floating callout with a pointing arrow, positioned
 * relative to its parent container.
 */
export default function FeedbackNudgeTooltip({
  variant,
  onDismiss,
  onFeedbackGiven,
}: {
  /** Which nudge instance this is — affects the copy */
  variant: 'job-detail' | 'dashboard';
  /** Called when user dismisses the tooltip */
  onDismiss: () => void;
  /** Called externally when user gives feedback (auto-dismisses) */
  onFeedbackGiven?: () => void;
}) {
  const [visible, setVisible] = useState(false);
  const tooltipRef = useRef<HTMLDivElement>(null);

  // Animate in after a brief delay
  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), 300);
    return () => clearTimeout(timer);
  }, []);

  // Auto-dismiss after 15 seconds
  useEffect(() => {
    const timer = setTimeout(() => {
      handleDismiss();
    }, 15000);
    return () => clearTimeout(timer);
  }, []);

  const handleDismiss = () => {
    setVisible(false);
    // Wait for fade-out animation
    setTimeout(() => onDismiss(), 200);
  };

  const message = variant === 'job-detail'
    ? 'Rating roles trains AI scoring to deliver more accurate matches.'
    : 'Feedback improves AI scoring precision for your search results.';

  return (
    <div
      ref={tooltipRef}
      style={{
        position: 'absolute',
        bottom: 'calc(100% + 10px)',
        left: '50%',
        transform: `translateX(-50%) ${visible ? 'translateY(0)' : 'translateY(6px)'}`,
        width: 'max-content',
        maxWidth: '280px',
        padding: '0.75rem 1rem',
        borderRadius: '10px',
        background: 'var(--bg-surface, #1a1a2e)',
        border: '1px solid rgba(102, 252, 241, 0.3)',
        boxShadow: '0 8px 24px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(102, 252, 241, 0.1)',
        zIndex: 100,
        opacity: visible ? 1 : 0,
        transition: 'opacity 0.2s ease, transform 0.2s ease',
        pointerEvents: visible ? 'auto' : 'none',
      }}
    >
      {/* Arrow pointing down */}
      <div style={{
        position: 'absolute',
        bottom: '-6px',
        left: '50%',
        transform: 'translateX(-50%) rotate(45deg)',
        width: '12px',
        height: '12px',
        background: 'var(--bg-surface, #1a1a2e)',
        borderRight: '1px solid rgba(102, 252, 241, 0.3)',
        borderBottom: '1px solid rgba(102, 252, 241, 0.3)',
      }} />

      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
        <Sparkles
          size={16}
          color="var(--accent-primary)"
          style={{ flexShrink: 0, marginTop: '2px' }}
        />
        <p style={{
          margin: 0,
          fontSize: '0.85rem',
          lineHeight: 1.4,
          color: 'var(--text-primary)',
          fontWeight: 500,
        }}>
          {message}
        </p>
        <button
          onClick={handleDismiss}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--text-secondary)',
            cursor: 'pointer',
            padding: '0',
            flexShrink: 0,
            opacity: 0.6,
            transition: 'opacity 0.15s',
            marginTop: '1px',
          }}
          onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
          onMouseLeave={e => (e.currentTarget.style.opacity = '0.6')}
          title="Dismiss"
        >
          <X size={14} />
        </button>
      </div>

      <button
        onClick={handleDismiss}
        style={{
          display: 'block',
          marginTop: '0.5rem',
          marginLeft: '1.5rem',
          background: 'none',
          border: 'none',
          color: 'var(--accent-primary)',
          cursor: 'pointer',
          fontSize: '0.8rem',
          fontWeight: 600,
          padding: 0,
        }}
      >
        Got it
      </button>
    </div>
  );
}
