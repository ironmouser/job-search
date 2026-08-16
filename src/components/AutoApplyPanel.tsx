"use client";

import { useEffect, useState, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { AutoApplyStatus } from '@/lib/auto-apply/types';
import { formatFailureExplanation } from '@/lib/auto-apply/failure-helpers';
import { AutoApplyButton } from './AutoApplyButton';
import { AutoApplyStatusBadge } from './AutoApplyStatusBadge';
import { AutoApplyConfidenceBadge } from './AutoApplyConfidenceBadge';
import { AutoApplyLogViewer } from './AutoApplyLogViewer';
import { InterventionPanel } from './InterventionPanel';
import { Bot, Building2, Clock, CheckCircle2, AlertCircle, Loader2, Check } from 'lucide-react';
import { trackAutoApplyAction } from '@/lib/analytics';

interface AutoApplyPanelProps {
  jobId: string;
  jobUrl: string;
  hasAssets: boolean;
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
  { num: 1, label: 'ATS CHECK' },
  { num: 2, label: 'ASSET TAILORING' },
  { num: 3, label: 'FORM MAPPING' },
  { num: 4, label: 'SCREENING Q&A' },
  { num: 5, label: 'SUBMISSION' },
];

export function AutoApplyPanel({ jobId, jobUrl, hasAssets }: AutoApplyPanelProps) {
  const router = useRouter();
  const { data: authSession } = useSession();
  const userRole = (authSession?.user as any)?.role;
  const isAdmin = userRole === 'SYSTEM_ADMIN' || userRole === 'ORGANIZATION_ADMIN' || userRole === 'ADMIN';

  const [session, setSession] = useState<SessionData | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [showLogs, setShowLogs] = useState(false);
  const [bgConfidence, setBgConfidence] = useState<{ platform: string; confidence: number } | null>(null);

  const isActive = isStarting || (session ? ACTIVE_STATUSES.has(session.status as AutoApplyStatus) : false);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`/api/auto-apply/${jobId}/status`, { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        if (data.session) {
          setSession(data.session);
          setIsStarting(false);
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

  // Background confidence calculation
  useEffect(() => {
    if (!jobUrl) return;
    let isMounted = true;

    fetch('/api/auto-apply/detect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobUrl }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (!isMounted) return;
        return fetch('/api/auto-apply/confidence', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            platform: d.platform,
            requiresLogin: false,
            hasResumeUpload: true,
            hasCoverLetterUpload: true,
            hasCaptcha: false,
            hasAssessments: false,
            hasDynamicQuestionnaire: false,
            hasWorkAuthQuestions: true,
            hasSalaryQuestions: false,
            previousSuccessRate: 0,
          }),
        })
          .then((r) => r.json())
          .then((conf) => {
            if (isMounted) {
              setBgConfidence({ platform: d.platform, confidence: conf.confidence });
            }
          });
      })
      .catch(() => null);

    return () => {
      isMounted = false;
    };
  }, [jobUrl]);

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

  // Scroll directly to intervention / failure issue when session status is fetched
  useEffect(() => {
    if (!session) return;
    if (typeof window === 'undefined') return;

    const shouldScroll =
      window.location.search.includes('autoApplyExpand=true') ||
      window.location.hash === '#step-3-apply';

    if (!shouldScroll) return;

    const timer = setTimeout(() => {
      const issueElement =
        document.querySelector('[id^="intervention-panel-"]') ||
        document.getElementById('auto-apply-failure-banner') ||
        document.getElementById('auto-apply-low-confidence-warning') ||
        document.getElementById('step-3-apply');

      if (issueElement) {
        issueElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 150);

    return () => clearTimeout(timer);
  }, [session?.status, session?.interventions]);

  const hasIntervention = !!(session?.interventions && session.interventions.length > 0);
  const isInterventionStatus =
    hasIntervention ||
    session?.status === AutoApplyStatus.NEEDS_INTERVENTION ||
    session?.status === 'needs_intervention' ||
    session?.status === AutoApplyStatus.NEEDS_REVIEW ||
    session?.status === 'needs_review' ||
    ((session?.status === AutoApplyStatus.FAILED || session?.status === 'failed') && !!session?.failureReason);

  const pendingIntervention = session?.interventions?.[0] ?? (isInterventionStatus && session ? {
    id: session.id,
    reason: session.failureReason || 'unknown_question',
    description: session.failureDetails || (session.failureReason ? formatFailureExplanation(session.failureReason, session.failureDetails) : 'Your action or confirmation is required to proceed with this application.'),
    screenshotUrl: (session as any).screenshotUrl || (session as any).confirmationScreenshotUrl || null,
    pageUrl: jobUrl || null,
    createdAt: new Date().toISOString(),
  } : null);

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
          .stepper-labels-desktop {
            display: none !important;
          }
          .stepper-label-mobile {
            display: flex !important;
          }
        }
        @media (min-width: 640px) {
          .stepper-labels-desktop {
            display: flex !important;
          }
          .stepper-label-mobile {
            display: none !important;
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

      {/* Sleek Minimal Stepper with Continuous Connecting Progress Bar */}
      <div style={{ padding: '0.5rem 0 0.25rem', width: '100%' }}>
        {/* Track and Nodes Container (Height: 24px for exact vertical centering) */}
        <div style={{ position: 'relative', height: '24px', width: '100%' }}>
          {/* Background Track Line */}
          <div
            style={{
              position: 'absolute',
              top: '50%',
              transform: 'translateY(-50%)',
              left: '16px',
              right: '16px',
              height: '2px',
              background: 'var(--border-glass, rgba(255, 255, 255, 0.15))',
              zIndex: 1,
            }}
          />

          {/* Foreground Progress Line (Solid Filled to Current Step) */}
          <div
            style={{
              position: 'absolute',
              top: '50%',
              transform: 'translateY(-50%)',
              left: '16px',
              width: `calc((100% - 32px) * ${progressPercent / 100})`,
              height: '2px',
              background: session?.status === AutoApplyStatus.FAILED
                ? '#ef4444'
                : session?.status === AutoApplyStatus.NEEDS_INTERVENTION || session?.status === AutoApplyStatus.NEEDS_REVIEW
                ? 'linear-gradient(90deg, #2563eb 0%, #f59e0b 100%)'
                : 'linear-gradient(90deg, #2563eb 0%, #10b981 100%)',
              transition: 'width 0.5s cubic-bezier(0.4, 0, 0.2, 1)',
              zIndex: 2,
            }}
          />

          {/* Step Circles Row */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              height: '100%',
              position: 'relative',
              zIndex: 3,
            }}
          >
            {STEP_DEFINITIONS.map((st) => {
              const isCompleted = isAllDone || (isActive && st.num < activeStepNum);
              const isCurrent = isActive && st.num === activeStepNum;
              const isIntervention = (session?.status === AutoApplyStatus.NEEDS_INTERVENTION || session?.status === AutoApplyStatus.NEEDS_REVIEW) && st.num === 4;
              const isFailed = session?.status === AutoApplyStatus.FAILED && st.num === activeStepNum;

              return (
                <div
                  key={st.num}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '32px',
                    height: '100%',
                  }}
                >
                  {isCompleted ? (
                    /* Completed Step: Solid Circle with Clean Checkmark */
                    <div
                      style={{
                        width: '22px',
                        height: '22px',
                        borderRadius: '50%',
                        background: '#10b981',
                        color: '#ffffff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        boxShadow: '0 2px 6px rgba(16, 185, 129, 0.4)',
                        transition: 'all 0.3s ease',
                      }}
                    >
                      <Check size={12} strokeWidth={3} />
                    </div>
                  ) : isIntervention ? (
                    /* Intervention Step: Pulsating Amber Circle */
                    <div
                      className="stepper-amber-pulsing"
                      style={{
                        width: '22px',
                        height: '22px',
                        borderRadius: '50%',
                        background: '#f59e0b',
                        color: '#ffffff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: 'all 0.3s ease',
                      }}
                    >
                      <AlertCircle size={13} />
                    </div>
                  ) : isFailed ? (
                    /* Failed Step: Red Circle */
                    <div
                      style={{
                        width: '22px',
                        height: '22px',
                        borderRadius: '50%',
                        background: '#ef4444',
                        color: '#ffffff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <AlertCircle size={13} />
                    </div>
                  ) : isCurrent ? (
                    /* Active Current Step: Solid Circle with Concentric White Center Dot + Pulsating Ripple */
                    <div
                      className="stepper-active-pulsing"
                      style={{
                        width: '22px',
                        height: '22px',
                        borderRadius: '50%',
                        background: '#2563eb',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: 'all 0.3s ease',
                      }}
                    >
                      <div
                        style={{
                          width: '6px',
                          height: '6px',
                          borderRadius: '50%',
                          background: '#ffffff',
                        }}
                      />
                    </div>
                  ) : (
                    /* Upcoming / Idle Step: Small Minimal Dot */
                    <div
                      style={{
                        width: '8px',
                        height: '8px',
                        borderRadius: '50%',
                        background: 'var(--border-glass, #475569)',
                        border: '1px solid var(--border-glass, #334155)',
                        transition: 'all 0.3s ease',
                      }}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Step Labels Row for Desktop / Tablet */}
        <div
          className="stepper-labels-desktop"
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            marginTop: '0.45rem',
            width: '100%',
          }}
        >
          {STEP_DEFINITIONS.map((st) => {
            const isCompleted = isAllDone || (isActive && st.num < activeStepNum);
            const isCurrent = isActive && st.num === activeStepNum;
            const isIntervention = (session?.status === AutoApplyStatus.NEEDS_INTERVENTION || session?.status === AutoApplyStatus.NEEDS_REVIEW) && st.num === 4;

            return (
              <span
                key={st.num}
                style={{
                  width: '32px',
                  display: 'flex',
                  justifyContent: 'center',
                  fontSize: '0.63rem',
                  fontWeight: 700,
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                  color: isCompleted
                    ? '#10b981'
                    : isIntervention
                    ? '#f59e0b'
                    : isCurrent
                    ? '#3b82f6'
                    : 'var(--text-muted, #94a3b8)',
                  whiteSpace: 'nowrap',
                  transition: 'color 0.3s',
                }}
              >
                {st.label}
              </span>
            );
          })}
        </div>

        {/* Single Current Step Label for Mobile Screens */}
        <div
          className="stepper-label-mobile"
          style={{
            display: 'none',
            justifyContent: 'center',
            alignItems: 'center',
            marginTop: '0.5rem',
            textAlign: 'center',
          }}
        >
          <span
            style={{
              fontSize: '0.72rem',
              fontWeight: 700,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: isAllDone
                ? '#10b981'
                : (session?.status === AutoApplyStatus.NEEDS_INTERVENTION || session?.status === AutoApplyStatus.NEEDS_REVIEW)
                ? '#f59e0b'
                : session?.status === AutoApplyStatus.FAILED
                ? '#ef4444'
                : '#3b82f6',
              transition: 'color 0.3s',
            }}
          >
            {isAllDone
              ? 'Application Submitted'
              : `Current: ${STEP_DEFINITIONS.find((s) => s.num === activeStepNum)?.label || 'ATS CHECK'}`}
          </span>
        </div>
      </div>

      {/* Submission Receipt Card when applied */}
      {session?.status === AutoApplyStatus.APPLIED && (
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
          </div>

          {(session as any).confirmationScreenshotUrl && (
            <div style={{ marginTop: '0.25rem' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '0.35rem' }}>Submission Confirmation Proof:</span>
              <img
                src={(session as any).confirmationScreenshotUrl}
                alt="Submission confirmation screenshot proof"
                style={{ borderRadius: '6px', border: '1px solid var(--border-glass)', maxHeight: '180px', width: '100%', objectFit: 'contain', background: '#000' }}
              />
            </div>
          )}
        </div>
      )}

      {/* Failure Banner with Human Explanation (only when no intervention panel is active) */}
      {(session?.status === AutoApplyStatus.FAILED || session?.status === 'failed') && !isInterventionStatus && (
        <div
          id="auto-apply-failure-banner"
          style={{
            background: 'rgba(239, 68, 68, 0.08)',
            border: '1px solid rgba(239, 68, 68, 0.25)',
            borderRadius: '8px',
            padding: '0.85rem 1rem',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '0.65rem',
            fontSize: '0.85rem',
            color: 'var(--text-primary)',
          }}
        >
          <AlertCircle size={18} style={{ color: '#ef4444', flexShrink: 0, marginTop: '2px' }} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
            <strong style={{ color: '#ef4444' }}>Auto Apply Could Not Complete</strong>
            <span>{formatFailureExplanation(session.failureReason, session.failureDetails)}</span>
          </div>
        </div>
      )}

      {/* Inline User Interaction / Intervention Panel */}
      {isInterventionStatus && pendingIntervention && (
        <div style={{ margin: '0.25rem 0' }}>
          <InterventionPanel
            interventionId={pendingIntervention.id}
            reason={pendingIntervention.reason}
            description={pendingIntervention.description}
            screenshotUrl={pendingIntervention.screenshotUrl}
            pageUrl={pendingIntervention.pageUrl}
            onResolved={fetchStatus}
          />
        </div>
      )}

      {/* Auto Apply button (start / cancel) - hidden when intervention controls take over */}
      {!(isInterventionStatus && pendingIntervention) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', marginTop: '0.25rem' }}>
          <AutoApplyButton
            jobId={jobId}
            jobUrl={jobUrl}
            hasAssets={hasAssets}
            currentStatus={session?.status}
            onSessionStarted={() => fetchStatus()}
            onStartingChange={(starting) => setIsStarting(starting)}
          />
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
