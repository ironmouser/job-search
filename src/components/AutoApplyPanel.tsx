"use client";

import { useEffect, useState, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { AutoApplyStatus } from '@/lib/auto-apply/types';
import {
  formatFailureExplanation,
  getFailureTitle,
  getFailureNextSteps,
} from '@/lib/auto-apply/failure-helpers';
import { AutoApplyButton } from './AutoApplyButton';
import { AutoApplyStatusBadge } from './AutoApplyStatusBadge';
import { AutoApplyConfidenceBadge } from './AutoApplyConfidenceBadge';
import { AutoApplyLogViewer } from './AutoApplyLogViewer';
import { InterventionPanel } from './InterventionPanel';
import {
  Bot,
  Building2,
  Clock,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Check,
  Eye,
  X,
  ExternalLink,
  Image as ImageIcon,
  Zap,
  Maximize2,
  ArrowRight,
  ShieldAlert,
  Search,
  FileText,
  SlidersHorizontal,
  ShieldCheck,
  Globe,
} from 'lucide-react';
import { trackAutoApplyAction } from '@/lib/analytics';
import { isAggregatorUrl } from '@/lib/urlUtils';

export interface AutoApplyQuota {
  tier: 'PRO' | 'TRIAL' | 'FREE';
  monthlyLimit: number;
  monthlyUsed: number;
  monthlyRemaining: number;
  dailyLimit: number;
  dailyUsed: number;
  dailyRemaining: number;
  canApply: boolean;
  blockedReason: 'MONTHLY_LIMIT_EXCEEDED' | 'DAILY_LIMIT_EXCEEDED' | 'FREE_TIER' | null;
  dailyResetsAt: string;
  monthlyResetsAt: string;
}

interface AutoApplyPanelProps {
  jobId: string;
  jobUrl: string;
  hasAssets: boolean;
  hasResume?: boolean;
  onApplyManually?: () => void;
  onStatusChange?: (session: SessionData | null, isActive: boolean) => void;
}

interface SessionData {
  id: string;
  status: string;
  atsPlatform?: string | null;
  atsConfidence?: number | null;
  automationConfidence?: number | null;
  simulationMode: boolean;
  currentStep?: string | null;
  stepsCompleted: number;
  stepsTotal?: number | null;
  failureReason?: string | null;
  failureDetails?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  confirmationScreenshotUrl?: string | null;
  confirmationNumber?: string | null;
  submittedAnswersSummary?: Record<string, unknown> | null;
  interventions?: Array<{
    id: string;
    reason: string;
    description: string;
    screenshotUrl?: string | null;
    pageUrl?: string | null;
    resolvedAt?: string | null;
    resolution?: string | null;
    createdAt: string;
  }>;
}

const ACTIVE_STATUSES = new Set([
  AutoApplyStatus.QUEUED,
  AutoApplyStatus.PROCESSING,
  AutoApplyStatus.GENERATING_ASSETS,
  AutoApplyStatus.NAVIGATING_TO_ATS,
  AutoApplyStatus.DETECTING_ATS,
  AutoApplyStatus.PREPARING,
  AutoApplyStatus.APPLYING,
  AutoApplyStatus.VALIDATING,
  AutoApplyStatus.NEEDS_REVIEW,
  AutoApplyStatus.NEEDS_INTERVENTION,
  'queued',
  'processing',
  'generating_assets',
  'navigating_to_ats',
  'detecting_ats',
  'preparing',
  'applying',
  'validating',
  'needs_review',
  'needs_intervention',
]);

const POLL_INTERVAL = 1000;

const STEP_DEFINITIONS = [
  {
    num: 1,
    title: '1. Finding Application',
    desc: 'Locating the direct application form',
    icon: Search,
  },
  {
    num: 2,
    title: '2. Tailoring Assets',
    desc: 'Customizing resume and cover letter',
    icon: FileText,
  },
  {
    num: 3,
    title: '3. Form Mapping',
    desc: 'Filling out application information',
    icon: SlidersHorizontal,
  },
  {
    num: 4,
    title: '4. Screening & Q&A',
    desc: 'Answering required questions',
    icon: ShieldCheck,
  },
  {
    num: 5,
    title: '5. Submission',
    desc: 'Review and submit application',
    icon: CheckCircle2,
  },
];

export function AutoApplyPanel({
  jobId,
  jobUrl,
  hasAssets,
  hasResume,
  onApplyManually,
  onStatusChange,
}: AutoApplyPanelProps) {
  const router = useRouter();
  const { data: authSession } = useSession();
  const userRole = (authSession?.user as any)?.role;
  const isAdmin = userRole === 'SYSTEM_ADMIN' || userRole === 'ORGANIZATION_ADMIN' || userRole === 'ADMIN';

  const [session, setSession] = useState<SessionData | null>(null);
  const [quota, setQuota] = useState<AutoApplyQuota | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [showLogs, setShowLogs] = useState(false);
  const [isScreenshotModalOpen, setIsScreenshotModalOpen] = useState(false);
  const [activeModalScreenshotUrl, setActiveModalScreenshotUrl] = useState<string | null>(null);
  const [isDismissingFailure, setIsDismissingFailure] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const isActive = isStarting || (session ? ACTIVE_STATUSES.has(session.status as AutoApplyStatus) : false);
  const isAggregatorJob = isAggregatorUrl(jobUrl);

  useEffect(() => {
    onStatusChange?.(session, isActive);
  }, [session, isActive, onStatusChange]);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`/api/auto-apply/${jobId}/status`, { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        if (data.session) {
          setSession(data.session);
          setIsStarting(false);
        }
        if (data.quota) {
          setQuota(data.quota);
        }
      }
    } catch {
      // Ignore network errors during polling
    }
  }, [jobId]);

  // Initial load
  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  // Poll while active (every 1 second for live stepper animations)
  useEffect(() => {
    if (!isActive) return;
    const interval = setInterval(fetchStatus, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [isActive, fetchStatus]);

  // When auto-apply succeeds (real or simulation), mark this job for confetti on the dashboard & refresh page
  useEffect(() => {
    if (session?.status === AutoApplyStatus.APPLIED || session?.status === 'applied') {
      trackAutoApplyAction('auto_apply_completed', jobId, { platform: session.atsPlatform });
      sessionStorage.setItem('just_applied_job_id', jobId);
      router.refresh();
    }
  }, [session?.status, jobId, router, session?.atsPlatform]);

  const hasScrolledToIssueRef = useRef(false);
  const lastScrolledInterventionIdRef = useRef<string | null>(null);

  // Scroll directly to intervention / failure issue only when newly presented or visited
  useEffect(() => {
    if (!session) return;
    if (typeof window === 'undefined') return;

    const shouldScroll =
      window.location.search.includes('autoApplyExpand=true') ||
      window.location.hash === '#step-3-apply';

    if (!shouldScroll) return;

    const currentInterventionId = session.interventions?.[0]?.id || null;
    const isNewIntervention = currentInterventionId && currentInterventionId !== lastScrolledInterventionIdRef.current;

    // Only scroll if we haven't scrolled yet on this page visit, or if a brand new intervention was triggered
    if (hasScrolledToIssueRef.current && !isNewIntervention) return;

    const timer = setTimeout(() => {
      const issueElement =
        document.querySelector('[id^="intervention-panel-"]') ||
        document.getElementById('auto-apply-failure-card') ||
        document.getElementById('auto-apply-failure-banner') ||
        document.getElementById('auto-apply-low-confidence-warning') ||
        document.getElementById('step-3-apply');

      if (issueElement) {
        issueElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        hasScrolledToIssueRef.current = true;
        if (currentInterventionId) {
          lastScrolledInterventionIdRef.current = currentInterventionId;
        }
      }
    }, 200);

    return () => clearTimeout(timer);
  }, [session?.status, session?.interventions]);

  // Live intervention check (worker is paused and actively awaiting human help)
  const isLiveIntervention =
    (session?.status === AutoApplyStatus.NEEDS_INTERVENTION ||
      session?.status === 'needs_intervention' ||
      session?.status === AutoApplyStatus.NEEDS_REVIEW ||
      session?.status === 'needs_review') &&
    !!(session?.interventions && session.interventions.length > 0 && !session.interventions[0].resolvedAt);

  const pendingIntervention = isLiveIntervention ? session?.interventions?.[0] : null;

  // Failed or stopped state (worker has completed/aborted without applying)
  const isFailedOrStopped =
    !isLiveIntervention &&
    (session?.status === AutoApplyStatus.FAILED ||
      session?.status === 'failed' ||
      session?.status === AutoApplyStatus.SKIPPED ||
      session?.status === 'skipped');

  const failureScreenshotUrl =
    session?.interventions?.[0]?.screenshotUrl ||
    (session as any)?.screenshotUrl ||
    (session as any)?.confirmationScreenshotUrl ||
    null;

  async function handleDismissFailure() {
    setIsDismissingFailure(true);
    try {
      await fetch(`/api/auto-apply/${jobId}/cancel`, { method: 'POST' });
      setSession((prev) =>
        prev
          ? {
              ...prev,
              status: AutoApplyStatus.CANCELLED,
              failureReason: null,
              failureDetails: null,
              interventions: [],
            }
          : null
      );
      await fetchStatus();
    } catch (e) {
      console.error('Failed to dismiss failure:', e);
    } finally {
      setIsDismissingFailure(false);
    }
  }


  // Determine active step index (1 to 5) and progressive fill percentage (0% to 100%)
  const getProgressState = () => {
    // 1. If actively starting before DB record is created
    if (isStarting) {
      if (!hasAssets) {
        return { step: 2, percent: 25, isDone: false };
      }
      return { step: 1, percent: 15, isDone: false };
    }

    if (!session) return { step: 1, percent: 0, isDone: false };

    const status = session.status as string;

    // 2. Terminal Successful states
    if (status === AutoApplyStatus.APPLIED || status === 'applied' || status === AutoApplyStatus.SIMULATED || status === 'simulated') {
      return { step: 5, percent: 100, isDone: true };
    }

    // 3. Failed / Cancelled states
    if (status === AutoApplyStatus.FAILED || status === 'failed' || status === AutoApplyStatus.CANCELLED || status === 'cancelled') {
      const stepNum = session.stepsCompleted ? Math.min(Math.max(session.stepsCompleted, 1), 5) : 1;
      return { step: stepNum, percent: ((stepNum - 1) / 4) * 100, isDone: false };
    }

    // 4. Interventions & Reviews (Stage 4: Screening Q&A)
    if (status === AutoApplyStatus.NEEDS_INTERVENTION || status === 'needs_intervention' || status === AutoApplyStatus.NEEDS_REVIEW || status === 'needs_review') {
      return { step: 4, percent: 75, isDone: false };
    }

    // 5. Validating submission (Stage 4: Screening Q&A -> validation)
    if (status === AutoApplyStatus.VALIDATING || status === 'validating') {
      return { step: 4, percent: 75, isDone: false };
    }

    // 6. Applying / Form filling (Stage 3: Form Mapping)
    if (status === AutoApplyStatus.APPLYING || status === 'applying') {
      return { step: 3, percent: 50, isDone: false };
    }

    // 7. Asset generation & Preparation (Stage 2: Asset Tailoring)
    if (status === AutoApplyStatus.GENERATING_ASSETS || status === 'generating_assets' || status === AutoApplyStatus.PREPARING || status === 'preparing') {
      return { step: 2, percent: 25, isDone: false };
    }

    // 8. ATS Detection & Navigation (Stage 1: ATS Check)
    if (status === AutoApplyStatus.DETECTING_ATS || status === 'detecting_ats' || status === AutoApplyStatus.NAVIGATING_TO_ATS || status === 'navigating_to_ats') {
      return { step: 1, percent: 15, isDone: false };
    }

    // 9. Processing / Queued
    if (status === AutoApplyStatus.PROCESSING || status === 'processing' || status === AutoApplyStatus.QUEUED || status === 'queued') {
      if (session.currentStep === 'validating_assets' || session.currentStep === 'generating_assets') {
        return { step: 2, percent: 25, isDone: false };
      }
      if (session.currentStep === 'filling_form' || session.currentStep === 'preparing_application') {
        return { step: 3, percent: 50, isDone: false };
      }
      if (session.currentStep === 'screening_questions' || session.currentStep === 'validating_submission') {
        return { step: 4, percent: 75, isDone: false };
      }
      if (session.stepsCompleted && session.stepsCompleted > 1) {
        const stepNum = Math.min(Math.max(session.stepsCompleted, 1), 5);
        return { step: stepNum, percent: ((stepNum - 1) / 4) * 100, isDone: false };
      }
      return { step: 1, percent: 10, isDone: false };
    }

    return { step: 1, percent: 0, isDone: false };
  };

  const { step: activeStepNum, percent: progressPercent, isDone: isAllDone } = getProgressState();

  return (
    <div className="auto-apply-section" id="auto-apply-panel" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* CSS for pulsating current step animation & mobile responsiveness */}
      <style>{`
        @keyframes stepperPulseRing {
          0% {
            box-shadow: 0 0 0 0 rgba(37, 99, 235, 0.7);
          }
          70% {
            box-shadow: 0 0 0 10px rgba(37, 99, 235, 0);
          }
          100% {
            box-shadow: 0 0 0 0 rgba(37, 99, 235, 0);
          }
        }
        @keyframes stepperPulseAmber {
          0% {
            box-shadow: 0 0 0 0 rgba(245, 158, 11, 0.7);
          }
          70% {
            box-shadow: 0 0 0 10px rgba(245, 158, 11, 0);
          }
          100% {
            box-shadow: 0 0 0 0 rgba(245, 158, 11, 0);
          }
        }
        .stepper-active-pulsing {
          animation: stepperPulseRing 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
        }
        .stepper-amber-pulsing {
          animation: stepperPulseAmber 1.8s cubic-bezier(0.4, 0, 0.6, 1) infinite;
        }

        @media (max-width: 639px) {
          .stepper-label-inactive {
            opacity: 0 !important;
            visibility: hidden !important;
          }
        }
      `}</style>

      {/* Status bar - only visible during active execution, intervention, or failed states */}
      {session && session.status !== AutoApplyStatus.APPLIED && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem', fontWeight: 600, fontSize: '0.88rem', color: 'var(--text-primary)' }}>
            <Bot size={16} color="var(--accent-primary, #3b82f6)" />
            <AutoApplyStatusBadge
              status={session.status}
              failureReason={session.failureReason ?? undefined}
              failureDetails={session.failureDetails ?? undefined}
            />
          </span>

          {isActive && session.stepsTotal && (
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              Step {session.stepsCompleted}/{session.stepsTotal}
            </span>
          )}
        </div>
      )}

      {/* 5-Step Process Stepper matching the mockup */}
      <div style={{ padding: '0.75rem 0 0.5rem', width: '100%' }}>
        <div
          style={{
            position: 'relative',
            display: 'grid',
            gridTemplateColumns: 'repeat(5, 1fr)',
            gap: '0.75rem',
            alignItems: 'flex-start',
          }}
        >
          {/* Background Track Line connecting the circles */}
          <div
            style={{
              position: 'absolute',
              top: '21px',
              left: '10%',
              right: '10%',
              height: '2px',
              borderTop: '2px dashed var(--border-glass, rgba(255, 255, 255, 0.15))',
              zIndex: 1,
            }}
          />

          {/* Dynamic Foreground Progress Line */}
          <div
            style={{
              position: 'absolute',
              top: '21px',
              left: '10%',
              width: `calc(80% * ${progressPercent / 100})`,
              height: '2px',
              background:
                session?.status === AutoApplyStatus.FAILED
                  ? '#ef4444'
                  : session?.status === AutoApplyStatus.NEEDS_INTERVENTION || session?.status === AutoApplyStatus.NEEDS_REVIEW
                  ? 'linear-gradient(90deg, var(--accent-primary, #0070f3) 0%, #f59e0b 100%)'
                  : 'linear-gradient(90deg, var(--accent-primary, #0070f3) 0%, #10b981 100%)',
              transition: 'width 0.5s cubic-bezier(0.4, 0, 0.2, 1)',
              zIndex: 2,
            }}
          />

          {STEP_DEFINITIONS.map((st) => {
            const isCompleted = isAllDone || (isActive && st.num < activeStepNum);
            const isCurrent = isActive && st.num === activeStepNum;
            const isIntervention = (session?.status === AutoApplyStatus.NEEDS_INTERVENTION || session?.status === AutoApplyStatus.NEEDS_REVIEW) && st.num === 4;
            const isFailed = session?.status === AutoApplyStatus.FAILED && st.num === activeStepNum;
            const IconComponent = st.icon;

            return (
              <div
                key={st.num}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  textAlign: 'center',
                  position: 'relative',
                  zIndex: 3,
                }}
              >
                {/* Step Icon Circle */}
                <div
                  className={isCurrent ? 'stepper-active-pulsing' : isIntervention ? 'stepper-amber-pulsing' : ''}
                  style={{
                    width: '42px',
                    height: '42px',
                    borderRadius: '50%',
                    background: isCompleted
                      ? 'rgba(16, 185, 129, 0.12)'
                      : isIntervention
                      ? 'rgba(245, 158, 11, 0.12)'
                      : isFailed
                      ? 'rgba(239, 68, 68, 0.12)'
                      : isCurrent
                      ? 'var(--accent-glow, rgba(0, 112, 243, 0.15))'
                      : 'var(--card-header-bg, rgba(255, 255, 255, 0.04))',
                    border: isCompleted
                      ? '2px solid #10b981'
                      : isIntervention
                      ? '2px solid #f59e0b'
                      : isFailed
                      ? '2px solid #ef4444'
                      : isCurrent
                      ? '2px solid var(--accent-primary, #0070f3)'
                      : '1.5px solid var(--border-glass, rgba(255, 255, 255, 0.15))',
                    color: isCompleted
                      ? '#10b981'
                      : isIntervention
                      ? '#f59e0b'
                      : isFailed
                      ? '#ef4444'
                      : isCurrent
                      ? 'var(--accent-primary, #0070f3)'
                      : 'var(--text-secondary, #a3a3a3)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginBottom: '0.5rem',
                    transition: 'all 0.3s ease',
                    boxShadow: isCompleted
                      ? '0 2px 8px rgba(16, 185, 129, 0.25)'
                      : isCurrent
                      ? '0 2px 8px rgba(0, 112, 243, 0.25)'
                      : 'none',
                  }}
                >
                  {isCompleted ? <Check size={18} strokeWidth={2.5} /> : <IconComponent size={18} />}
                </div>

                {/* Step Number & Title */}
                <span
                  style={{
                    fontSize: '0.82rem',
                    fontWeight: isCurrent || isCompleted ? 700 : 600,
                    color: isCompleted
                      ? '#10b981'
                      : isIntervention
                      ? '#f59e0b'
                      : isFailed
                      ? '#ef4444'
                      : isCurrent
                      ? 'var(--accent-primary, #0070f3)'
                      : 'var(--text-primary, #ededed)',
                    marginBottom: '0.2rem',
                    lineHeight: 1.3,
                  }}
                >
                  {st.title}
                </span>

                {/* Step Description */}
                <p
                  style={{
                    margin: 0,
                    fontSize: '0.72rem',
                    color: 'var(--text-secondary, #a3a3a3)',
                    lineHeight: 1.35,
                    maxWidth: '135px',
                  }}
                >
                  {st.desc}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Submission Receipt Card when applied */}
      {session?.status === AutoApplyStatus.APPLIED && (() => {
        const screenshotProofUrl = (session as any)?.confirmationScreenshotUrl || (session as any)?.screenshotUrl || null;
        return (
          <div
            id="auto-apply-success-receipt"
            style={{
              background: 'rgba(16, 185, 129, 0.08)',
              border: '1px solid rgba(16, 185, 129, 0.25)',
              borderRadius: '10px',
              padding: '1.1rem 1.25rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.75rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem', fontWeight: 700, color: '#10b981', fontSize: '0.95rem' }}>
                <CheckCircle2 size={19} /> Application Submitted Successfully
              </span>
              {session.completedAt && (
                <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                  <Clock size={12} /> {new Date(session.completedAt).toLocaleString()}
                </span>
              )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.5rem', fontSize: '0.8rem', color: 'var(--text-secondary)', background: 'var(--bg-primary)', padding: '0.75rem', borderRadius: '6px', border: '1px solid var(--border-glass)' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <CheckCircle2 size={14} color="#10b981" /> Tailored Resume Attached
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <CheckCircle2 size={14} color="#10b981" /> Cover Letter Submitted
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <CheckCircle2 size={14} color="#10b981" /> Work Auth & Profile Mapped
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <CheckCircle2 size={14} color="#10b981" /> EEOC Demographics Complete
              </span>
              {screenshotProofUrl ? (
                <button
                  type="button"
                  onClick={() => {
                    setActiveModalScreenshotUrl(screenshotProofUrl);
                    setIsScreenshotModalOpen(true);
                  }}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.35rem',
                    background: 'none',
                    border: 'none',
                    padding: 0,
                    color: '#2563eb',
                    fontWeight: 600,
                    fontSize: '0.8rem',
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                  title="View Confirmation Screenshot Proof"
                >
                  <CheckCircle2 size={14} color="#10b981" />
                  <span style={{ textDecoration: 'underline', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                    View Confirmation Screenshot <Eye size={12} />
                  </span>
                </button>
              ) : (
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <CheckCircle2 size={14} color="#10b981" /> Confirmation Receipt Verified
                </span>
              )}
            </div>

            {screenshotProofUrl && (
              <div style={{ marginTop: '0.4rem', display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
                  <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary, #475569)', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    <ImageIcon size={14} /> Submission Confirmation Proof:
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveModalScreenshotUrl(screenshotProofUrl);
                      setIsScreenshotModalOpen(true);
                    }}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.35rem',
                      fontSize: '0.78rem',
                      fontWeight: 600,
                      padding: '0.3rem 0.7rem',
                      borderRadius: '6px',
                      border: '1px solid #10b981',
                      background: 'rgba(16, 185, 129, 0.12)',
                      color: '#059669',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                    }}
                  >
                    <Eye size={13} /> View Confirmation Screenshot
                  </button>
                </div>

                <div
                  onClick={() => {
                    setActiveModalScreenshotUrl(screenshotProofUrl);
                    setIsScreenshotModalOpen(true);
                  }}
                  title="Click to view full screenshot proof"
                  style={{
                    cursor: 'pointer',
                    position: 'relative',
                    borderRadius: '6px',
                    overflow: 'hidden',
                    border: '1px solid var(--border-glass, #e2e8f0)',
                    maxHeight: '180px',
                    background: '#000000',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <img
                    src={screenshotProofUrl}
                    alt="Submission confirmation screenshot proof"
                    style={{ maxHeight: '180px', width: '100%', objectFit: 'contain' }}
                  />
                  <div
                    style={{
                      position: 'absolute',
                      bottom: '8px',
                      right: '8px',
                      background: 'rgba(0, 0, 0, 0.75)',
                      color: '#ffffff',
                      padding: '3px 8px',
                      borderRadius: '4px',
                      fontSize: '0.72rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      fontWeight: 500,
                    }}
                  >
                    <Eye size={12} /> Click to enlarge
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* Screenshot Focus Fullscreen Modal Portal */}
      {mounted && isScreenshotModalOpen && activeModalScreenshotUrl && createPortal(
        <div
          style={{
            position: 'fixed',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            background: 'rgba(0, 0, 0, 0.75)',
            padding: '1.25rem',
          }}
          onClick={() => setIsScreenshotModalOpen(false)}
        >
          <div
            style={{
              background: 'var(--bg-primary, #ffffff)',
              color: 'var(--text-primary, #0f172a)',
              borderRadius: '12px',
              maxWidth: '960px',
              width: '100%',
              maxHeight: '90vh',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.5)',
              border: '1px solid var(--border-glass, #334155)',
              overflow: 'hidden',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0.9rem 1.25rem',
                borderBottom: '1px solid var(--border-glass, #e2e8f0)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                <ImageIcon size={18} color="#2563eb" />
                <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>Bot Screen Capture</span>
                {session?.completedAt && (
                  <span style={{ fontSize: '0.78rem', color: 'var(--text-muted, #64748b)' }}>
                    • {new Date(session.completedAt).toLocaleString()}
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <a
                  href={activeModalScreenshotUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.35rem',
                    fontSize: '0.8rem',
                    color: '#2563eb',
                    textDecoration: 'none',
                    fontWeight: 600,
                  }}
                >
                  <ExternalLink size={14} /> Open Full Size
                </a>
                <button
                  onClick={() => setIsScreenshotModalOpen(false)}
                  aria-label="Close screenshot modal"
                  style={{
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'var(--text-secondary, #64748b)',
                    padding: '4px',
                    borderRadius: '6px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* Modal Image Body */}
            <div
              style={{
                padding: '1rem',
                overflowY: 'auto',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                background: '#090d16',
                flex: 1,
                maxHeight: 'calc(90vh - 70px)',
              }}
            >
              <img
                src={activeModalScreenshotUrl}
                alt="Bot screenshot capture full resolution"
                style={{
                  maxWidth: '100%',
                  maxHeight: 'calc(90vh - 100px)',
                  height: 'auto',
                  borderRadius: '6px',
                  objectFit: 'contain',
                  boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.4)',
                }}
              />
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Auto Apply Did Not Finish Card (Failure, Incomplete, & Intervention Timeout) */}
      {isFailedOrStopped && (
        <div
          id="auto-apply-failure-card"
          style={{
            background: 'rgba(239, 68, 68, 0.05)',
            border: '1.5px solid rgba(239, 68, 68, 0.3)',
            borderRadius: '12px',
            padding: '1.25rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '1rem',
            boxShadow: '0 4px 16px rgba(0, 0, 0, 0.1)',
          }}
        >
          {/* Header Row */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <AlertCircle size={19} color="#ef4444" style={{ flexShrink: 0 }} />
              <span style={{ fontWeight: 700, color: '#ef4444', fontSize: '0.95rem' }}>
                Auto Apply Did Not Finish
              </span>
            </div>
            <span
              style={{
                fontSize: '0.75rem',
                fontWeight: 600,
                color: '#f87171',
                background: 'rgba(239, 68, 68, 0.12)',
                border: '1px solid rgba(239, 68, 68, 0.25)',
                padding: '2px 8px',
                borderRadius: '4px',
              }}
            >
              {getFailureTitle(session?.failureReason, session?.failureDetails)}
            </span>
          </div>

          {/* Explanation Text */}
          <p style={{ margin: 0, fontSize: '0.88rem', color: 'var(--text-primary)', lineHeight: 1.5, fontWeight: 500 }}>
            {formatFailureExplanation(session?.failureReason, session?.failureDetails)}
          </p>

          {/* Screenshot Preview (if captured) */}
          {failureScreenshotUrl && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
                <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <ImageIcon size={14} /> Bot Captured Screen
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setActiveModalScreenshotUrl(failureScreenshotUrl);
                    setIsScreenshotModalOpen(true);
                  }}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.35rem',
                    fontSize: '0.78rem',
                    fontWeight: 600,
                    padding: '0.3rem 0.65rem',
                    borderRadius: '6px',
                    border: '1px solid var(--border-glass)',
                    background: 'var(--bg-primary)',
                    color: 'var(--text-primary)',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                  }}
                  title="View larger screenshot in focus modal"
                >
                  <Maximize2 size={13} />
                  <span>View Larger Screenshot</span>
                </button>
              </div>

              <div
                onClick={() => {
                  setActiveModalScreenshotUrl(failureScreenshotUrl);
                  setIsScreenshotModalOpen(true);
                }}
                style={{
                  position: 'relative',
                  borderRadius: '8px',
                  overflow: 'hidden',
                  border: '1px solid var(--border-glass)',
                  background: '#090d16',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  maxHeight: '200px',
                }}
                title="Click to enlarge screenshot"
              >
                <img
                  src={failureScreenshotUrl}
                  alt="Application screen captured when auto apply stopped"
                  style={{ maxHeight: '200px', width: '100%', objectFit: 'contain', display: 'block' }}
                />
                <div
                  style={{
                    position: 'absolute',
                    bottom: '8px',
                    right: '8px',
                    background: 'rgba(0, 0, 0, 0.75)',
                    color: '#ffffff',
                    padding: '3px 8px',
                    borderRadius: '4px',
                    fontSize: '0.72rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    fontWeight: 500,
                    pointerEvents: 'none',
                  }}
                >
                  <Maximize2 size={12} />
                  <span>Click to enlarge</span>
                </div>
              </div>
            </div>
          )}

          {/* What is Required If Trying Again Box */}
          <div
            style={{
              background: 'var(--bg-primary, #ffffff)',
              border: '1px solid var(--border-glass, #e2e8f0)',
              borderRadius: '8px',
              padding: '0.85rem 1rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.5rem',
              fontSize: '0.84rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 600, color: 'var(--text-primary)' }}>
              <ArrowRight size={15} color="#2563eb" />
              <span>What is required if you decide to try again</span>
            </div>
            <ul style={{ margin: 0, paddingLeft: '1.2rem', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '0.3rem', lineHeight: 1.45 }}>
              {getFailureNextSteps(session?.failureReason, session?.failureDetails).map((step, idx) => (
                <li key={idx}>{step}</li>
              ))}
            </ul>
          </div>

          {/* Action Buttons: Try Again, Finish Manually, Cancel Auto Apply */}
          <div className="auto-apply-button-group" style={{ display: 'flex', gap: '0.65rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ flex: '2 1 200px' }}>
              <AutoApplyButton
                jobId={jobId}
                jobUrl={jobUrl}
                hasAssets={hasAssets}
                hasResume={hasResume}
                currentStatus={null}
                isAggregatorJob={isAggregatorJob}
                quota={quota}
                onSessionStarted={() => fetchStatus()}
                onStartingChange={(starting) => setIsStarting(starting)}
              />
            </div>

            {jobUrl && (
              <button
                type="button"
                className="btn-outline"
                onClick={() => window.open(jobUrl, '_blank', 'noopener,noreferrer')}
                style={{
                  flex: '1 1 140px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.4rem',
                  padding: '0.7rem 1rem',
                  fontSize: '0.86rem',
                  fontWeight: 600,
                  borderRadius: '8px',
                  border: '1px solid var(--border-glass)',
                  color: 'var(--text-primary)',
                  background: 'var(--bg-primary)',
                  cursor: 'pointer',
                }}
                title="Open job posting in browser to finish manually"
              >
                <ExternalLink size={15} /> Finish Manually
              </button>
            )}

            <button
              type="button"
              className="btn-outline"
              onClick={handleDismissFailure}
              disabled={isDismissingFailure}
              style={{
                flex: '1 1 120px',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.35rem',
                padding: '0.7rem 1rem',
                fontSize: '0.86rem',
                fontWeight: 600,
                borderRadius: '8px',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                color: '#f87171',
                background: 'rgba(239, 68, 68, 0.06)',
                cursor: isDismissingFailure ? 'not-allowed' : 'pointer',
              }}
              title="Cancel and remove this failure message"
            >
              {isDismissingFailure ? <Loader2 size={14} className="animate-spin" /> : <X size={15} />}
              <span>Cancel Auto Apply</span>
            </button>
          </div>
        </div>
      )}

      {/* Active Live Intervention Panel (when worker is running and waiting for user input) */}
      {isLiveIntervention && pendingIntervention && (
        <div style={{ margin: '0.25rem 0' }}>
          <InterventionPanel
            interventionId={pendingIntervention.id}
            jobId={jobId}
            reason={pendingIntervention.reason}
            description={pendingIntervention.description}
            screenshotUrl={pendingIntervention.screenshotUrl}
            pageUrl={pendingIntervention.pageUrl}
            onResolved={fetchStatus}
          />
        </div>
      )}

      {/* Auto Apply Quota Display & Rate Limit Banners */}
      {quota && (
        <div
          id={`auto-apply-quota-bar-${jobId}`}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '0.75rem',
            flexWrap: 'wrap',
            padding: '0.75rem 1rem',
            borderRadius: '8px',
            background: 'var(--bg-secondary, rgba(255, 255, 255, 0.03))',
            border: '1px solid var(--border-glass, rgba(255, 255, 255, 0.08))',
            fontSize: '0.85rem',
            color: 'var(--text-secondary, #a3a3a3)',
            marginTop: '0.25rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <Zap size={15} color="#f59e0b" fill="currentColor" />
            <span style={{ fontWeight: 600, color: 'var(--text-primary, #ededed)' }}>
              {quota.tier === 'FREE' ? 0 : quota.monthlyRemaining} of {quota.monthlyLimit || 150} auto-applies remaining this month
            </span>
            {quota.dailyRemaining < quota.dailyLimit && quota.dailyRemaining > 0 && (
              <span style={{ color: 'var(--text-muted, #737373)', fontSize: '0.8rem' }}>
                {quota.dailyRemaining} left today • Resets midnight UTC
              </span>
            )}
          </div>
        </div>
      )}

      {quota?.blockedReason === 'DAILY_LIMIT_EXCEEDED' && (
        <div
          id="auto-apply-daily-limit-banner"
          style={{
            background: 'rgba(245, 158, 11, 0.08)',
            border: '1px solid rgba(245, 158, 11, 0.3)',
            borderRadius: '8px',
            padding: '0.75rem 0.95rem',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '0.6rem',
            fontSize: '0.84rem',
            color: 'var(--text-primary)',
            marginTop: '0.35rem',
            marginBottom: '0.25rem',
          }}
        >
          <Zap size={17} color="#f59e0b" style={{ flexShrink: 0, marginTop: '2px' }} />
          <div>
            <strong style={{ color: '#d97706', display: 'block', marginBottom: '0.15rem' }}>Daily Safety Limit Reached (15/15)</strong>
            <span>Your daily velocity limit is reached to protect your monthly allowance. Resets tonight at midnight UTC. You still have <strong>{quota.monthlyRemaining}</strong> applications remaining this month.</span>
          </div>
        </div>
      )}

      {quota?.blockedReason === 'MONTHLY_LIMIT_EXCEEDED' && (
        <div
          id="auto-apply-monthly-limit-banner"
          style={{
            background: 'rgba(239, 68, 68, 0.08)',
            border: '1px solid rgba(239, 68, 68, 0.25)',
            borderRadius: '8px',
            padding: '0.75rem 0.95rem',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '0.6rem',
            fontSize: '0.84rem',
            color: 'var(--text-primary)',
            marginTop: '0.35rem',
            marginBottom: '0.25rem',
          }}
        >
          <AlertCircle size={17} color="#ef4444" style={{ flexShrink: 0, marginTop: '2px' }} />
          <div>
            <strong style={{ color: '#ef4444', display: 'block', marginBottom: '0.15rem' }}>Monthly Allowance Reached ({quota.monthlyLimit}/{quota.monthlyLimit})</strong>
            <span>You have used all {quota.monthlyLimit} automated applications for this billing period. Quota resets on {new Date(quota.monthlyResetsAt).toLocaleDateString()}.</span>
          </div>
        </div>
      )}

      {/* Default Auto Apply button (start / cancel) + Manual Apply button */}
      {!isLiveIntervention && !isFailedOrStopped && (
        <div
          className="auto-apply-button-group"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '0.75rem',
            flexWrap: 'wrap',
            marginTop: '0.35rem',
          }}
        >
          <AutoApplyButton
            jobId={jobId}
            jobUrl={jobUrl}
            hasAssets={hasAssets}
            hasResume={hasResume}
            currentStatus={session?.status}
            isAggregatorJob={isAggregatorJob}
            quota={quota}
            buttonText="Start Auto Apply"
            onSessionStarted={() => fetchStatus()}
            onStartingChange={(starting) => setIsStarting(starting)}
          />

          {onApplyManually && (
            <button
              type="button"
              onClick={onApplyManually}
              className="btn-outline full-width-mobile"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.45rem',
                padding: '0.7rem 1.25rem',
                borderRadius: '8px',
                fontSize: '0.88rem',
                fontWeight: 600,
                cursor: 'pointer',
                background: 'transparent',
                border: '1px solid var(--border-glass, rgba(255, 255, 255, 0.15))',
                color: 'var(--text-primary, #ededed)',
                transition: 'all 0.2s ease',
              }}
            >
              <Globe size={16} /> Apply Manually Instead
            </button>
          )}
        </div>
      )}


      {/* Log viewer toggle — ONLY for admins */}
      {isAdmin && session && (
        <div style={{ marginTop: '0.25rem' }}>
          <button
            onClick={() => setShowLogs((v) => !v)}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--text-muted)',
              fontSize: '0.75rem',
              padding: '0.2rem 0',
              display: 'flex',
              alignItems: 'center',
              gap: '0.25rem',
            }}
            id={`toggle-logs-${jobId}`}
          >
            {showLogs ? '▲' : '▼'} Execution Logs (Admin Only)
          </button>
          {showLogs && (
            <div style={{ marginTop: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', gap: '0.75rem', flexWrap: 'wrap', background: 'var(--bg-primary)', padding: '0.5rem 0.75rem', borderRadius: '6px', border: '1px solid var(--border-glass)' }}>
                {session.atsPlatform && session.atsPlatform !== 'unknown' && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                    <Building2 size={13} /> {session.atsPlatform.charAt(0).toUpperCase() + session.atsPlatform.slice(1)}
                  </span>
                )}
                {session.completedAt && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                    <Clock size={13} /> {new Date(session.completedAt).toLocaleString()}
                  </span>
                )}
                {session.failureDetails && (
                  <span style={{ color: '#ef4444' }} title={session.failureDetails}>
                    {session.failureDetails.length > 60 ? session.failureDetails.slice(0, 57) + '...' : session.failureDetails}
                  </span>
                )}
              </div>
              <AutoApplyLogViewer
                jobId={jobId}
                sessionId={session.id}
                isActive={isActive}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
