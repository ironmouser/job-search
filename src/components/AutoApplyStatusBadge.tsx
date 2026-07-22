'use client';

import { AutoApplyStatus } from '@/lib/auto-apply/types';

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
  [AutoApplyStatus.NEEDS_INTERVENTION]:   '⚠ Needs Attention',
  [AutoApplyStatus.APPLIED]:              '✓ Applied',
  [AutoApplyStatus.SIMULATED]:            '✓ Simulated',
  [AutoApplyStatus.FAILED]:               '✗ Failed',
  [AutoApplyStatus.CANCELLED]:            'Cancelled',
  [AutoApplyStatus.SKIPPED]:              'Skipped',
};

export function AutoApplyStatusBadge({ status, failureReason }: AutoApplyStatusBadgeProps) {
  const label = STATUS_LABELS[status] ?? status;
  const badgeClass = `badge badge-${status}`;

  return (
    <span
      className={badgeClass}
      title={failureReason ?? undefined}
      style={{ cursor: failureReason ? 'help' : 'default' }}
    >
      {label}
    </span>
  );
}
