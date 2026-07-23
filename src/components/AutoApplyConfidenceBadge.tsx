'use client';

import { CheckCircle2, Minus, AlertTriangle } from 'lucide-react';

interface AutoApplyConfidenceBadgeProps {
  confidence: number;
  showLabel?: boolean;
}

export function AutoApplyConfidenceBadge({ confidence, showLabel = false }: AutoApplyConfidenceBadgeProps) {
  const tier = confidence >= 80 ? 'high' : confidence >= 60 ? 'medium' : 'low';

  const renderIcon = () => {
    if (confidence >= 80) return <CheckCircle2 size={12} />;
    if (confidence >= 60) return <Minus size={12} />;
    return <AlertTriangle size={12} />;
  };

  return (
    <span
      className={`confidence-badge confidence-badge-${tier}`}
      title={`Automation confidence: ${confidence}%`}
      style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}
    >
      {renderIcon()} {confidence}%{showLabel && ` confidence`}
    </span>
  );
}
