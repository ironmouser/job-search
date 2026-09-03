'use client';

import { useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { InterventionPanel } from './InterventionPanel';
import { X, ShieldAlert } from 'lucide-react';
import { isAutoApplyEnabled } from '@/lib/features';

interface GlobalInterventionDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  intervention: {
    id: string;
    jobId?: string | null;
    sessionId?: string | null;
    reason: string;
    description: string;
    screenshotUrl?: string | null;
    pageUrl?: string | null;
  } | null;
  jobId?: string | null;
  jobTitle?: string;
  companyName?: string;
  onResolved: () => void;
}

const subscribe = () => () => {};

export function GlobalInterventionDrawer({
  isOpen,
  onClose,
  intervention,
  jobId,
  jobTitle,
  companyName,
  onResolved,
}: GlobalInterventionDrawerProps) {
  const mounted = useSyncExternalStore(
    subscribe,
    () => true,
    () => false
  );

  if (!isAutoApplyEnabled() || !mounted || !isOpen || !intervention) return null;

  const modalContent = (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        padding: '16px',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '680px',
          maxHeight: '90vh',
          backgroundColor: 'var(--background, #09090b)',
          border: '1px solid var(--border-glass, rgba(255, 255, 255, 0.1))',
          borderRadius: '12px',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.5)',
        }}
      >
        {/* Drawer Header */}
        <div
          style={{
            padding: '12px 16px',
            borderBottom: '1px solid var(--border-glass, rgba(255, 255, 255, 0.1))',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'var(--secondary, #18181b)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <ShieldAlert size={18} color="#ef4444" />
            <div>
              <span style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-primary)' }}>
                Action Required to Continue Auto-Apply
              </span>
              {(jobTitle || companyName) && (
                <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                  {[jobTitle, companyName].filter(Boolean).join(' • ')}
                </span>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '4px' }}
            title="Close Drawer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Embedded Intervention Panel */}
        <InterventionPanel
          interventionId={intervention.id}
          sessionId={intervention.sessionId}
          jobId={intervention.jobId || jobId}
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
