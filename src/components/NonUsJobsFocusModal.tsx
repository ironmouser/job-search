'use client';

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Globe, X, Loader2 } from 'lucide-react';

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
  const [mounted, setMounted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    setMounted(true);
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onKeepAll();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onKeepAll]);

  const handleUsOnly = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      const res = await fetch('/api/jobs/delete-non-us', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        onUsOnly(data.deletedJobIds || data.deletedIds || []);
      } else {
        onUsOnly([]);
      }
    } catch {
      onUsOnly([]);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!mounted || typeof document === 'undefined') return null;

  const modalContent = (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSubmitting) {
          onKeepAll();
        }
      }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0, 0, 0, 0.6)',
        padding: '1rem',
      }}
    >
      <div
        className="animate-fade-in"
        style={{
          background: 'var(--card)',
          color: 'var(--card-foreground)',
          border: '1px solid var(--border)',
          borderRadius: '16px',
          padding: '28px 24px',
          maxWidth: '460px',
          width: '100%',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.35)',
          position: 'relative',
          textAlign: 'center',
          boxSizing: 'border-box',
        }}
      >
        <button
          onClick={onKeepAll}
          disabled={isSubmitting}
          aria-label="Close modal"
          title="Close modal"
          style={{
            position: 'absolute',
            top: '16px',
            right: '16px',
            background: 'transparent',
            border: 'none',
            color: 'var(--muted-foreground)',
            cursor: isSubmitting ? 'not-allowed' : 'pointer',
            padding: '6px',
            borderRadius: '6px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            opacity: isSubmitting ? 0.5 : 1,
            transition: 'color 0.15s ease, background 0.15s ease',
          }}
        >
          <X size={18} />
        </button>

        <div
          style={{
            width: '48px',
            height: '48px',
            borderRadius: '12px',
            background: 'rgba(59, 130, 246, 0.12)',
            color: 'var(--accent-primary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 16px auto',
          }}
        >
          <Globe size={26} />
        </div>

        <h2
          style={{
            margin: '0 0 10px 0',
            fontSize: '1.25rem',
            fontWeight: 700,
            color: 'var(--foreground)',
          }}
        >
          Focus on U.S. Jobs?
        </h2>

        <p
          style={{
            margin: '0 0 24px 0',
            fontSize: '0.925rem',
            color: 'var(--muted-foreground)',
            lineHeight: 1.6,
          }}
        >
          We found{' '}
          <strong style={{ color: 'var(--foreground)' }}>
            {intlJobCount} international {intlJobCount === 1 ? 'job' : 'jobs'}
          </strong>{' '}
          in your results. Would you like to filter to U.S.-only roles?
        </p>

        <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
          <button
            onClick={onKeepAll}
            disabled={isSubmitting}
            style={{
              flex: 1,
              padding: '10px 16px',
              borderRadius: '8px',
              border: '1px solid var(--border)',
              background: 'var(--secondary, #f3f4f6)',
              color: 'var(--foreground)',
              fontWeight: 600,
              fontSize: '0.9rem',
              cursor: isSubmitting ? 'not-allowed' : 'pointer',
              opacity: isSubmitting ? 0.6 : 1,
              transition: 'background 0.15s ease, opacity 0.15s ease',
            }}
          >
            Keep All
          </button>
          <button
            onClick={handleUsOnly}
            disabled={isSubmitting}
            style={{
              flex: 1,
              padding: '10px 16px',
              borderRadius: '8px',
              border: 'none',
              background: 'var(--accent-primary)',
              color: '#ffffff',
              fontWeight: 600,
              fontSize: '0.9rem',
              cursor: isSubmitting ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              opacity: isSubmitting ? 0.8 : 1,
              transition: 'opacity 0.15s ease',
            }}
          >
            {isSubmitting ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                <span>Updating...</span>
              </>
            ) : (
              'U.S. Only'
            )}
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
