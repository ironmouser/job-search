'use client';

import React from 'react';
import { createPortal } from 'react-dom';
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
        className="glass-card animate-scale-up"
        style={{
          background: 'var(--card)',
          color: 'var(--card-foreground)',
          border: '1px solid var(--border-glass, var(--border))',
          borderRadius: '16px',
          padding: '32px',
          maxWidth: '500px',
          width: '90%',
          boxShadow: '0 20px 60px rgba(0,0,0,0.35)',
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
        }}
      >
        <button
          onClick={onClose}
          style={{
            position: 'absolute',
            top: '16px',
            right: '16px',
            background: 'transparent',
            border: 'none',
            color: 'var(--muted-foreground)',
            cursor: 'pointer',
            padding: '4px',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          aria-label="Close modal"
        >
          <X size={20} />
        </button>

        <div
          style={{
            width: '56px',
            height: '56px',
            borderRadius: '50%',
            background: 'rgba(37, 99, 235, 0.12)',
            color: '#2563eb',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '20px',
          }}
        >
          <Globe size={30} />
        </div>

        <h2
          style={{
            margin: '0 0 12px',
            fontSize: '1.35rem',
            fontWeight: 700,
            color: 'var(--foreground)',
          }}
        >
          Location Outside the United States
        </h2>

        <p
          style={{
            margin: '0 0 24px',
            fontSize: '0.95rem',
            color: 'var(--muted-foreground)',
            lineHeight: 1.6,
          }}
        >
          We noticed your location preference is set to{' '}
          {locationPreference ? (
            <strong style={{ color: 'var(--foreground)' }}>"{locationPreference}"</strong>
          ) : (
            'a location outside of the United States'
          )}
          . To search for international jobs, you should enable international scraper sources on the Settings page.
        </p>

        <div
          style={{
            display: 'flex',
            gap: '12px',
            width: '100%',
            justifyContent: 'center',
          }}
        >
          <button
            onClick={onClose}
            style={{
              flex: 1,
              padding: '12px 18px',
              borderRadius: '10px',
              border: '1px solid var(--border)',
              background: 'transparent',
              color: 'var(--foreground)',
              fontWeight: 600,
              fontSize: '0.9rem',
              cursor: 'pointer',
            }}
          >
            Got it
          </button>

          <button
            onClick={handleGoToSettings}
            style={{
              flex: 1.4,
              padding: '12px 18px',
              borderRadius: '10px',
              border: 'none',
              background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
              color: '#ffffff',
              fontWeight: 600,
              fontSize: '0.9rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              boxShadow: '0 4px 16px rgba(37, 99, 235, 0.35)',
            }}
          >
            <span>Enable International Sources</span>
            <ArrowRight size={16} />
          </button>
        </div>
      </div>
    </div>
  );

  if (typeof document === 'undefined') return null;
  return createPortal(modal, document.body);
}
