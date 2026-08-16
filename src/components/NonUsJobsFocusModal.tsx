'use client';

import React from 'react';
import { X, Globe } from 'lucide-react';

interface NonUsJobsFocusModalProps {
  intlJobCount: number;
  onKeepAll: () => void;
  onUsOnly: (deletedIds: string[]) => void;
}

export default function NonUsJobsFocusModal({
  intlJobCount,
  onKeepAll,
  onUsOnly,
}: NonUsJobsFocusModalProps) {
  const handleUsOnly = async () => {
    try {
      const res = await fetch('/api/jobs/delete-non-us', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        onUsOnly(data.deletedIds ?? []);
      } else {
        onUsOnly([]);
      }
    } catch {
      onUsOnly([]);
    }
  };

  return (
    <div
      className="glass-card animate-fade-in"
      style={{
        background: 'var(--card)',
        color: 'var(--card-foreground)',
        border: '1px solid var(--border)',
        borderRadius: '12px',
        padding: '1rem 1.25rem',
        marginBottom: '1.25rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '1rem',
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.08)',
        position: 'relative',
        width: '100%',
        boxSizing: 'border-box',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flex: '1 1 300px' }}>
        <div
          style={{
            width: '36px',
            height: '36px',
            borderRadius: '8px',
            background: 'rgba(59, 130, 246, 0.12)',
            color: 'var(--accent-primary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <Globe size={20} />
        </div>
        <div>
          <div style={{ fontSize: '0.925rem', fontWeight: 600, color: 'var(--foreground)' }}>
            Focus on U.S. Jobs?
          </div>
          <div style={{ fontSize: '0.85rem', color: 'var(--muted-foreground)', marginTop: '2px' }}>
            Found{' '}
            <strong style={{ color: 'var(--foreground)' }}>
              {intlJobCount} international {intlJobCount === 1 ? 'job' : 'jobs'}
            </strong>{' '}
            in your results. Would you like to filter to U.S.-only roles?
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
        <button
          onClick={handleUsOnly}
          style={{
            padding: '6px 14px',
            borderRadius: '6px',
            border: 'none',
            background: 'var(--accent-primary)',
            color: '#ffffff',
            fontWeight: 600,
            fontSize: '0.85rem',
            cursor: 'pointer',
            transition: 'opacity 0.15s ease',
          }}
        >
          U.S. Only
        </button>
        <button
          onClick={onKeepAll}
          style={{
            padding: '6px 12px',
            borderRadius: '6px',
            border: '1px solid var(--border)',
            background: 'transparent',
            color: 'var(--muted-foreground)',
            fontWeight: 500,
            fontSize: '0.85rem',
            cursor: 'pointer',
          }}
        >
          Keep All
        </button>
        <button
          onClick={onKeepAll}
          title="Dismiss notice"
          aria-label="Dismiss notice"
          style={{
            background: 'transparent',
            border: 'none',
            color: 'var(--muted-foreground)',
            cursor: 'pointer',
            padding: '4px',
            borderRadius: '4px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}

