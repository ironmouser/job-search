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
  Building2,
  CheckCircle2,
  AlertCircle,
  X,
  ListOrdered,
  Trash2,
  Plus,
  Sparkles,
  ShieldCheck,
  Check,
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
  const [isDismissed, setIsDismissed] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState('220px');

  // Track sidebar width dynamically (expanded 220px vs collapsed 64px)
  useEffect(() => {
    const updateSidebarWidth = () => {
      if (typeof window === 'undefined') return;
      const isMinimized = localStorage.getItem('sidebarMinimized') === 'true';
      const isMobile = window.innerWidth <= 1024;
      const width = isMobile ? '0px' : isMinimized ? '64px' : '220px';
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

  const [cancellingJobId, setCancellingJobId] = useState<string | null>(null);

  const handleCancelJob = async (e: React.MouseEvent, jobId: string) => {
    e.stopPropagation();
    setCancellingJobId(jobId);
    try {
      await fetch(`/api/auto-apply/${jobId}/cancel`, { method: 'POST' });
      await fetchSessions();
    } catch (err) {
      console.error('Failed to cancel auto apply session:', err);
    } finally {
      setCancellingJobId(null);
    }
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

  return (
    <>
      {/* Semi-transparent dark cover overlay when expanded */}
      {isExpanded && (
        <div
          onClick={() => {
            setIsExpanded(false);
            setActiveDrawerTab(null);
          }}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.6)',
            zIndex: 9940,
            cursor: 'pointer',
            transition: 'opacity 0.2s ease',
          }}
          aria-label="Close expanded command bar"
          title="Click to minimize command bar"
        />
      )}

      <div
        id="global-command-bar"
        className={`global-auto-apply-bar ${isExpanded ? 'expanded' : 'collapsed'}`}
        style={{
          left: sidebarWidth,
          height: isExpanded ? '440px' : '52px',
          maxHeight: '82vh',
        }}
      >
      {/* ─── Compact Command Bar Header (52px) ─── */}
      <div className="auto-apply-bar-header">
        {/* LEFT SECTION: Page Actions OR Batch Selection */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', minWidth: 0, flex: 1, overflowX: 'auto' }}>
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

        {/* RIGHT SECTION: Global Background Auto Apply Status & Drawer Toggle */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexShrink: 0 }}>
          {hasActiveQueue ? (
            /* Active / Recent Queue Pill */
            <div
              onClick={handleToggleAutoApplyDrawer}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                background: hasIntervention
                  ? '#2d1a04'
                  : ongoingCount > 0
                  ? '#0d2847'
                  : '#062d1d',
                border: `1.5px solid ${hasIntervention ? '#f59e0b' : ongoingCount > 0 ? '#3b82f6' : '#10b981'}`,
                borderRadius: '8px',
                padding: '0.3rem 0.75rem',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                boxShadow: ongoingCount > 0 ? '0 0 12px rgba(59, 130, 246, 0.3)' : 'none',
              }}
              title="Click to view live application progress and queue"
            >
              {hasIntervention ? (
                <AlertTriangle size={15} color="#fbbf24" className="animate-pulse" />
              ) : ongoingCount > 0 ? (
                <Loader2 size={15} color="#60a5fa" className="animate-spin" />
              ) : (
                <CheckCircle2 size={15} color="#34d399" />
              )}

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <span style={{
                  fontSize: '0.8rem',
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

                {selectedSession?.job?.company && (
                  <span style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'none' }} className="md-inline-flex">
                    • {selectedSession.job.company}
                  </span>
                )}
              </div>

              <span style={{
                fontSize: '0.75rem',
                color: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                gap: '0.15rem',
                borderLeft: '1px solid rgba(255, 255, 255, 0.25)',
                paddingLeft: '0.45rem',
                fontWeight: 600,
              }}>
                {isExpanded && activeDrawerTab === 'auto-apply' ? (
                  <>
                    <span>Close</span>
                    <ChevronDown size={14} />
                  </>
                ) : (
                  <>
                    <span>Live</span>
                    <ChevronUp size={14} />
                  </>
                )}
              </span>
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
      {isExpanded && (
        <div className="auto-apply-bar-body" style={{ overflowY: 'auto' }}>
          {activeDrawerTab === 'auto-apply' && hasActiveQueue ? (
            <>
              {/* Left Panel: Queue List matching System Analytics style */}
              <div className="drawer-queue-sidebar">
                <div className="drawer-queue-header">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                    <ListOrdered size={14} color="var(--accent-primary, #818cf8)" />
                    <span>QUEUE ({activeSessions.length})</span>
                  </div>
                  <span style={{
                    background: 'rgba(99, 102, 241, 0.15)',
                    color: '#818cf8',
                    padding: '0.15rem 0.55rem',
                    borderRadius: '9999px',
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    border: '1px solid rgba(99, 102, 241, 0.3)',
                  }}>
                    {ongoingCount} Active
                  </span>
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
                            color: isSel ? '#818cf8' : 'var(--text-primary)',
                          }}>
                            {session.job?.title || 'Job Application'}
                          </span>
                          {isInter ? (
                            <AlertTriangle size={14} color="#fbbf24" className="animate-pulse" />
                          ) : isAct ? (
                            <Loader2 size={14} color="#818cf8" className="animate-spin" />
                          ) : isApp ? (
                            <CheckCircle2 size={14} color="#34d399" />
                          ) : (
                            <AlertCircle size={14} color="#f87171" />
                          )}
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.74rem', gap: '0.4rem' }}>
                          <span style={{ color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '130px' }}>
                            {session.job?.company || ''}
                          </span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexShrink: 0 }}>
                            <span style={{
                              fontWeight: 700,
                              fontSize: '0.68rem',
                              padding: '0.1rem 0.45rem',
                              borderRadius: '9999px',
                              textTransform: 'capitalize',
                              background: isInter
                                ? 'rgba(245, 158, 11, 0.15)'
                                : isApp
                                ? 'rgba(16, 185, 129, 0.15)'
                                : isFail
                                ? 'rgba(239, 68, 68, 0.15)'
                                : 'rgba(99, 102, 241, 0.15)',
                              color: isInter
                                ? '#fbbf24'
                                : isApp
                                ? '#34d399'
                                : isFail
                                ? '#f87171'
                                : '#818cf8',
                              border: `1px solid ${
                                isInter
                                  ? 'rgba(245, 158, 11, 0.35)'
                                  : isApp
                                  ? 'rgba(16, 185, 129, 0.35)'
                                  : isFail
                                  ? 'rgba(239, 68, 68, 0.35)'
                                  : 'rgba(99, 102, 241, 0.35)'
                              }`,
                            }}>
                              {session.status.replace(/_/g, ' ')}
                            </span>

                            {isAct && (
                              <button
                                type="button"
                                onClick={(e) => handleCancelJob(e, session.jobId)}
                                disabled={cancellingJobId === session.jobId}
                                title="Stop Auto Apply for this job"
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '2px',
                                  background: 'rgba(239, 68, 68, 0.12)',
                                  border: '1px solid rgba(239, 68, 68, 0.3)',
                                  color: '#f87171',
                                  borderRadius: '4px',
                                  padding: '0.12rem 0.35rem',
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
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-glass)', paddingBottom: '0.75rem' }}>
                      <div>
                        <h4 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: '#fbbf24', display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
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
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                    {/* Header with Title & Direct Link */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-glass)', paddingBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
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
                              <Sparkles size={18} color="#818cf8" /> Auto Apply in Progress
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
                          className="btn-primary"
                          style={{
                            fontSize: '0.82rem',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.4rem',
                            padding: '0.45rem 0.9rem',
                            background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
                            boxShadow: '0 4px 12px rgba(99, 102, 241, 0.3)',
                          }}
                        >
                          <ExternalLink size={14} /> View Live Updates & Job
                        </button>

                        {selectedSession && !isApplied && !isFailed && selectedSession.status !== 'cancelled' && (
                          <button
                            type="button"
                            onClick={(e) => handleCancelJob(e, selectedSession.jobId)}
                            disabled={cancellingJobId === selectedSession.jobId}
                            className="btn-outline"
                            style={{
                              fontSize: '0.82rem',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.35rem',
                              padding: '0.45rem 0.8rem',
                              borderColor: 'rgba(239, 68, 68, 0.35)',
                              color: '#f87171',
                              background: 'rgba(239, 68, 68, 0.08)',
                            }}
                          >
                            {cancellingJobId === selectedSession.jobId ? (
                              <Loader2 size={13} className="animate-spin" />
                            ) : (
                              <X size={13} />
                            )}
                            Stop Auto Apply
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Sleek Minimal Stepper — matches AutoApplyPanel & System Analytics */}
                    <style>{`
                      @keyframes gbarStepperPulseRing {
                        0% { box-shadow: 0 0 0 0 rgba(99, 102, 241, 0.7); }
                        70% { box-shadow: 0 0 0 10px rgba(99, 102, 241, 0); }
                        100% { box-shadow: 0 0 0 0 rgba(99, 102, 241, 0); }
                      }
                      @keyframes gbarStepperPulseAmber {
                        0% { box-shadow: 0 0 0 0 rgba(245, 158, 11, 0.7); }
                        70% { box-shadow: 0 0 0 10px rgba(245, 158, 11, 0); }
                        100% { box-shadow: 0 0 0 0 rgba(245, 158, 11, 0); }
                      }
                      .gbar-stepper-active { animation: gbarStepperPulseRing 2s cubic-bezier(0.4, 0, 0.6, 1) infinite; }
                      .gbar-stepper-amber  { animation: gbarStepperPulseAmber 1.8s cubic-bezier(0.4, 0, 0.6, 1) infinite; }
                    `}</style>

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
                          background: 'var(--border-glass, rgba(255,255,255,0.12))',
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
                            ? 'linear-gradient(90deg, #6366f1 0%, #3b82f6 50%, #10b981 100%)'
                            : isFailed
                            ? '#ef4444'
                            : 'linear-gradient(90deg, #6366f1 0%, #3b82f6 50%, #10b981 100%)',
                          transition: 'width 0.5s cubic-bezier(0.4, 0, 0.2, 1)',
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
                                    width: '22px', height: '22px',
                                    borderRadius: '50%',
                                    background: '#10b981',
                                    color: '#ffffff',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    boxShadow: '0 2px 6px rgba(16,185,129,0.4)',
                                    transition: 'all 0.3s ease',
                                  }}>
                                    <Check size={12} strokeWidth={3} />
                                  </div>
                                ) : isFailedStep ? (
                                  <div style={{
                                    width: '22px', height: '22px',
                                    borderRadius: '50%',
                                    background: '#ef4444',
                                    color: '#ffffff',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  }}>
                                    <AlertCircle size={13} />
                                  </div>
                                ) : isCurrent ? (
                                  <div className="gbar-stepper-active" style={{
                                    width: '22px', height: '22px',
                                    borderRadius: '50%',
                                    background: '#6366f1',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    transition: 'all 0.3s ease',
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
                                    background: 'var(--border-glass, rgba(255,255,255,0.2))',
                                    border: '1px solid var(--border-glass, rgba(255,255,255,0.15))',
                                    transition: 'all 0.3s ease',
                                  }} />
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* Step labels */}
                      <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        marginTop: '0.45rem',
                        width: '100%',
                      }}>
                        {STEP_DEFINITIONS.map((st) => {
                          const isComplete = isApplied || st.num < activeStepNum;
                          const isCurrent = !isApplied && st.num === activeStepNum;
                          return (
                            <span key={st.num} style={{
                              width: '32px',
                              display: 'flex',
                              justifyContent: 'center',
                              fontSize: '0.62rem',
                              fontWeight: 700,
                              letterSpacing: '0.04em',
                              textTransform: 'uppercase',
                              color: isComplete ? '#10b981' : isCurrent ? '#818cf8' : 'var(--text-secondary)',
                              whiteSpace: 'nowrap',
                              transition: 'color 0.3s',
                            }}>
                              {st.label}
                            </span>
                          );
                        })}
                      </div>
                    </div>

                    {/* Current Active Step Info Box styled like System Analytics card */}
                    <div style={{
                      background: isApplied
                        ? 'rgba(16, 185, 129, 0.08)'
                        : isFailed
                        ? 'rgba(239, 68, 68, 0.08)'
                        : 'rgba(99, 102, 241, 0.08)',
                      border: `1px solid ${isApplied ? 'rgba(16,185,129,0.25)' : isFailed ? 'rgba(239,68,68,0.25)' : 'rgba(99,102,241,0.25)'}`,
                      borderRadius: '10px',
                      padding: '0.9rem 1.15rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                        <span style={{
                          fontSize: '0.72rem',
                          fontWeight: 700,
                          textTransform: 'uppercase',
                          letterSpacing: '0.05em',
                          color: isApplied ? '#34d399' : isFailed ? '#f87171' : '#818cf8',
                        }}>
                          {isApplied ? 'Application Status' : isFailed ? 'Application Stopped' : `Current Step: ${currentStepLabel}`}
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
                          <ShieldCheck size={26} color="#10b981" />
                        ) : isFailed ? (
                          <AlertCircle size={22} color="#f87171" />
                        ) : (
                          <Loader2 size={22} color="#818cf8" className="animate-spin" />
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
      )}
    </div>
    </>
  );
}
