import { useState } from 'react';
import { AutoApplyStatus } from '@/lib/auto-apply/types';
import { Bot, Square, Play } from 'lucide-react';

interface AutoApplyButtonProps {
  jobId: string;
  jobUrl: string; // Kept for prop compatibility though not used for detect anymore
  hasAssets: boolean;
  currentStatus?: AutoApplyStatus | string | null;
  onSessionStarted?: (sessionId: string) => void;
  onStartingChange?: (starting: boolean) => void;
}

const ACTIVE_STATUSES = new Set([
  AutoApplyStatus.QUEUED,
  AutoApplyStatus.PROCESSING,
  AutoApplyStatus.GENERATING_ASSETS,
  AutoApplyStatus.NAVIGATING_TO_ATS,
  AutoApplyStatus.DETECTING_ATS,
  AutoApplyStatus.PREPARING,
  AutoApplyStatus.APPLYING,
  AutoApplyStatus.VALIDATING,
  AutoApplyStatus.NEEDS_REVIEW,
  AutoApplyStatus.NEEDS_INTERVENTION,
  'queued',
  'processing',
  'generating_assets',
  'navigating_to_ats',
  'detecting_ats',
  'preparing',
  'applying',
  'validating',
  'needs_review',
  'needs_intervention',
]);

export function AutoApplyButton({
  jobId,
  hasAssets,
  currentStatus,
  onSessionStarted,
  onStartingChange,
}: AutoApplyButtonProps) {
  const [starting, setStarting] = useState(false);

  const isActive = currentStatus && ACTIVE_STATUSES.has(currentStatus as AutoApplyStatus);
  const isDisabled = !!isActive;

  async function handleStart() {
    setStarting(true);
    onStartingChange?.(true);
    try {
      const res = await fetch(`/api/auto-apply/${jobId}/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ simulationMode: false }),
      });
      const data = await res.json();
      if (res.ok) {
        onSessionStarted?.(data.sessionId);
      } else {
        alert(data.error ?? 'Failed to start Auto Apply');
      }
    } finally {
      setStarting(false);
      onStartingChange?.(false);
    }
  }

  async function handleCancel() {
    await fetch(`/api/auto-apply/${jobId}/cancel`, { method: 'POST' });
  }

  if (isActive) {
    return (
      <button
        className="btn-auto-apply"
        style={{ background: 'linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
        onClick={handleCancel}
        id={`auto-apply-cancel-${jobId}`}
      >
        <Square size={14} /> Cancel Auto Apply
      </button>
    );
  }

  return (
    <button
      className="btn-auto-apply"
      disabled={isDisabled || starting}
      onClick={handleStart}
      id={`auto-apply-btn-${jobId}`}
      title={!hasAssets ? '1-Click Auto Apply (Tailors resume & submits)' : '1-Click Auto Apply'}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.55rem',
        padding: '0.7rem 1.35rem',
        borderRadius: '8px',
        backgroundColor: '#a84a0c',
        color: '#ffffff',
        fontWeight: 600,
        fontSize: '0.9rem',
        border: 'none',
        cursor: isDisabled || starting ? 'not-allowed' : 'pointer',
        boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
        transition: 'background-color 0.2s',
      }}
    >
      {starting ? (
        <>
          <Bot size={18} /> {!hasAssets ? 'Auto-tailoring & Starting…' : 'Starting…'}
        </>
      ) : (
        <>
          <Bot size={18} /> 1-Click Auto Apply
        </>
      )}
    </button>
  );
}
