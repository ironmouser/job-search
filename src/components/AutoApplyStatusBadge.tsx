'use client';

import { AutoApplyStatus } from '@/lib/auto-apply/types';
import { formatFailureExplanation } from '@/lib/auto-apply/failure-helpers';
import { AlertTriangle, AlertOctagon, CheckCircle2, XCircle, Loader2 } from 'lucide-react';

interface AutoApplyStatusBadgeProps {
  status: AutoApplyStatus | string;
  failureReason?: string | null;
  failureDetails?: string | null;
}

const RUNNING_STATUSES = new Set([
  AutoApplyStatus.QUEUED,
  AutoApplyStatus.PROCESSING,
  AutoApplyStatus.NAVIGATING_TO_ATS,
  AutoApplyStatus.DETECTING_ATS,
  AutoApplyStatus.PREPARING,
  AutoApplyStatus.APPLYING,
  AutoApplyStatus.VALIDATING,
]);

const STATUS_LABELS: Record<string, string> = {
  [AutoApplyStatus.QUEUED]:               'Queued',
  [AutoApplyStatus.PROCESSING]:           'Starting…',
  [AutoApplyStatus.NAVIGATING_TO_ATS]:    'Navigating…',
  [AutoApplyStatus.DETECTING_ATS]:        'Detecting ATS…',
  [AutoApplyStatus.PREPARING]:            'Preparing…',
  [AutoApplyStatus.APPLYING]:             'Applying…',
  [AutoApplyStatus.VALIDATING]:           'Validating…',
  [AutoApplyStatus.NEEDS_INTERVENTION]:   'Needs Attention',
  [AutoApplyStatus.APPLIED]:              'Applied',
  [AutoApplyStatus.SIMULATED]:            'Simulated',
  [AutoApplyStatus.FAILED]:               'Failed',
  [AutoApplyStatus.CANCELLED]:            'Cancelled',
  [AutoApplyStatus.SKIPPED]:              'Skipped',
};

export function AutoApplyStatusBadge({ status, failureReason, failureDetails }: AutoApplyStatusBadgeProps) {
  const isJobClosed = failureReason === 'job_closed' || status === 'closed' || status === 'job_closed';
  const label = isJobClosed ? 'Job Closed' : (STATUS_LABELS[status] ?? status);
  const badgeClass = isJobClosed ? 'badge badge-closed' : `badge badge-${status}`;
  const humanExplanation = failureReason || failureDetails 
    ? formatFailureExplanation(failureReason, failureDetails) 
    : undefined;

  const isDestinationNotFound = failureReason === 'application_destination_not_found';

  // Override the label for destination-not-found skips so it reads as a distinct failure type
  const displayLabel = isJobClosed 
    ? 'Job Closed'
    : (status === AutoApplyStatus.SKIPPED && isDestinationNotFound)
      ? 'Destination Not Found'
      : label;

  const renderIcon = () => {
    if (isJobClosed) return <AlertOctagon size={12} />;
    if (RUNNING_STATUSES.has(status as AutoApplyStatus)) {
      return <Loader2 size={12} className="animate-spin" style={{ animation: 'spin 1s linear infinite' }} />;
    }
    if (status === AutoApplyStatus.NEEDS_INTERVENTION) return <AlertTriangle size={12} />;
    if (status === AutoApplyStatus.APPLIED || status === AutoApplyStatus.SIMULATED) return <CheckCircle2 size={12} />;
    if (status === AutoApplyStatus.FAILED) return <XCircle size={12} />;
    // Amber warning for destination-not-found skips
    if (status === AutoApplyStatus.SKIPPED && isDestinationNotFound) return <AlertTriangle size={12} />;
    return null;
  };

  return (
    <span
      className={badgeClass}
      title={humanExplanation}
      style={{ cursor: humanExplanation ? 'help' : 'default', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}
    >
      {renderIcon()}
      {displayLabel}
    </span>
  );
}
