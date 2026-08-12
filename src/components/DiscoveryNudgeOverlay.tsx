'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { X, Search, Settings, ArrowRight } from 'lucide-react';

interface DiscoveryNudgeOverlayProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function DiscoveryNudgeOverlay({ isOpen, onClose }: DiscoveryNudgeOverlayProps) {
  const [mounted, setMounted] = useState(false);
  const router = useRouter();

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose]);

  const handleGoToSettings = () => {
    onClose();
    router.push('/settings#job-discovery');
  };

  if (!mounted || !isOpen) return null;

  const modalContent = (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        padding: '1.5rem',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="discovery-nudge-title"
        style={{
          width: '100%',
          maxWidth: '500px',
          backgroundColor: 'var(--card)',
          border: '1px solid var(--border)',
          borderRadius: '16px',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.3), 0 8px 10px -6px rgba(0, 0, 0, 0.2)',
          overflow: 'hidden',
          color: 'var(--card-foreground)',
          position: 'relative',
          padding: '2rem',
        }}
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          aria-label="Close modal"
          style={{
            position: 'absolute',
            top: '1.25rem',
            right: '1.25rem',
            background: 'transparent',
            border: 'none',
            color: 'var(--muted-foreground)',
            cursor: 'pointer',
            padding: '6px',
            borderRadius: '8px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'color 0.15s ease',
          }}
        >
          <X size={20} />
        </button>

        {/* Header Icon & Title */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
          <div
            style={{
              width: '56px',
              height: '56px',
              borderRadius: '50%',
              backgroundColor: 'var(--accent-glow)',
              border: '1px solid var(--border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '1.25rem',
              color: 'var(--accent-primary)',
            }}
          >
            <Search size={28} />
          </div>

          <h2
            id="discovery-nudge-title"
            style={{ fontSize: '1.35rem', fontWeight: 700, margin: '0 0 0.75rem 0', color: 'var(--foreground)' }}
          >
            Fine-Tune Your Job Search
          </h2>

          <p
            style={{
              fontSize: '0.975rem',
              color: 'var(--muted-foreground)',
              lineHeight: 1.6,
              margin: '0 0 1.75rem 0',
              fontWeight: 400,
            }}
          >
            Remember to review your job discovery setting to fine tune your job search critera
          </p>
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            style={{
              padding: '0.7rem 1.25rem',
              backgroundColor: 'var(--secondary)',
              color: 'var(--foreground)',
              border: '1px solid var(--border)',
              borderRadius: '8px',
              fontWeight: 500,
              fontSize: '0.9rem',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            Dismiss
          </button>
          <button
            onClick={handleGoToSettings}
            style={{
              padding: '0.7rem 1.4rem',
              backgroundColor: 'var(--accent-primary)',
              color: '#ffffff',
              border: 'none',
              borderRadius: '8px',
              fontWeight: 600,
              fontSize: '0.9rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              transition: 'opacity 0.15s ease',
            }}
          >
            <Settings size={16} />
            Go to Settings
            <ArrowRight size={16} />
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
