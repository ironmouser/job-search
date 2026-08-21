'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import {
  Bot,
  AlertTriangle,
  Loader2,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  X,
  ListOrdered,
  Trash2,
  Sparkles,
  Check,
  Zap,
} from 'lucide-react';
import { AutoApplyStatus } from '@/lib/auto-apply/types';
import { InterventionPanel } from './InterventionPanel';
import { useCommandBar } from '@/contexts/AutoApplyBarContext';

export interface AutoApplyQueueItem {
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
    screenshotUrl?: string | null;
    pageUrl?: string | null;
  }>;
}

const STEP_DEFINITIONS = [
  { num: 1, label: 'ATS Check', desc: 'Detecting ATS platform & application requirements' },
  { num: 2, label: 'Preparing', desc: 'Loading candidate profile & application data' },
  { num: 3, label: 'Tailoring Assets', desc: 'Generating tailored resume and cover letter' },
  { num: 4, label: 'Navigating', desc: 'Navigating to official ATS application form' },
  { num: 5, label: 'Form Filling', desc: 'Autofilling fields, screening questions & attachments' },
  { num: 6, label: 'Submission', desc: 'Reviewing, validating and submitting application' },
];

function getActiveStepNumber(session: AutoApplyQueueItem | null): number {
  if (!session) return 1;
  if (session.status === 'applied' || session.status === AutoApplyStatus.APPLIED) return 6;
  const step = (session.currentStep || session.status || '').toLowerCase();
  if (step.includes('detect') || step.includes('check')) return 1;
  if (step.includes('prep') || step.includes('init') || step.includes('process')) return 2;
  if (step.includes('asset') || step.includes('resume') || step.includes('cover')) return 3;
  if (step.includes('navigat') || step.includes('open')) return 4;
  if (step.includes('apply') || step.includes('fill')) return 5;
  if (step.includes('validat') || step.includes('submit') || step.includes('review')) return 6;
  return session.stepsCompleted > 0 ? Math.min(session.stepsCompleted, 6) : 2;
}

const POLL_INTERVAL = 3000;

export function GlobalAutoApplyBar() {
  const router = useRouter();
  const pathname = usePathname();
  const isOnboarding = pathname?.startsWith('/onboarding');

  const {
    selectionState,
    pageActions,
    isExpanded,
    setIsExpanded,
    activeDrawerTab,
    setActiveDrawerTab,
    drawerContent,
    refreshTrigger,
  } = useCommandBar();

  const [activeSessions, setActiveSessions] = useState<AutoApplyQueueItem[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [quota, setQuota] = useState<{
    monthlyRemaining: number;
    monthlyLimit: number;
    dailyRemaining: number;
    dailyLimit: number;
    tier: string;
  } | null>(null);
  const [isDismissed, setIsDismissed] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState('220px');
  const [isMobile, setIsMobile] = useState(false);
  const [isFabOpen, setIsFabOpen] = useState(false);
  const [cancellingJobId, setCancellingJobId] = useState<string | null>(null);
  const [clearingJobId, setClearingJobId] = useState<string | null>(null);

  // Track sidebar width dynamically (expanded 220px vs collapsed 64px)
  useEffect(() => {
    const updateSidebarWidth = () => {
      if (typeof window === 'undefined') return;
      const isMinimized = localStorage.getItem('sidebarMinimized') === 'true';
      const mobile = window.innerWidth <= 1024;
      setIsMobile(mobile);
      const width = mobile ? '0px' : isMinimized ? '64px' : '220px';
      setSidebarWidth((prev) => {
        if (prev !== width) {
          document.documentElement.style.setProperty('--sidebar-width', width);
          return width;
        }
        return prev;
      });
    };

    updateSidebarWidth();
    window.addEventListener('resize', updateSidebarWidth);
    window.addEventListener('storage', updateSidebarWidth);
    return () => {
      window.removeEventListener('resize', updateSidebarWidth);
      window.removeEventListener('storage', updateSidebarWidth);
    };
  }, []);

  // Poll for active auto-apply sessions
  const fetchSessions = useCallback(async () => {
    if (isOnboarding) return;
    try {
      const res = await fetch('/api/auto-apply/active', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        if (data.quota) {
          setQuota(data.quota);
        }
        const list: AutoApplyQueueItem[] = data.activeSessions || (data.activeSession ? [data.activeSession] : []);
        setActiveSessions(list);

        // Auto-select current active or first session if not already selected
        if (list.length > 0) {
          setSelectedSessionId((prev) => {
            if (prev && list.some((s) => s.id === prev)) return prev;
            const ongoing = list.find((s) =>
              s.status !== 'applied' && s.status !== 'failed' && s.status !== 'cancelled'
            );
            return ongoing ? ongoing.id : list[0].id;
          });
        }
      }
    } catch {
      // Ignore polling errors
    }
  }, [isOnboarding]);

  useEffect(() => {
    if (isOnboarding) return;
    fetchSessions();
    const interval = setInterval(fetchSessions, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchSessions, isOnboarding, refreshTrigger]);

  // Listen to manual triggers from batch apply or start apply
  useEffect(() => {
    const handleStartEvent = () => {
      setIsDismissed(false);
      fetchSessions();
    };
    window.addEventListener('auto-apply-queue-start', handleStartEvent);
    return () => window.removeEventListener('auto-apply-queue-start', handleStartEvent);
  }, [fetchSessions]);

  // Close FAB sheet on route change
  useEffect(() => {
    setIsFabOpen(false);
  }, [pathname]);

  if (isOnboarding) return null;

  const hasActiveQueue = activeSessions.length > 0 && !isDismissed;
  const hasSelection = Boolean(selectionState && selectionState.count > 0);

  const ongoingCount = activeSessions.filter(
    (s) => s.status !== 'applied' && s.status !== 'failed' && s.status !== 'cancelled'
  ).length;
  const completedCount = activeSessions.filter((s) => s.status === 'applied').length;
  const totalCount = activeSessions.length;

  // Active or selected session
  const selectedSession =
    activeSessions.find((s) => s.id === selectedSessionId) ||
    activeSessions.find((s) => s.status !== 'applied' && s.status !== 'failed') ||
    activeSessions[0] ||
    null;

  const hasIntervention = selectedSession?.status === AutoApplyStatus.NEEDS_INTERVENTION || selectedSession?.status === AutoApplyStatus.NEEDS_REVIEW;
  const activeIntervention = selectedSession?.interventions?.[0];
  const activeStepNum = getActiveStepNumber(selectedSession);
  const isApplied = selectedSession?.status === 'applied' || selectedSession?.status === AutoApplyStatus.APPLIED;
  const isFailed = selectedSession?.status === 'failed' || selectedSession?.status === AutoApplyStatus.FAILED;

  const jobTitle = selectedSession?.job?.title || 'Auto Apply Task';
  const companyName = selectedSession?.job?.company || '';
  const currentStepLabel = STEP_DEFINITIONS[activeStepNum - 1]?.label || 'Processing';
  const currentStepDesc = STEP_DEFINITIONS[activeStepNum - 1]?.desc || 'Processing application...';

  const handleCancelJob = async (e: React.MouseEvent, jobId: string) => {
    e.stopPropagation();
    setCancellingJobId(jobId);
    // Immediately remove stopped session from local queue UI state
    setActiveSessions((prev) => {
      const next = prev.filter((s) => s.jobId !== jobId);
      if (selectedSessionId && prev.find((s) => s.jobId === jobId)?.id === selectedSessionId) {
        const remaining = next.find((s) => s.status !== 'applied' && s.status !== 'failed' && s.status !== 'cancelled') || next[0];
        setSelectedSessionId(remaining ? remaining.id : null);
      }
      return next;
    });
    try {
      await fetch(`/api/auto-apply/${jobId}/cancel`, { method: 'POST' });
      await fetchSessions();
    } catch (err) {
      console.error('Failed to cancel auto apply session:', err);
    } finally {
      setCancellingJobId(null);
    }
  };

  const handleClearJob = async (e: React.MouseEvent, jobId: string, sessionId: string) => {
    e.stopPropagation();
    setClearingJobId(jobId);
    // Immediately remove cleared session from local queue UI state
    setActiveSessions((prev) => {
      const next = prev.filter((s) => s.id !== sessionId && s.jobId !== jobId);
      if (selectedSessionId === sessionId) {
        setSelectedSessionId(next.length > 0 ? next[0].id : null);
      }
      return next;
    });
    try {
      await fetch(`/api/auto-apply/${jobId}/clear`, { method: 'POST' });
      await fetchSessions();
    } catch (err) {
      console.error('Failed to clear auto apply session:', err);
    } finally {
      setClearingJobId(null);
    }
  };

  const handleClearAllFinished = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const finishedItems = activeSessions.filter(
      (s) => s.status === 'applied' || s.status === 'failed' || s.status === 'cancelled'
    );
    setActiveSessions((prev) => prev.filter((s) => s.status !== 'applied' && s.status !== 'failed' && s.status !== 'cancelled'));
    for (const item of finishedItems) {
      try {
        await fetch(`/api/auto-apply/${item.jobId}/clear`, { method: 'POST' });
      } catch (err) {
        console.error('Failed to clear session:', err);
      }
    }
    await fetchSessions();
  };

  const handleNavigateToJob = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!selectedSession) return;
    setIsExpanded(false);
    setActiveDrawerTab(null);
    router.push(`/job/${selectedSession.jobId}?autoApplyExpand=true#step-3-apply`);
  };

  const handleToggleAutoApplyDrawer = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isExpanded && activeDrawerTab === 'auto-apply') {
      setIsExpanded(false);
      setActiveDrawerTab(null);
    } else {
      setActiveDrawerTab('auto-apply');
      setIsExpanded(true);
    }
  };

  // On mobile & tablet, only show the bottom command bar if there is an active auto-apply task or user intervention
  const shouldShowBottomBar = !isMobile || hasActiveQueue;

  return (
    <>
      {shouldShowBottomBar && (
        <>
          {/* Semi-transparent dark cover overlay when expanded with smooth fade */}
          <div
            onClick={() => {
              setIsExpanded(false);
              setActiveDrawerTab(null);
            }}
            className={`command-bar-backdrop ${isExpanded ? 'active' : ''}`}
            aria-label="Close expanded command bar"
            title="Click to minimize command bar"
          />

          <div
            id="global-command-bar"
            className={`global-auto-apply-bar ${isExpanded ? 'expanded' : 'collapsed'}`}
            style={{
              left: sidebarWidth,
            }}
          >
          {/* ─── Compact Command Bar Header (52px) ─── */}
          <div className="auto-apply-bar-header">
        {/* LEFT SECTION: Page Actions OR Batch Selection — hidden on mobile OR when expanded to reduce clutter */}
        {!isMobile && !isExpanded && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', minWidth: 0, overflowX: 'auto', scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
            {hasSelection ? (
              /* Batch Selection Mode */
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'nowrap' }}>
                <span style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  fontSize: '0.82rem',
                  fontWeight: 700,
                  color: '#38bdf8',
                  background: 'rgba(56, 189, 248, 0.14)',
                  border: '1px solid rgba(56, 189, 248, 0.35)',
                  padding: '0.2rem 0.65rem',
                  borderRadius: '9999px',
                  whiteSpace: 'nowrap',
                }}>
                  <CheckCircle2 size={14} />
                  <span>{selectionState?.count} Selected</span>
                </span>

                {selectionState?.onDeselectAll && (
                  <button
                    type="button"
                    onClick={selectionState.onDeselectAll}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#cbd5e1',
                      fontSize: '0.8rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      textDecoration: 'underline',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    Deselect All
                  </button>
                )}

                {selectionState?.onArchiveDelete && (
                  <button
                    type="button"
                    onClick={selectionState.onArchiveDelete}
                    className="command-bar-btn command-bar-btn-danger"
                  >
                    <Trash2 size={13} />
                    <span>Archive / Delete</span>
                  </button>
                )}

                {selectionState?.onStartApply && (() => {
                  const isBatchApplying = Boolean(
                    selectionState?.isApplying ||
                    (ongoingCount > 0 && activeSessions.some((s) => s.status !== 'applied' && s.status !== 'failed' && s.status !== 'cancelled' && s.status !== AutoApplyStatus.NEEDS_INTERVENTION && s.status !== AutoApplyStatus.NEEDS_REVIEW))
                  );

                  return (
                    <button
                      type="button"
                      onClick={selectionState.onStartApply}
                      disabled={isBatchApplying}
                      className="command-bar-btn command-bar-btn-primary"
                      style={{ color: '#ffffff', opacity: isBatchApplying ? 0.9 : 1 }}
                    >
                      {isBatchApplying ? (
                        <>
                          <Loader2 size={15} color="#ffffff" className="animate-spin" />
                          <span style={{ color: '#ffffff' }}>
                            Auto Applying ({completedCount}/{totalCount || selectionState?.count})...
                          </span>
                        </>
                      ) : (
                        <>
                          <Bot size={15} color="#ffffff" />
                          <span style={{ color: '#ffffff' }}>1-Click Auto Apply ({selectionState?.count})</span>
                        </>
                      )}
                    </button>
                  );
                })()}
              </div>
            ) : (
              /* Page Registered Context Actions */
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'nowrap' }}>
                {pageActions}
              </div>
            )}
          </div>
        )}

        {/* When expanded on desktop: show clean header title and quota */}
        {isExpanded && !isMobile && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <span style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--text-primary)' }}>
              Auto Apply Queue
            </span>
            <span style={{
              fontSize: '0.72rem',
              fontWeight: 600,
              color: '#0070f3',
              background: 'rgba(0, 112, 243, 0.08)',
              border: '1px solid rgba(0, 112, 243, 0.2)',
              padding: '0.1rem 0.5rem',
              borderRadius: '9999px'
            }}>
              {activeSessions.length} {activeSessions.length === 1 ? 'task' : 'tasks'}
            </span>
            {quota && quota.tier !== 'FREE' && (
              <span style={{
                fontSize: '0.72rem',
                fontWeight: 600,
                color: '#f59e0b',
                background: 'rgba(245, 158, 11, 0.08)',
                border: '1px solid rgba(245, 158, 11, 0.25)',
                padding: '0.1rem 0.5rem',
                borderRadius: '9999px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.25rem'
              }}>
                <Zap size={11} fill="currentColor" /> {quota.monthlyRemaining} of {quota.monthlyLimit} left
              </span>
            )}
          </div>
        )}

        {/* Spacer so right section stays right-aligned on desktop */}
        {!isMobile && <div style={{ flex: 1 }} />}

        {/* RIGHT SECTION: Global Background Auto Apply Status & Drawer Toggle */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: isMobile ? 'center' : 'flex-end',
          width: isMobile ? '100%' : 'auto',
          flexShrink: 0
        }}>
          {hasActiveQueue ? (
            /* Active / Recent Queue Pill */
            <div
              onClick={handleToggleAutoApplyDrawer}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                width: isMobile ? '100%' : 'auto',
                gap: '0.5rem',
                background: hasIntervention
                  ? '#2d1a04'
                  : ongoingCount > 0
                  ? '#0d2847'
                  : '#062d1d',
                border: `1.5px solid ${hasIntervention ? '#f59e0b' : ongoingCount > 0 ? '#3b82f6' : '#10b981'}`,
                borderRadius: '9999px',
                padding: isMobile ? '0.4rem 1rem' : '0.35rem 0.85rem',
                cursor: 'pointer',
                transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
                boxShadow: ongoingCount > 0 ? '0 0 12px rgba(59, 130, 246, 0.3)' : 'none',
              }}
              title="Click to view live application progress and queue"
            >
              {/* Left group inside pill */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                {hasIntervention ? (
                  <AlertTriangle size={16} color="#fbbf24" className="animate-pulse" />
                ) : ongoingCount > 0 ? (
                  <Loader2 size={16} color="#60a5fa" className="animate-spin" />
                ) : (
                  <CheckCircle2 size={16} color="#34d399" />
                )}

                <span style={{
                  fontSize: '0.84rem',
                  fontWeight: 700,
                  color: '#ffffff',
                  whiteSpace: 'nowrap',
                }}>
                  {hasIntervention
                    ? 'Action Required'
                    : ongoingCount > 0
                    ? `Auto Apply (${completedCount}/${totalCount})`
                    : 'Queue Complete'}
                </span>
              </div>

              {/* Vertical Divider inside pill */}
              <div style={{
                height: '15px',
                width: '1px',
                background: 'rgba(255, 255, 255, 0.25)',
                margin: '0 0.4rem',
                flexShrink: 0,
              }} />

              {/* Right group inside pill */}
              <div style={{
                fontSize: '0.8rem',
                color: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                gap: '0.2rem',
                fontWeight: 600,
                flexShrink: 0,
              }}>
                {isExpanded && activeDrawerTab === 'auto-apply' ? (
                  <>
                    <span>Close</span>
                    <ChevronDown size={15} color="#ffffff" />
                  </>
                ) : (
                  <>
                    <span>Live</span>
                    <ChevronUp size={15} color="#ffffff" />
                  </>
                )}
              </div>
            </div>
          ) : (
            /* Idle System Status */
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#94a3b8', fontSize: '0.78rem', fontWeight: 600 }}>
              <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#10b981' }} />
              <span style={{ display: 'none' }} className="md-inline-flex">Ready</span>
            </div>
          )}
        </div>
      </div>

      {/* ─── Expanded Drawer Body ─── */}
      <div className="auto-apply-bar-body" style={{ overflowY: 'auto' }}>
          {activeDrawerTab === 'auto-apply' && hasActiveQueue ? (
            <>
              {/* Left Panel: Queue List */}
              <div className="drawer-queue-sidebar">
                {/* Mobile Drawer Title Header */}
                {isMobile && (
                  <div style={{
                    padding: '0.85rem 1rem 0.65rem 1rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '0.5rem',
                    borderBottom: '1px solid var(--border, rgba(255, 255, 255, 0.08))',
                    background: 'var(--bg-primary, #0d1117)'
                  }}>
                    <span style={{ fontSize: '0.92rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                      Auto Apply Queue
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                      <span style={{
                        fontSize: '0.72rem',
                        fontWeight: 600,
                        color: '#0070f3',
                        background: 'rgba(0, 112, 243, 0.08)',
                        border: '1px solid rgba(0, 112, 243, 0.2)',
                        padding: '0.12rem 0.55rem',
                        borderRadius: '9999px'
                      }}>
                        {activeSessions.length} {activeSessions.length === 1 ? 'task' : 'tasks'}
                      </span>
                      {quota && quota.tier !== 'FREE' && (
                        <span style={{
                          fontSize: '0.72rem',
                          fontWeight: 600,
                          color: '#f59e0b',
                          background: 'rgba(245, 158, 11, 0.08)',
                          border: '1px solid rgba(245, 158, 11, 0.25)',
                          padding: '0.12rem 0.55rem',
                          borderRadius: '9999px',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.25rem'
                        }}>
                          <Zap size={11} fill="currentColor" /> {quota.monthlyRemaining} of {quota.monthlyLimit} left
                        </span>
                      )}
                    </div>
                  </div>
                )}

                <div className="drawer-queue-header">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                    <ListOrdered size={14} color="#0070f3" />
                    <span>QUEUE ({activeSessions.length})</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    <span style={{
                      background: 'rgba(0, 112, 243, 0.08)',
                      color: '#0070f3',
                      padding: '0.15rem 0.55rem',
                      borderRadius: '9999px',
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      border: '1px solid rgba(0, 112, 243, 0.2)',
                    }}>
                      {ongoingCount} Active
                    </span>
                    {activeSessions.some((s) => s.status === 'applied' || s.status === 'failed' || s.status === 'cancelled') && (
                      <button
                        type="button"
                        onClick={handleClearAllFinished}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: '#94a3b8',
                          fontSize: '0.7rem',
                          fontWeight: 600,
                          cursor: 'pointer',
                          textDecoration: 'underline',
                          padding: '0 0.25rem',
                        }}
                        title="Clear all completed and failed tasks from queue"
                      >
                        Clear All
                      </button>
                    )}
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', padding: '0.6rem', gap: '0.45rem' }}>
                  {activeSessions.map((session) => {
                    const isSel = session.id === selectedSession?.id;
                    const isAct = session.status !== 'applied' && session.status !== 'failed' && session.status !== 'cancelled';
                    const isApp = session.status === 'applied';
                    const isFail = session.status === 'failed';
                    const isInter = session.status === AutoApplyStatus.NEEDS_INTERVENTION || session.status === AutoApplyStatus.NEEDS_REVIEW;

                    return (
                      <div
                        key={session.id}
                        onClick={() => setSelectedSessionId(session.id)}
                        className={`drawer-queue-item ${isSel ? 'active' : ''}`}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.4rem' }}>
                          <span style={{
                            fontWeight: 600,
                            fontSize: '0.84rem',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            color: isSel ? '#0070f3' : 'var(--text-primary)',
                          }}>
                            {session.job?.title || 'Job Application'}
                          </span>
                          {isInter ? (
                            <AlertTriangle size={14} color="#f59e0b" />
                          ) : isAct ? (
                            <Loader2 size={14} color="#0070f3" className="animate-spin" />
                          ) : isApp ? (
                            <CheckCircle2 size={14} color="#10b981" />
                          ) : (
                            <AlertCircle size={14} color="#ef4444" />
                          )}
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.74rem', gap: '0.4rem' }}>
                          <span style={{ color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '130px' }}>
                            {session.job?.company || ''}
                          </span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexShrink: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.72rem', fontWeight: 600 }}>
                              <span style={{
                                width: '6px',
                                height: '6px',
                                borderRadius: '50%',
                                background: isInter
                                  ? '#f59e0b'
                                  : isApp
                                  ? '#10b981'
                                  : isFail
                                  ? '#ef4444'
                                  : '#0070f3'
                              }} />
                              <span style={{
                                color: isInter
                                  ? '#f59e0b'
                                  : isApp
                                  ? '#10b981'
                                  : isFail
                                  ? '#ef4444'
                                  : 'var(--text-secondary)',
                                textTransform: 'capitalize'
                              }}>
                                {session.status.replace(/_/g, ' ')}
                              </span>
                            </div>

                            {isAct ? (
                              <button
                                type="button"
                                onClick={(e) => handleCancelJob(e, session.jobId)}
                                disabled={cancellingJobId === session.jobId}
                                title="Stop Auto Apply for this job"
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '2px',
                                  background: 'transparent',
                                  border: '1px solid var(--border, rgba(255,255,255,0.12))',
                                  color: 'var(--text-secondary)',
                                  borderRadius: '4px',
                                  padding: '0.1rem 0.35rem',
                                  fontSize: '0.68rem',
                                  fontWeight: 600,
                                  cursor: 'pointer',
                                  transition: 'all 0.15s ease',
                                }}
                              >
                                {cancellingJobId === session.jobId ? (
                                  <Loader2 size={11} className="animate-spin" />
                                ) : (
                                  <X size={11} />
                                )}
                                Stop
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={(e) => handleClearJob(e, session.jobId, session.id)}
                                disabled={clearingJobId === session.jobId}
                                title="Clear from queue"
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '2px',
                                  background: 'transparent',
                                  border: '1px solid var(--border, rgba(255,255,255,0.12))',
                                  color: 'var(--text-secondary)',
                                  borderRadius: '4px',
                                  padding: '0.1rem 0.35rem',
                                  fontSize: '0.68rem',
                                  fontWeight: 600,
                                  cursor: 'pointer',
                                  transition: 'all 0.15s ease',
                                }}
                              >
                                {clearingJobId === session.jobId ? (
                                  <Loader2 size={11} className="animate-spin" />
                                ) : (
                                  <Trash2 size={11} />
                                )}
                                Clear
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Right Panel: Contextual Live Status & User Interaction for Selected Job */}
              <div className="drawer-detail-content">
                {hasIntervention && activeIntervention ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', maxWidth: '800px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border, rgba(255,255,255,0.1))', paddingBottom: '0.75rem' }}>
                      <div>
                        <h4 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: '#f59e0b', display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                          <AlertTriangle size={18} /> Action Required for Application
                        </h4>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                          {jobTitle} {companyName ? `at ${companyName}` : ''}
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={handleNavigateToJob}
                        className="btn-outline"
                        style={{ fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.35rem', padding: '0.35rem 0.75rem' }}
                      >
                        <ExternalLink size={14} /> Open Job Details
                      </button>
                    </div>

                    <InterventionPanel
                      interventionId={activeIntervention.id}
                      jobId={selectedSession?.jobId}
                      reason={activeIntervention.reason}
                      description={activeIntervention.description}
                      screenshotUrl={activeIntervention.screenshotUrl}
                      pageUrl={activeIntervention.pageUrl}
                      onResolved={fetchSessions}
                    />
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', maxWidth: '800px' }}>
                    {/* Header with Title & Direct Link */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border, rgba(255,255,255,0.1))', paddingBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                      <div>
                        <h4 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                          {isApplied ? (
                            <>
                              <CheckCircle2 size={18} color="#10b981" /> Application Submitted
                            </>
                          ) : isFailed ? (
                            <>
                              <AlertCircle size={18} color="#ef4444" /> Application Incomplete
                            </>
                          ) : (
                            <>
                              <Loader2 size={18} color="#0070f3" className="animate-spin" /> Auto Apply in Progress
                            </>
                          )}
                        </h4>
                        <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                          {jobTitle} {companyName ? `• ${companyName}` : ''}
                        </span>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          onClick={handleNavigateToJob}
                          style={{
                            fontSize: '0.82rem',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.4rem',
                            padding: '0.45rem 0.9rem',
                            background: '#0070f3',
                            color: '#ffffff',
                            borderRadius: '8px',
                            border: 'none',
                            fontWeight: 600,
                            cursor: 'pointer',
                            boxShadow: '0 2px 8px rgba(0, 112, 243, 0.25)',
                          }}
                        >
                          <ExternalLink size={14} /> View Live Updates & Job
                        </button>

                        {selectedSession && !isApplied && !isFailed && selectedSession.status !== 'cancelled' ? (
                          <button
                            type="button"
                            onClick={(e) => handleCancelJob(e, selectedSession.jobId)}
                            disabled={cancellingJobId === selectedSession.jobId}
                            style={{
                              fontSize: '0.82rem',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.35rem',
                              padding: '0.45rem 0.8rem',
                              border: '1px solid rgba(239, 68, 68, 0.3)',
                              color: '#ef4444',
                              background: 'rgba(239, 68, 68, 0.08)',
                              borderRadius: '8px',
                              fontWeight: 600,
                              cursor: 'pointer',
                            }}
                          >
                            {cancellingJobId === selectedSession.jobId ? (
                              <Loader2 size={13} className="animate-spin" />
                            ) : (
                              <X size={13} />
                            )}
                            Stop Auto Apply
                          </button>
                        ) : selectedSession && (
                          <button
                            type="button"
                            onClick={(e) => handleClearJob(e, selectedSession.jobId, selectedSession.id)}
                            disabled={clearingJobId === selectedSession.jobId}
                            style={{
                              fontSize: '0.82rem',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.35rem',
                              padding: '0.45rem 0.8rem',
                              border: '1px solid var(--border, rgba(255,255,255,0.15))',
                              color: 'var(--text-secondary)',
                              background: 'transparent',
                              borderRadius: '8px',
                              fontWeight: 600,
                              cursor: 'pointer',
                            }}
                          >
                            {clearingJobId === selectedSession.jobId ? (
                              <Loader2 size={13} className="animate-spin" />
                            ) : (
                              <Trash2 size={13} />
                            )}
                            Clear from Queue
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Stepper matching clean system theme */}
                    <div style={{ padding: '0.35rem 0 0.25rem', width: '100%' }}>
                      {/* Track + Nodes */}
                      <div style={{ position: 'relative', height: '24px', width: '100%' }}>
                        {/* Background track */}
                        <div style={{
                          position: 'absolute',
                          top: '50%',
                          transform: 'translateY(-50%)',
                          left: '16px',
                          right: '16px',
                          height: '2px',
                          background: 'var(--border, rgba(255,255,255,0.12))',
                          zIndex: 1,
                        }} />

                        {/* Filled progress line */}
                        <div style={{
                          position: 'absolute',
                          top: '50%',
                          transform: 'translateY(-50%)',
                          left: '16px',
                          width: `calc((100% - 32px) * ${
                            isApplied ? 1
                            : activeStepNum >= 6 ? 1
                            : (activeStepNum - 1) / (STEP_DEFINITIONS.length - 1)
                          })`,
                          height: '2px',
                          background: isApplied
                            ? '#10b981'
                            : isFailed
                            ? '#ef4444'
                            : '#0070f3',
                          transition: 'width 0.4s ease',
                          zIndex: 2,
                        }} />

                        {/* Step nodes */}
                        <div style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          height: '100%',
                          position: 'relative',
                          zIndex: 3,
                        }}>
                          {STEP_DEFINITIONS.map((st) => {
                            const isComplete = isApplied || st.num < activeStepNum;
                            const isCurrent = !isApplied && st.num === activeStepNum;
                            const isFailedStep = isFailed && st.num === activeStepNum;

                            return (
                              <div key={st.num} style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                width: '32px',
                                height: '100%',
                              }}>
                                {isComplete ? (
                                  <div style={{
                                    width: '20px', height: '20px',
                                    borderRadius: '50%',
                                    background: '#10b981',
                                    color: '#ffffff',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    boxShadow: '0 2px 6px rgba(16,185,129,0.3)',
                                    transition: 'all 0.25s ease',
                                  }}>
                                    <Check size={11} strokeWidth={3} />
                                  </div>
                                ) : isFailedStep ? (
                                  <div style={{
                                    width: '20px', height: '20px',
                                    borderRadius: '50%',
                                    background: '#ef4444',
                                    color: '#ffffff',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  }}>
                                    <AlertCircle size={12} />
                                  </div>
                                ) : isCurrent ? (
                                  <div style={{
                                    width: '20px', height: '20px',
                                    borderRadius: '50%',
                                    background: '#0070f3',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    boxShadow: '0 2px 6px rgba(0, 112, 243, 0.3)',
                                    transition: 'all 0.25s ease',
                                  }}>
                                    <div style={{
                                      width: '6px', height: '6px',
                                      borderRadius: '50%',
                                      background: '#ffffff',
                                    }} />
                                  </div>
                                ) : (
                                  <div style={{
                                    width: '8px', height: '8px',
                                    borderRadius: '50%',
                                    background: 'var(--border, rgba(255,255,255,0.2))',
                                    transition: 'all 0.25s ease',
                                  }} />
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* Step labels */}
                      <div className="stepper-labels-row" style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        marginTop: '0.45rem',
                        width: '100%',
                      }}>
                        {STEP_DEFINITIONS.map((st) => {
                          const isComplete = isApplied || st.num < activeStepNum;
                          const isCurrent = !isApplied && st.num === activeStepNum;
                          const isFailedStep = isFailed && st.num === activeStepNum;
                          const isStepActive = st.num === (isApplied ? 6 : activeStepNum);

                          return (
                            <span key={st.num} className={isStepActive ? 'stepper-label-active' : 'stepper-label-inactive'} style={{
                              width: '32px',
                              display: 'flex',
                              justifyContent: 'center',
                              fontSize: '0.62rem',
                              fontWeight: 700,
                              letterSpacing: '0.04em',
                              textTransform: 'uppercase',
                              color: isFailedStep ? '#ef4444' : isComplete ? '#10b981' : isCurrent ? '#0070f3' : 'var(--text-secondary)',
                              whiteSpace: 'nowrap',
                              transition: 'color 0.25s, opacity 0.25s',
                            }}>
                              {st.label}
                            </span>
                          );
                        })}
                      </div>
                    </div>

                    {/* Current Active Step Info Box styled like Connection Instructions Card */}
                    <div style={{
                      background: 'var(--background, rgba(255,255,255,0.02))',
                      border: '1px solid var(--border, rgba(255,255,255,0.08))',
                      borderRadius: '8px',
                      padding: '0.9rem 1.15rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                        <span style={{
                          fontSize: '0.72rem',
                          fontWeight: 700,
                          textTransform: 'uppercase',
                          letterSpacing: '0.05em',
                          color: 'var(--text-secondary, #64748b)',
                        }}>
                          {isApplied ? 'APPLICATION STATUS' : isFailed ? 'APPLICATION STOPPED' : `CURRENT STEP: ${currentStepLabel.toUpperCase()}`}
                        </span>
                        <span style={{ fontSize: '0.85rem', fontWeight: 500, color: 'var(--text-primary)' }}>
                          {isApplied
                            ? 'Your application has been successfully submitted and logged.'
                            : isFailed
                            ? 'The application could not be completed automatically.'
                            : currentStepDesc}
                        </span>
                      </div>
                      <div style={{ flexShrink: 0 }}>
                        {isApplied ? (
                          <CheckCircle2 size={24} color="#10b981" />
                        ) : isFailed ? (
                          <AlertCircle size={22} color="#ef4444" />
                        ) : (
                          <Loader2 size={22} color="#0070f3" className="animate-spin" />
                        )}
                      </div>
                    </div>

                  </div>
                )}
              </div>
            </>
          ) : (
            /* Custom Page Registered Drawer Content */
            <div style={{ padding: '1.25rem', overflowY: 'auto', background: 'var(--bg-primary, #0d1117)', width: '100%', height: '100%' }}>
              {drawerContent}
            </div>
          )}
        </div>
      </div>
        </>
      )}

      {/* ─── Mobile Multi-Button Speed Dial FAB ─── */}
      {!isExpanded && (
        <>
          {/* FAB backdrop */}
          {isFabOpen && (
            <div
              onClick={() => setIsFabOpen(false)}
              style={{
                position: 'fixed',
                inset: 0,
                background: 'rgba(0, 0, 0, 0.45)',
                zIndex: 9955,
              }}
            />
          )}

          {/* Speed Dial Action Items (stacked vertically above FAB) */}
          <div
            className={`mobile-fab-menu ${isFabOpen ? 'open' : ''}`}
            aria-hidden={!isFabOpen}
            style={{
              bottom: hasActiveQueue
                ? 'max(8.5rem, calc(8.25rem + env(safe-area-inset-bottom, 0px)))'
                : 'max(5.25rem, calc(5rem + env(safe-area-inset-bottom, 0px)))',
            }}
          >
            {hasSelection ? (
              <div style={{ display: 'flex', flexDirection: 'column-reverse', alignItems: 'flex-end', gap: '0.65rem' }}>
                <div style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  padding: '0.45rem 0.9rem',
                  borderRadius: '9999px',
                  background: 'rgba(14, 165, 233, 0.18)',
                  border: '1px solid rgba(56, 189, 248, 0.45)',
                  color: '#38bdf8',
                  fontSize: '0.82rem',
                  fontWeight: 700,
                  boxShadow: '0 4px 14px rgba(0, 0, 0, 0.3)',
                  backdropFilter: 'none',
                }}>
                  <CheckCircle2 size={14} color="#38bdf8" />
                  <span>{selectionState?.count} job{(selectionState?.count ?? 0) > 1 ? 's' : ''} selected</span>
                </div>

                {selectionState?.onDeselectAll && (
                  <button
                    type="button"
                    onClick={() => { selectionState.onDeselectAll!(); setIsFabOpen(false); }}
                    className="command-bar-btn"
                  >
                    <span>Deselect All</span>
                  </button>
                )}

                {selectionState?.onArchiveDelete && (
                  <button
                    type="button"
                    onClick={() => { selectionState.onArchiveDelete!(); setIsFabOpen(false); }}
                    className="command-bar-btn command-bar-btn-danger"
                  >
                    <Trash2 size={14} />
                    <span>Archive / Delete</span>
                  </button>
                )}

                {selectionState?.onStartApply && (() => {
                  const isBatchApplying = Boolean(
                    selectionState?.isApplying ||
                    (ongoingCount > 0 && activeSessions.some((s) => s.status !== 'applied' && s.status !== 'failed' && s.status !== 'cancelled' && s.status !== AutoApplyStatus.NEEDS_INTERVENTION && s.status !== AutoApplyStatus.NEEDS_REVIEW))
                  );
                  return (
                    <button
                      type="button"
                      onClick={() => { selectionState.onStartApply!(); setIsFabOpen(false); }}
                      disabled={isBatchApplying}
                      className="command-bar-btn command-bar-btn-primary"
                      style={{ color: '#ffffff', opacity: isBatchApplying ? 0.85 : 1 }}
                    >
                      {isBatchApplying ? (
                        <><Loader2 size={15} color="#ffffff" className="animate-spin" /><span style={{ color: '#ffffff' }}>Auto Applying ({completedCount}/{totalCount || selectionState?.count})...</span></>
                      ) : (
                        <><Bot size={15} color="#ffffff" /><span style={{ color: '#ffffff' }}>1-Click Auto Apply ({selectionState?.count})</span></>
                      )}
                    </button>
                  );
                })()}
              </div>
            ) : pageActions ? (
              /* Page actions rendered in vertical speed dial column */
              <div
                style={{ display: 'flex', flexDirection: 'column-reverse', alignItems: 'flex-end', gap: '0.65rem' }}
                onClick={() => setIsFabOpen(false)}
              >
                {pageActions}
              </div>
            ) : (
              /* Default Quick Actions if no custom page actions registered */
              <div
                style={{ display: 'flex', flexDirection: 'column-reverse', alignItems: 'flex-end', gap: '0.65rem' }}
                onClick={() => setIsFabOpen(false)}
              >
                <button
                  type="button"
                  onClick={() => router.push('/jobs')}
                  className="command-bar-btn command-bar-btn-primary"
                >
                  <Sparkles size={14} />
                  <span>Browse Jobs</span>
                </button>
                {hasActiveQueue && (
                  <button
                    type="button"
                    onClick={handleToggleAutoApplyDrawer}
                    className="command-bar-btn"
                  >
                    <Bot size={14} color="#38bdf8" />
                    <span>Auto Apply Queue ({ongoingCount})</span>
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Main FAB trigger button */}
          <button
            type="button"
            onClick={() => setIsFabOpen((p) => !p)}
            className={`mobile-fab ${isFabOpen ? 'open' : ''} ${hasIntervention ? 'fab-alert' : hasSelection ? 'fab-selection' : ''}`}
            aria-label={isFabOpen ? "Close actions menu" : "Open actions menu"}
            style={{
              bottom: hasActiveQueue
                ? 'max(4.5rem, calc(4.25rem + env(safe-area-inset-bottom, 0px)))'
                : 'max(1.25rem, calc(1rem + env(safe-area-inset-bottom, 0px)))',
            }}
          >
            {isFabOpen ? (
              <X size={22} />
            ) : hasSelection ? (
              <><CheckCircle2 size={18} /><span style={{ fontSize: '0.78rem', fontWeight: 700 }}>{selectionState?.count}</span></>
            ) : (
              <Sparkles size={20} />
            )}
          </button>
        </>
      )}
    </>
  );
}
