'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { InterventionPanel } from './InterventionPanel';
import { X, ShieldAlert } from 'lucide-react';

interface GlobalInterventionDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  intervention: {
    id: string;
    reason: string;
    description: string;
    screenshotUrl?: string | null;
    pageUrl?: string | null;
  } | null;
  jobTitle?: string;
  companyName?: string;
  onResolved: () => void;
}

export function GlobalInterventionDrawer({
  isOpen,
  onClose,
  intervention,
  jobTitle,
  companyName,
  onResolved,
}: GlobalInterventionDrawerProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted || !isOpen || !intervention) return null;

  const modalContent = (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        background: 'rgba(0, 0, 0, 0.65)',
        padding: '1rem',
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '560px',
          maxHeight: '90vh',
          overflowY: 'auto',
          background: 'var(--bg-secondary, #1e293b)',
          border: '1px solid var(--border-glass, #334155)',
          borderRadius: '12px',
          padding: '1.25rem',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.3)',
          display: 'flex',
          flexDirection: 'column',
          gap: '1rem',
          color: 'var(--text-primary, #f8fafc)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-glass, #334155)', paddingBottom: '0.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <ShieldAlert size={20} color="#f59e0b" />
            <div>
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#f59e0b' }}>
                Action Required for Application
              </h3>
              {jobTitle && (
                <span style={{ fontSize: '0.78rem', color: 'var(--text-muted, #94a3b8)' }}>
                  {jobTitle} {companyName ? `at ${companyName}` : ''}
                </span>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '4px' }}
            title="Close Drawer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Embedded Intervention Panel */}
        <InterventionPanel
          interventionId={intervention.id}
          reason={intervention.reason}
          description={intervention.description}
          screenshotUrl={intervention.screenshotUrl}
          pageUrl={intervention.pageUrl}
          onResolved={() => {
            onResolved();
            onClose();
          }}
        />
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
