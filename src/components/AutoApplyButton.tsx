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
  AutoApplyStatus.NAVIGATING_TO_ATS,
  AutoApplyStatus.DETECTING_ATS,
  AutoApplyStatus.PREPARING,
  AutoApplyStatus.APPLYING,
  AutoApplyStatus.VALIDATING,
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
  const isDisabled = !hasAssets || !!isActive;

  async function handleStart() {
    setStarting(true);
    try {
      const res = await fetch(`/api/auto-apply/${jobId}/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Always run live mode (simulationMode is being phased out)
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
      title={!hasAssets ? 'Generate resume and cover letter first' : 'Start Auto Apply'}
      style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
    >
      {starting ? (
        'Starting…'
      ) : (
        <>
          <Bot size={16} /> Auto Apply
          {!hasAssets && <span style={{ fontSize: '0.75rem', fontWeight: 500, color: '#64748b', marginLeft: '0.25rem' }}>(generate assets first)</span>}
        </>
      )}
    </button>
  );
}
