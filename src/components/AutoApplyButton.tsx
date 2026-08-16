import { useState } from 'react';
import { AutoApplyStatus } from '@/lib/auto-apply/types';
import { Bot, Square, Play } from 'lucide-react';

interface AutoApplyButtonProps {
  jobId: string;
  jobUrl: string; // Kept for prop compatibility though not used for detect anymore
  hasAssets: boolean;
  currentStatus?: AutoApplyStatus | string | null;
  onSessionStarted?: (sessionId: string) => void;
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
]);

export function AutoApplyButton({
  jobId,
  hasAssets,
  currentStatus,
  onSessionStarted,
}: AutoApplyButtonProps) {
  const [starting, setStarting] = useState(false);

  const isActive = currentStatus && ACTIVE_STATUSES.has(currentStatus as AutoApplyStatus);
  const isDisabled = !!isActive;

  async function handleStart() {
    setStarting(true);
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
      style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
    >
      {starting ? (
        !hasAssets ? 'Auto-tailoring & Starting…' : 'Starting…'
      ) : (
        <>
          <Bot size={16} /> 1-Click Auto Apply
          {!hasAssets && <span style={{ fontSize: '0.73rem', fontWeight: 500, color: 'rgba(255,255,255,0.7)', marginLeft: '0.2rem' }}>(auto-tailors resume)</span>}
        </>
      )}
    </button>
  );
}
