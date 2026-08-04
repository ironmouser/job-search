'use client';

import React from 'react';
import { createPortal } from 'react-dom';

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

  const modal = (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0, 0, 0, 0.6)',
      }}
    >
      <div
        style={{
          background: '#ffffff',
          borderRadius: '16px',
          padding: '32px',
          maxWidth: '460px',
          width: '90%',
          boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
          textAlign: 'center',
        }}
      >
        <div style={{ fontSize: '2rem', marginBottom: '12px' }}>🌍</div>
        <h2
          style={{
            margin: '0 0 12px',
            fontSize: '1.25rem',
            fontWeight: 700,
            color: '#111827',
          }}
        >
          Focus on U.S. Jobs?
        </h2>
        <p
          style={{
            margin: '0 0 24px',
            fontSize: '0.95rem',
            color: '#6b7280',
            lineHeight: 1.6,
          }}
        >
          We found{' '}
          <strong style={{ color: '#111827' }}>
            {intlJobCount} international {intlJobCount === 1 ? 'job' : 'jobs'}
          </strong>{' '}
          in your pipeline. Would you like to remove them and focus only on U.S.
          opportunities?
        </p>
        <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
          <button
            onClick={onKeepAll}
            style={{
              flex: 1,
              padding: '10px 16px',
              borderRadius: '8px',
              border: '1.5px solid #d1d5db',
              background: '#ffffff',
              color: '#374151',
              fontWeight: 600,
              fontSize: '0.9rem',
              cursor: 'pointer',
            }}
          >
            Keep All
          </button>
          <button
            onClick={handleUsOnly}
            style={{
              flex: 1,
              padding: '10px 16px',
              borderRadius: '8px',
              border: 'none',
              background: '#2563eb',
              color: '#ffffff',
              fontWeight: 600,
              fontSize: '0.9rem',
              cursor: 'pointer',
            }}
          >
            U.S. Only
          </button>
        </div>
      </div>
    </div>
  );

  if (typeof document === 'undefined') return null;
  return createPortal(modal, document.body);
}
