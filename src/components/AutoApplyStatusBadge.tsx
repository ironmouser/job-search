'use client';

import { AutoApplyStatus } from '@/lib/auto-apply/types';
import { AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';

interface AutoApplyStatusBadgeProps {
  status: AutoApplyStatus | string;
  failureReason?: string | null;
}

const STATUS_LABELS: Record<string, string> = {
  [AutoApplyStatus.QUEUED]:               'Queued',
  [AutoApplyStatus.PROCESSING]:           'Starting…',
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

export function AutoApplyStatusBadge({ status, failureReason }: AutoApplyStatusBadgeProps) {
  const label = STATUS_LABELS[status] ?? status;
  const badgeClass = `badge badge-${status}`;

  const renderIcon = () => {
    if (status === AutoApplyStatus.NEEDS_INTERVENTION) return <AlertTriangle size={12} />;
    if (status === AutoApplyStatus.APPLIED || status === AutoApplyStatus.SIMULATED) return <CheckCircle2 size={12} />;
    if (status === AutoApplyStatus.FAILED) return <XCircle size={12} />;
    return null;
  };

  return (
    <span
      className={badgeClass}
      title={failureReason ?? undefined}
      style={{ cursor: failureReason ? 'help' : 'default', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}
    >
      {renderIcon()}
      {label}
    </span>
  );
}
