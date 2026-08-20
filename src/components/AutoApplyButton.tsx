import { useState, useEffect } from 'react';
import { AutoApplyStatus } from '@/lib/auto-apply/types';
import { Bot, Square, Zap } from 'lucide-react';
import JitResumeUploadModal from '@/components/common/JitResumeUploadModal';
import { AutoApplyQuota } from './AutoApplyPanel';

interface AutoApplyButtonProps {
  jobId: string;
  jobUrl: string; // Kept for prop compatibility though not used for detect anymore
  hasAssets: boolean;
  hasResume?: boolean;
  currentStatus?: AutoApplyStatus | string | null;
  /** If true, the job URL is an aggregator link — button shows a resolving state while start API pre-resolves */
  isAggregatorJob?: boolean;
  quota?: AutoApplyQuota | null;
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
  jobUrl,
  hasAssets,
  hasResume,
  currentStatus,
  isAggregatorJob,
  quota,
  onSessionStarted,
  onStartingChange,
}: AutoApplyButtonProps) {
  const [starting, setStarting] = useState(false);
  const [isJitResumeOpen, setIsJitResumeOpen] = useState(false);
  const [localHasResume, setLocalHasResume] = useState<boolean | undefined>(hasResume);

  useEffect(() => {
    setLocalHasResume(hasResume);
  }, [hasResume]);

  const isActive = currentStatus && ACTIVE_STATUSES.has(currentStatus as AutoApplyStatus);
  const isQuotaBlocked = quota ? !quota.canApply : false;
  const isDisabled = !!isActive || isQuotaBlocked;

  async function triggerAutoApplyStart() {
    setStarting(true);
    onStartingChange?.(true);
    try {
      const res = await fetch(`/api/auto-apply/${jobId}/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ simulationMode: false, applicationUrl: jobUrl || undefined }),
      });
      const data = await res.json();
      if (res.ok) {
        onSessionStarted?.(data.sessionId);
      } else {
        if (data.errorCode === 'MISSING_BASE_RESUME') {
          setLocalHasResume(false);
          setIsJitResumeOpen(true);
        } else {
          alert(data.error ?? 'Failed to start Auto Apply');
        }
      }
    } catch (err: any) {
      alert(err?.message ?? 'Failed to start Auto Apply');
    } finally {
      setStarting(false);
      onStartingChange?.(false);
    }
  }

  function handleStart() {
    if (localHasResume === false && !hasAssets) {
      setIsJitResumeOpen(true);
      return;
    }
    triggerAutoApplyStart();
  }

  const handleResumeUploadSuccess = () => {
    setLocalHasResume(true);
    setIsJitResumeOpen(false);
    // Automatically begin/resume the auto apply process
    setTimeout(() => {
      triggerAutoApplyStart();
    }, 100);
  };

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
    <>
      <button
        className="btn-auto-apply"
        disabled={isDisabled || starting}
        onClick={handleStart}
        id={`auto-apply-btn-${jobId}`}
        title={
          isQuotaBlocked
            ? quota?.blockedReason === 'DAILY_LIMIT_EXCEEDED'
              ? `Daily safety limit reached (${quota.dailyLimit}/${quota.dailyLimit}). Resets tonight at midnight UTC.`
              : quota?.blockedReason === 'MONTHLY_LIMIT_EXCEEDED'
              ? `Monthly allowance reached (${quota.monthlyLimit}/${quota.monthlyLimit}). Resets on ${new Date(quota.monthlyResetsAt).toLocaleDateString()}.`
              : 'Upgrade to Pro to unlock automated applications.'
            : !hasAssets
            ? '1-Click Auto Apply (Tailors resume & submits)'
            : '1-Click Auto Apply'
        }
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.55rem',
          padding: '0.7rem 1.35rem',
          borderRadius: '8px',
          backgroundColor: isQuotaBlocked ? '#64748b' : '#a84a0c',
          color: '#ffffff',
          fontWeight: 600,
          fontSize: '0.9rem',
          border: 'none',
          cursor: isDisabled || starting ? 'not-allowed' : 'pointer',
          boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
          transition: 'background-color 0.2s',
          opacity: isQuotaBlocked ? 0.85 : 1,
        }}
      >
        {starting ? (
          <>
            <Bot size={18} />
            {!hasAssets
              ? 'Auto-tailoring & Starting…'
              : isAggregatorJob
              ? 'Resolving apply link…'
              : 'Starting…'}
          </>
        ) : isQuotaBlocked ? (
          <>
            <Zap size={18} />
            {quota?.blockedReason === 'DAILY_LIMIT_EXCEEDED'
              ? 'Daily Limit Reached (0 left today)'
              : quota?.blockedReason === 'MONTHLY_LIMIT_EXCEEDED'
              ? 'Monthly Allowance Reached'
              : 'Upgrade to Pro to Auto Apply'}
          </>
        ) : (
          <>
            <Bot size={18} /> 1-Click Auto Apply
          </>
        )}
      </button>

      <JitResumeUploadModal
        isOpen={isJitResumeOpen}
        onClose={() => setIsJitResumeOpen(false)}
        onSuccess={handleResumeUploadSuccess}
        title="Upload Resume to Auto Apply"
        description="To use Auto Apply, please upload your base resume. We will automatically tailor your resume and cover letter and submit your application."
      />
    </>
  );
}
