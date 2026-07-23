'use client';

import { useEffect, useState, useCallback } from 'react';
import { AutoApplyStatus } from '@/lib/auto-apply/types';
import { AutoApplyButton } from './AutoApplyButton';
import { AutoApplyStatusBadge } from './AutoApplyStatusBadge';
import { AutoApplyConfidenceBadge } from './AutoApplyConfidenceBadge';
import { AutoApplyLogViewer } from './AutoApplyLogViewer';
import { InterventionPanel } from './InterventionPanel';
import { Bot, Building2, Clock } from 'lucide-react';

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
            />
          )}
          {session?.simulationMode && session.status !== AutoApplyStatus.QUEUED && (
            <span
              style={{ fontSize: '0.65rem', color: '#8b5cf6', border: '1px solid #8b5cf6', borderRadius: '9999px', padding: '0 0.35rem' }}
              title="Simulation mode — application was not submitted"
            >
              SIM
            </span>
          )}
        </span>

        {/* Progress indicator */}
        {isActive && session?.stepsTotal && (
          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
            Step {session.stepsCompleted}/{session.stepsTotal}
          </span>
        )}
      </div>

      {/* Platform + timing for completed sessions */}
      {session && !isActive && session.status !== AutoApplyStatus.QUEUED && (
        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
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
              {session.failureDetails.length > 60 ? session.failureDetails.slice(0, 57) + '…' : session.failureDetails}
            </span>
          )}
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

      {/* Auto Apply button (start / cancel) */}
      <AutoApplyButton
        jobId={jobId}
        jobUrl={jobUrl}
        hasAssets={hasAssets}
        currentStatus={session?.status}
        onSessionStarted={() => fetchStatus()}
      />

      {/* Log viewer toggle */}
      {session && (
        <div>
          <button
            onClick={() => setShowLogs((v) => !v)}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--text-muted)',
              fontSize: '0.75rem',
              padding: '0.1rem 0',
              display: 'flex',
              alignItems: 'center',
              gap: '0.25rem',
            }}
            id={`toggle-logs-${jobId}`}
          >
            {showLogs ? '▲' : '▼'} Execution Logs
          </button>
          {showLogs && (
            <AutoApplyLogViewer
              jobId={jobId}
              sessionId={session.id}
              isActive={isActive}
            />
          )}
        </div>
      )}
    </div>
  );
}
