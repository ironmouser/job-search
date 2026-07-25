'use client';

import { useState } from 'react';
import { AlertTriangle, Check, ShieldAlert, Smartphone, HelpCircle, FileText, Paperclip, Key, ClipboardList, ExternalLink } from 'lucide-react';

interface InterventionPanelProps {
  interventionId: string;
  reason: string;
  description: string;
  screenshotUrl?: string | null;
  pageUrl?: string | null;
  onResolved: () => void;
}

const REASON_LABELS: Record<string, string> = {
  captcha:              'CAPTCHA Verification Required',
  mfa_required:         'Two-Factor Authentication Required',
  unknown_question:     'Application Question Required',
  unexpected_page:      'Unsupported ATS or Custom Page Layout',
  resume_rejected:      'Resume Format Rejected by ATS',
  attachment_missing:   'Required Attachment Missing',
  login_required:       'Account Login Required',
  assessment_required:  'Candidate Assessment Required',
};

function getReasonIcon(reason: string, isUnsupportedOrFatal: boolean) {
  if (isUnsupportedOrFatal) return <AlertTriangle size={16} color="#f97316" />;
  switch (reason) {
    case 'captcha': return <ShieldAlert size={16} color="#fbbf24" />;
    case 'mfa_required': return <Smartphone size={16} color="#fbbf24" />;
    case 'unknown_question': return <HelpCircle size={16} color="#fbbf24" />;
    case 'resume_rejected': return <FileText size={16} color="#fbbf24" />;
    case 'attachment_missing': return <Paperclip size={16} color="#fbbf24" />;
    case 'login_required': return <Key size={16} color="#fbbf24" />;
    case 'assessment_required': return <ClipboardList size={16} color="#fbbf24" />;
    default: return <AlertTriangle size={16} color="#fbbf24" />;
  }
}

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

  const isUnsupportedOrFatal =
    reason === 'unexpected_page' ||
    reason === 'resume_rejected' ||
    reason === 'assessment_required' ||
    description.toLowerCase().includes('not currently supported') ||
    description.toLowerCase().includes('apply manually') ||
    description.toLowerCase().includes('cannot automate');

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

  function handleManualContinue() {
    if (pageUrl) {
      window.open(pageUrl, '_blank', 'noopener,noreferrer');
    }
    resolve('skipped');
  }

  const badgeColor = isUnsupportedOrFatal ? '#f97316' : '#fbbf24';
  const borderColor = isUnsupportedOrFatal ? 'rgba(249, 115, 22, 0.4)' : 'rgba(251, 191, 36, 0.4)';
  const bgGradient = isUnsupportedOrFatal ? 'rgba(249, 115, 22, 0.08)' : 'rgba(251, 191, 36, 0.08)';

  return (
    <div
      style={{
        background: bgGradient,
        border: `1px solid ${borderColor}`,
        borderRadius: '0.75rem',
        padding: '1.25rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.85rem',
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.05)',
      }}
      id={`intervention-panel-${interventionId}`}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        {getReasonIcon(reason, isUnsupportedOrFatal)}
        <span style={{ fontWeight: 700, color: badgeColor, fontSize: '0.95rem' }}>
          {REASON_LABELS[reason] ?? reason}
        </span>
      </div>

      <p style={{ margin: 0, fontSize: '0.88rem', color: 'var(--text-primary)', lineHeight: 1.5 }}>
        {description}
      </p>

      {screenshotUrl && (
        <img
          src={screenshotUrl}
          alt="Screenshot of the job application screen"
          style={{ borderRadius: '0.5rem', border: '1px solid var(--border-color)', maxHeight: '200px', objectFit: 'contain' }}
        />
      )}

      {isUnsupportedOrFatal ? (
        <>
          <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', background: 'var(--bg-secondary)', borderRadius: '0.5rem', padding: '0.85rem', borderLeft: '3px solid #f97316', lineHeight: 1.5 }}>
            <strong style={{ color: 'var(--text-primary)' }}>Why automation paused:</strong> Automated background runners cannot autonomously bypass complex assessments, unmapped application questionnaires, or unrecognized tracking platforms. Because automated workers run in isolated cloud sessions, manual actions taken in your desktop browser do not transfer back to the automated worker.
            <br /><br />
            <strong style={{ color: 'var(--text-primary)' }}>What to do next:</strong> Click below to open the job application in your browser and complete your submission manually.
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button
              className="btn-primary"
              onClick={handleManualContinue}
              disabled={resolving}
              style={{ flex: 2, minWidth: '200px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '0.45rem', padding: '0.6rem 1rem' }}
              id={`intervention-manual-continue-${interventionId}`}
            >
              {resolving && resolution === 'skipped' ? 'Switching to Manual…' : <><ExternalLink size={15} /> Open Job & Continue Manually</>}
            </button>
            <button
              className="btn-outline"
              onClick={() => resolve('cancelled')}
              disabled={resolving}
              style={{ flex: 1, minWidth: '120px', padding: '0.6rem 1rem' }}
              id={`intervention-cancel-${interventionId}`}
            >
              {resolving && resolution === 'cancelled' ? '…' : 'Cancel Auto Apply'}
            </button>
          </div>
        </>
      ) : (
        <>
          <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', background: 'var(--bg-secondary)', borderRadius: '0.5rem', padding: '0.85rem', borderLeft: '3px solid #fbbf24', lineHeight: 1.5 }}>
            <strong style={{ color: 'var(--text-primary)' }}>Verification Required:</strong> The automated process paused because the platform requires additional verification or credentials.
            <br /><br />
            1. If you are using an active local session or extension, complete the verification directly on the job page.<br />
            2. Once verified, click <strong>Resume Automation</strong> below so the worker can retry this step.<br />
            3. If the step cannot be completed remotely, click <strong>Continue Manually</strong> to finish applying yourself.
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button
              className="btn-primary"
              onClick={() => resolve('completed')}
              disabled={resolving}
              style={{ flex: 2, minWidth: '160px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', padding: '0.6rem 1rem' }}
              id={`intervention-resolve-${interventionId}`}
            >
              {resolving && resolution === 'completed' ? 'Resuming…' : <><Check size={15} /> Resume Automation</>}
            </button>
            {pageUrl && (
              <button
                className="btn-outline"
                onClick={handleManualContinue}
                disabled={resolving}
                style={{ flex: 1, minWidth: '150px', padding: '0.6rem 1rem', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '0.35rem' }}
                title="Stop automated execution and apply directly in your browser"
                id={`intervention-switch-manual-${interventionId}`}
              >
                {resolving && resolution === 'skipped' ? 'Switching…' : <><ExternalLink size={14} /> Continue Manually</>}
              </button>
            )}
            <button
              className="btn-outline"
              onClick={() => resolve('cancelled')}
              disabled={resolving}
              style={{ flex: 1, minWidth: '100px', padding: '0.6rem 1rem', borderColor: 'rgba(239, 68, 68, 0.4)', color: '#ef4444' }}
              id={`intervention-cancel-${interventionId}`}
            >
              {resolving && resolution === 'cancelled' ? '…' : 'Cancel'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
