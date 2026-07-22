'use client';

interface AutoApplyConfidenceBadgeProps {
  confidence: number;
  showLabel?: boolean;
}

export function AutoApplyConfidenceBadge({ confidence, showLabel = false }: AutoApplyConfidenceBadgeProps) {
  const tier = confidence >= 80 ? 'high' : confidence >= 60 ? 'medium' : 'low';
  const icon = confidence >= 80 ? '✓' : confidence >= 60 ? '~' : '!';

  return (
    <span
      className={`confidence-badge confidence-badge-${tier}`}
      title={`Automation confidence: ${confidence}%`}
    >
      {icon} {confidence}%{showLabel && ` confidence`}
    </span>
  );
}
