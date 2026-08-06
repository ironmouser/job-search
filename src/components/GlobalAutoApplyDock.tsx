'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Bot, AlertTriangle, Loader2, ChevronDown, ChevronUp, ExternalLink, Building2, CheckCircle2 } from 'lucide-react';
import { AutoApplyStatus } from '@/lib/auto-apply/types';

interface ActiveSessionData {
  id: string;
  jobId: string;
  status: string;
  atsPlatform?: string | null;
  simulationMode: boolean;
  currentStep?: string | null;
  stepsCompleted: number;
  stepsTotal?: number | null;
  failureReason?: string | null;
  failureDetails?: string | null;
  job?: {
    id: string;
    title: string;
    company: string;
  } | null;
  interventions?: Array<{
    id: string;
    reason: string;
    description: string;
  }>;
}

const POLL_INTERVAL = 4000;

export function GlobalAutoApplyDock() {
  const router = useRouter();
  const pathname = usePathname();
  const [activeSession, setActiveSession] = useState<ActiveSessionData | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [dismissedSessionId, setDismissedSessionId] = useState<string | null>(null);

  const fetchActive = useCallback(async () => {
    try {
      const res = await fetch('/api/auto-apply/active', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        if (data.activeSession && data.activeSession.id !== dismissedSessionId) {
          setActiveSession(data.activeSession);
        } else if (!data.activeSession) {
          setActiveSession(null);
        }
      }
    } catch {
      // Ignore poll errors
    }
  }, [dismissedSessionId]);

  useEffect(() => {
    fetchActive();
    const interval = setInterval(fetchActive, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchActive]);

  if (!activeSession) return null;

  const isIntervention = activeSession.status === AutoApplyStatus.NEEDS_INTERVENTION;
  const isSimulated = activeSession.simulationMode;
  const jobTitle = activeSession.job?.title || 'Job Application';
  const companyName = activeSession.job?.company || '';
  const pendingIntervention = activeSession.interventions?.[0];

  const handleNavigateToJob = () => {
    router.push(`/job/${activeSession.jobId}`);
  };

  const handleDismiss = () => {
    setDismissedSessionId(activeSession.id);
    setActiveSession(null);
  };

  // Render minimized icon floating button
  if (collapsed) {
    return (
      <div
        onClick={() => setCollapsed(false)}
        style={{
          position: 'fixed',
          bottom: '1.5rem',
          right: '1.5rem',
          zIndex: 9990,
          background: isIntervention ? '#f59e0b' : '#3b82f6',
          color: '#ffffff',
          borderRadius: '9999px',
          padding: '0.75rem 1.1rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.4)',
          cursor: 'pointer',
          fontWeight: 600,
          fontSize: '0.85rem',
          transition: 'all 0.2s ease-in-out',
        }}
        title="Click to expand Auto Apply Dock"
      >
        {isIntervention ? (
          <AlertTriangle size={18} className="animate-pulse" />
        ) : (
          <Loader2 size={18} className="animate-spin" />
        )}
        <span>Auto Apply Active</span>
        <ChevronUp size={16} />
      </div>
    );
  }

  // Render full dock card
  return (
    <div
      style={{
        position: 'fixed',
        bottom: '1.5rem',
        right: '1.5rem',
        zIndex: 9990,
        width: '360px',
        maxWidth: 'calc(100vw - 3rem)',
        background: isIntervention 
          ? 'linear-gradient(135deg, #1e1b4b 0%, #311b92 100%)' 
          : 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
        border: `1px solid ${isIntervention ? '#f59e0b' : 'rgba(59, 130, 246, 0.35)'}`,
        borderRadius: '0.85rem',
        padding: '1rem 1.1rem',
        boxShadow: isIntervention 
          ? '0 14px 36px -4px rgba(245, 158, 11, 0.3), 0 0 20px rgba(245, 158, 11, 0.2)'
          : '0 14px 36px -4px rgba(15, 23, 42, 0.45), 0 0 20px rgba(59, 130, 246, 0.15)',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.75rem',
        transition: 'all 0.25s ease-in-out',
        color: '#f8fafc',
      }}
      id="global-auto-apply-dock"
    >
      {/* Top Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
          {isIntervention ? (
            <AlertTriangle size={17} color="#fbbf24" className="animate-pulse" />
          ) : (
            <Loader2 size={17} color="#60a5fa" className="animate-spin" />
          )}
          <span style={{ fontWeight: 700, fontSize: '0.85rem', color: isIntervention ? '#fbbf24' : '#60a5fa', letterSpacing: '0.01em' }}>
            {isIntervention ? 'Action Required' : 'Auto Apply Running'}
          </span>
          {isSimulated && (
            <span style={{ fontSize: '0.62rem', color: '#c084fc', border: '1px solid #c084fc', borderRadius: '4px', padding: '0.05rem 0.3rem', fontWeight: 600 }}>
              SIM
            </span>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
          <button
            onClick={() => setCollapsed(true)}
            style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '0.2rem' }}
            title="Minimize Dock"
          >
            <ChevronDown size={17} />
          </button>
        </div>
      </div>

      {/* Main Content Info */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
        <span style={{ fontWeight: 600, fontSize: '0.9rem', color: '#ffffff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {jobTitle}
        </span>
        {companyName && (
          <span style={{ fontSize: '0.78rem', color: '#cbd5e1', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
            <Building2 size={12} /> {companyName}
          </span>
        )}
      </div>

      {/* Progress or Description */}
      {isIntervention && pendingIntervention ? (
        <div style={{ fontSize: '0.78rem', color: '#fef3c7', background: 'rgba(245, 158, 11, 0.2)', padding: '0.5rem 0.65rem', borderRadius: '0.4rem', borderLeft: '3px solid #f59e0b', lineHeight: 1.4 }}>
          {pendingIntervention.description.length > 90 
            ? pendingIntervention.description.slice(0, 87) + '…'
            : pendingIntervention.description}
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.78rem', color: '#cbd5e1' }}>
          <span>
            {activeSession.currentStep 
              ? activeSession.currentStep.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
              : 'Processing application...'}
          </span>
          {activeSession.stepsTotal && (
            <span style={{ fontWeight: 600, color: '#60a5fa' }}>
              Step {activeSession.stepsCompleted}/{activeSession.stepsTotal}
            </span>
          )}
        </div>
      )}

      {/* Action Footer */}
      <div style={{ display: 'flex', gap: '0.5rem', paddingTop: '0.25rem' }}>
        <button
          onClick={handleNavigateToJob}
          className="btn-primary"
          style={{
            flex: 1,
            padding: '0.45rem 0.75rem',
            fontSize: '0.8rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.35rem',
            background: isIntervention 
              ? 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)' 
              : undefined,
          }}
        >
          <ExternalLink size={14} />
          {isIntervention ? 'Resolve Action Required' : 'View Live Updates'}
        </button>
      </div>
    </div>
  );
}
