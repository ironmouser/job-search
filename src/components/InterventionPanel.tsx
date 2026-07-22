'use client';

import { useState } from 'react';

interface InterventionPanelProps {
  interventionId: string;
  reason: string;
  description: string;
  screenshotUrl?: string | null;
  pageUrl?: string | null;
  onResolved: () => void;
}

const REASON_LABELS: Record<string, string> = {
  captcha:              '🔐 CAPTCHA Required',
  mfa_required:         '📱 Two-Factor Authentication',
  unknown_question:     '❓ Unknown Question',
  unexpected_page:      '⚠ Unexpected Page',
  resume_rejected:      '📄 Resume Rejected',
  attachment_missing:   '📎 Attachment Missing',
  login_required:       '🔑 Login Required',
  assessment_required:  '📝 Assessment Required',
};

export function InterventionPanel({
  interventionId,
  reason,
  description,
  screenshotUrl,
  pageUrl,
  onResolved,
}: InterventionPanelProps) {
  const [resolving, setResolving] = useState(false);
  const [resolution, setResolution] = useState<'completed' | 'skipped' | 'cancelled' | null>(null);

  async function resolve(res: 'completed' | 'skipped' | 'cancelled') {
    setResolving(true);
    setResolution(res);
    try {
      await fetch(`/api/auto-apply/interventions/${interventionId}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resolution: res }),
      });
      onResolved();
    } finally {
      setResolving(false);
    }
  }

  return (
    <div
      style={{
        background: 'rgba(251, 191, 36, 0.08)',
        border: '1px solid rgba(251, 191, 36, 0.4)',
        borderRadius: '0.75rem',
        padding: '1rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.75rem',
      }}
      id={`intervention-panel-${interventionId}`}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <span style={{ fontSize: '1rem' }}>⚠</span>
        <span style={{ fontWeight: 700, color: '#fbbf24' }}>
          {REASON_LABELS[reason] ?? reason}
        </span>
      </div>

      <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-primary)' }}>
        {description}
      </p>

      {pageUrl && (
        <a
          href={pageUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: 'var(--accent-primary)', fontSize: '0.8rem', textDecoration: 'underline' }}
        >
          Open page in browser →
        </a>
      )}

      {screenshotUrl && (
        <img
          src={screenshotUrl}
          alt="Screenshot of the blocked page"
          style={{ borderRadius: '0.5rem', border: '1px solid var(--border-color)', maxHeight: '200px', objectFit: 'contain' }}
        />
      )}

      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', background: 'var(--bg-secondary)', borderRadius: '0.5rem', padding: '0.6rem' }}>
        1. Open the link above and resolve the issue manually.<br />
        2. Come back here and click <strong>I Fixed It</strong> to resume automation.
      </div>

      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <button
          className="btn-primary"
          onClick={() => resolve('completed')}
          disabled={resolving}
          style={{ flex: 2 }}
          id={`intervention-resolve-${interventionId}`}
        >
          {resolving && resolution === 'completed' ? 'Resuming…' : '✓ I Fixed It — Resume'}
        </button>
        <button
          className="btn-outline"
          onClick={() => resolve('cancelled')}
          disabled={resolving}
          style={{ flex: 1 }}
          id={`intervention-cancel-${interventionId}`}
        >
          {resolving && resolution === 'cancelled' ? '…' : 'Cancel'}
        </button>
      </div>
    </div>
  );
}
