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
  const isOnboarding = pathname?.startsWith('/onboarding');
  const [activeSession, setActiveSession] = useState<ActiveSessionData | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [dismissedSessionId, setDismissedSessionId] = useState<string | null>(null);

  const fetchActive = useCallback(async () => {
    if (isOnboarding) return;
    try {
      const res = await fetch('/api/auto-apply/active', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        const active = data.activeSession;
        if (active) {
          const isDismissed =
            active.id === dismissedSessionId ||
            (typeof window !== 'undefined' && sessionStorage.getItem(`dismissed_dock_${active.id}`) === 'true');
          if (!isDismissed) {
            setActiveSession(active);
          } else {
            setActiveSession(null);
          }
        } else {
          setActiveSession(null);
        }
      }
    } catch {
      // Ignore poll errors
    }
  }, [dismissedSessionId, isOnboarding]);

  useEffect(() => {
    if (isOnboarding) return;
    fetchActive();
    const interval = setInterval(fetchActive, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchActive, isOnboarding]);

  if (isOnboarding || !activeSession) return null;

  const isIntervention = activeSession.status === AutoApplyStatus.NEEDS_INTERVENTION;
  const isSimulated = activeSession.simulationMode;
  const jobTitle = activeSession.job?.title || 'Job Application';
  const companyName = activeSession.job?.company || '';
  const pendingIntervention = activeSession.interventions?.[0];

  const handleNavigateToJob = () => {
    if (!activeSession) return;
    const sessionId = activeSession.id;
    const targetJobId = activeSession.jobId;

    setDismissedSessionId(sessionId);
    if (typeof window !== 'undefined') {
      sessionStorage.setItem(`dismissed_dock_${sessionId}`, 'true');
    }
    setActiveSession(null);

    const targetUrl = `/job/${targetJobId}?autoApplyExpand=true#step-3-apply`;
    if (pathname === `/job/${targetJobId}`) {
      window.history.pushState({}, '', targetUrl);
      window.dispatchEvent(new CustomEvent('auto-apply-expand-trigger'));
    } else {
      router.push(targetUrl);
    }
  };

  const handleDismiss = () => {
    if (!activeSession) return;
    setDismissedSessionId(activeSession.id);
    if (typeof window !== 'undefined') {
      sessionStorage.setItem(`dismissed_dock_${activeSession.id}`, 'true');
    }
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
        background: isIntervention ? '#fffbe6' : '#ffffff',
        border: `1px solid ${isIntervention ? '#f59e0b' : '#e2e8f0'}`,
        borderRadius: '0.85rem',
        padding: '1rem 1.1rem',
        boxShadow: isIntervention 
          ? '0 10px 25px -5px rgba(245, 158, 11, 0.25), 0 4px 15px rgba(0, 0, 0, 0.08)'
          : '0 10px 25px -5px rgba(0, 0, 0, 0.12), 0 4px 12px rgba(0, 0, 0, 0.05)',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.75rem',
        transition: 'all 0.25s ease-in-out',
        color: '#0f172a',
      }}
      id="global-auto-apply-dock"
    >
      {/* Top Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
          {isIntervention ? (
            <AlertTriangle size={17} color="#d97706" className="animate-pulse" />
          ) : (
            <Loader2 size={17} color="#2563eb" className="animate-spin" />
          )}
          <span style={{ fontWeight: 700, fontSize: '0.85rem', color: isIntervention ? '#d97706' : '#2563eb', letterSpacing: '0.01em' }}>
            {isIntervention ? 'Action Required' : 'Auto Apply Running'}
          </span>
          {isSimulated && (
            <span style={{ fontSize: '0.62rem', color: '#7c3aed', border: '1px solid #7c3aed', borderRadius: '4px', padding: '0.05rem 0.3rem', fontWeight: 600 }}>
              SIM
            </span>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
          <button
            onClick={() => setCollapsed(true)}
            style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', padding: '0.2rem' }}
            title="Minimize Dock"
          >
            <ChevronDown size={17} />
          </button>
        </div>
      </div>

      {/* Main Content Info */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
        <span style={{ fontWeight: 600, fontSize: '0.9rem', color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {jobTitle}
        </span>
        {companyName && (
          <span style={{ fontSize: '0.78rem', color: '#475569', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
            <Building2 size={12} /> {companyName}
          </span>
        )}
      </div>

      {/* Progress or Description */}
      {isIntervention && pendingIntervention ? (
        <div style={{ fontSize: '0.78rem', color: '#92400e', background: 'rgba(245, 158, 11, 0.12)', padding: '0.5rem 0.65rem', borderRadius: '0.4rem', borderLeft: '3px solid #f59e0b', lineHeight: 1.4 }}>
          {pendingIntervention.description.length > 90 
            ? pendingIntervention.description.slice(0, 87) + '…'
            : pendingIntervention.description}
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.78rem', color: '#475569' }}>
          <span>
            {activeSession.currentStep 
              ? activeSession.currentStep.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
              : 'Processing application...'}
          </span>
          {activeSession.stepsTotal && (
            <span style={{ fontWeight: 600, color: '#2563eb' }}>
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
