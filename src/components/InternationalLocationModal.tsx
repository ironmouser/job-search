'use client';

import React from 'react';
import { Globe, ArrowRight, X } from 'lucide-react';

interface InternationalLocationModalProps {
  isOpen: boolean;
  onClose: () => void;
  locationPreference?: string;
}

export default function InternationalLocationModal({
  isOpen,
  onClose,
  locationPreference,
}: InternationalLocationModalProps) {
  if (!isOpen) return null;

  const handleGoToSettings = () => {
    onClose();
    window.location.href = '/settings#active-scrapers';
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
            background: 'rgba(37, 99, 235, 0.12)',
            color: '#2563eb',
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
            Location Outside the United States
          </div>
          <div style={{ fontSize: '0.85rem', color: 'var(--muted-foreground)', marginTop: '2px' }}>
            Location is set to{' '}
            {locationPreference ? (
              <strong style={{ color: 'var(--foreground)' }}>"{locationPreference}"</strong>
            ) : (
              'an international region'
            )}
            . Enable international sources in Settings to maximize job matches.
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
        <button
          onClick={handleGoToSettings}
          style={{
            padding: '6px 14px',
            borderRadius: '6px',
            border: 'none',
            background: 'var(--accent-primary)',
            color: '#ffffff',
            fontWeight: 600,
            fontSize: '0.85rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            transition: 'opacity 0.15s ease',
          }}
        >
          <span>Enable in Settings</span>
          <ArrowRight size={14} />
        </button>
        <button
          onClick={onClose}
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
          Got it
        </button>
        <button
          onClick={onClose}
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

