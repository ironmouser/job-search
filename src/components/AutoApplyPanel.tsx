'use client';

import { useEffect, useState, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { AutoApplyStatus } from '@/lib/auto-apply/types';
import { formatFailureExplanation } from '@/lib/auto-apply/failure-helpers';
import { AutoApplyButton } from './AutoApplyButton';
import { AutoApplyStatusBadge } from './AutoApplyStatusBadge';
import { AutoApplyConfidenceBadge } from './AutoApplyConfidenceBadge';
import { AutoApplyLogViewer } from './AutoApplyLogViewer';
import { InterventionPanel } from './InterventionPanel';
import { Bot, Building2, Clock, CheckCircle2, AlertCircle } from 'lucide-react';

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
  AutoApplyStatus.DETECTING_ATS,
  AutoApplyStatus.PREPARING,
  AutoApplyStatus.APPLYING,
  AutoApplyStatus.VALIDATING,
  AutoApplyStatus.NEEDS_INTERVENTION,
]);

const POLL_INTERVAL = 3000;

export function AutoApplyPanel({ jobId, jobUrl, hasAssets }: AutoApplyPanelProps) {
  const { data: authSession } = useSession();
  const userRole = (authSession?.user as any)?.role;
  const isAdmin = userRole === 'SYSTEM_ADMIN' || userRole === 'ORGANIZATION_ADMIN' || userRole === 'ADMIN';

  const [session, setSession] = useState<SessionData | null>(null);
  const [showLogs, setShowLogs] = useState(false);
  const [bgConfidence, setBgConfidence] = useState<{ platform: string; confidence: number } | null>(null);

  const isActive = session ? ACTIVE_STATUSES.has(session.status as AutoApplyStatus) : false;

  const fetchStatus = useCallback(async () => {
    const res = await fetch(`/api/auto-apply/${jobId}/status`);
    if (res.ok) {
      const data = await res.json();
      setSession(data.session);
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

  // Poll while active
  useEffect(() => {
    if (!isActive) return;
    const interval = setInterval(fetchStatus, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [isActive, fetchStatus]);

  // When auto-apply succeeds (real or simulation), mark this job for confetti on the dashboard
  useEffect(() => {
    if (
      session?.status === AutoApplyStatus.APPLIED
    ) {
      sessionStorage.setItem('just_applied_job_id', jobId);
    }
  }, [session?.status, jobId]);

  const pendingIntervention = session?.interventions?.[0] ?? null;

  return (
    <div className="auto-apply-section">
      {/* Header row */}
      <div className="auto-apply-row">
        <span className="auto-apply-label" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
          <Bot size={16} /> Auto Apply
          {session && (
            <AutoApplyStatusBadge
              status={session.status}
              failureReason={session.failureReason ?? undefined}
              failureDetails={session.failureDetails ?? undefined}
            />
          )}
        </span>

        {/* Progress indicator */}
        {isActive && session?.stepsTotal && (
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            Step {session.stepsCompleted}/{session.stepsTotal}
          </span>
        )}
      </div>

      {/* Failure Banner with Human Explanation */}
      {session?.status === AutoApplyStatus.FAILED && (
        <div
          style={{
            background: 'rgba(239, 68, 68, 0.08)',
            border: '1px solid rgba(239, 68, 68, 0.25)',
            borderRadius: '8px',
            padding: '0.85rem 1rem',
            margin: '0.5rem 0',
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

      {/* Intervention Panel — takes over when worker is blocked */}
      {session?.status === AutoApplyStatus.NEEDS_INTERVENTION && pendingIntervention && (
        <InterventionPanel
          interventionId={pendingIntervention.id}
          reason={pendingIntervention.reason}
          description={pendingIntervention.description}
          screenshotUrl={pendingIntervention.screenshotUrl}
          pageUrl={pendingIntervention.pageUrl}
          onResolved={fetchStatus}
        />
      )}

      {/* Auto Apply button (start / cancel) - hidden when intervention controls take over */}
      {!(session?.status === AutoApplyStatus.NEEDS_INTERVENTION && pendingIntervention) && (
        <AutoApplyButton
          jobId={jobId}
          jobUrl={jobUrl}
          hasAssets={hasAssets}
          currentStatus={session?.status}
          onSessionStarted={() => fetchStatus()}
        />
      )}

      {/* Log viewer toggle — ONLY for admins */}
      {isAdmin && session && (
        <div style={{ marginTop: '0.5rem' }}>
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
              {/* Technical Session Metadata for Admin */}
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
