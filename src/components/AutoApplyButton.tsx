'use client';

import { useState, useEffect } from 'react';
import { AutoApplyStatus, ATSPlatform, ConfidenceResult } from '@/lib/auto-apply/types';
import { AutoApplyConfidenceBadge } from './AutoApplyConfidenceBadge';

interface AutoApplyButtonProps {
  jobId: string;
  jobUrl: string;
  hasAssets: boolean;
  currentStatus?: AutoApplyStatus | string | null;
  onSessionStarted?: (sessionId: string) => void;
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

export function AutoApplyButton({
  jobId,
  jobUrl,
  hasAssets,
  currentStatus,
  onSessionStarted,
}: AutoApplyButtonProps) {
  const [showModal, setShowModal] = useState(false);
  const [detection, setDetection] = useState<{ platform: ATSPlatform; confidence: number; automationSupported: boolean } | null>(null);
  const [confidenceResult, setConfidenceResult] = useState<ConfidenceResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [starting, setStarting] = useState(false);
  const [simulationMode, setSimulationMode] = useState(true);

  const isActive = currentStatus && ACTIVE_STATUSES.has(currentStatus as AutoApplyStatus);
  const isDisabled = !hasAssets || !!isActive;

  // Pre-flight: detect ATS + score confidence when modal opens
  useEffect(() => {
    if (!showModal) return;
    setLoading(true);

    const detect = fetch('/api/auto-apply/detect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobUrl }),
    }).then((r) => r.json());

    detect.then((d) => {
      setDetection(d);

      // Score confidence based on detected platform
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
      }).then((r) => r.json());
    })
      .then(setConfidenceResult)
      .finally(() => setLoading(false));
  }, [showModal, jobUrl]);

  async function handleStart() {
    setStarting(true);
    try {
      const res = await fetch(`/api/auto-apply/${jobId}/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ simulationMode }),
      });
      const data = await res.json();
      if (res.ok) {
        setShowModal(false);
        onSessionStarted?.(data.sessionId);
      } else {
        alert(data.error ?? 'Failed to start Auto Apply');
      }
    } finally {
      setStarting(false);
    }
  }

  async function handleCancel() {
    await fetch(`/api/auto-apply/${jobId}/cancel`, { method: 'POST' });
  }

  if (isActive) {
    return (
      <button
        className="btn-auto-apply"
        style={{ background: 'linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)' }}
        onClick={handleCancel}
        id={`auto-apply-cancel-${jobId}`}
      >
        ⏹ Cancel Auto Apply
      </button>
    );
  }

  return (
    <>
      <button
        className="btn-auto-apply"
        disabled={isDisabled}
        onClick={() => setShowModal(true)}
        id={`auto-apply-btn-${jobId}`}
        title={!hasAssets ? 'Generate resume and cover letter first' : 'Start Auto Apply'}
      >
        🤖 Auto Apply
        {!hasAssets && <span style={{ fontSize: '0.7rem', opacity: 0.7 }}>(generate assets first)</span>}
      </button>

      {showModal && (
        <div
          className="modal-overlay"
          onClick={(e) => e.target === e.currentTarget && setShowModal(false)}
          style={{
            position: 'fixed', inset: 0,
            background: 'rgba(0,0,0,0.6)',
            backdropFilter: 'blur(4px)',
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem',
          }}
        >
          <div
            className="glass-card"
            style={{ maxWidth: '480px', width: '100%', padding: '1.5rem', gap: '1rem', display: 'flex', flexDirection: 'column' }}
            id="auto-apply-modal"
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '1.1rem' }}>🤖 Auto Apply Pre-Flight</h3>
              <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.2rem', color: 'var(--text-muted)' }}>✕</button>
            </div>

            {loading ? (
              <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '1rem' }}>Analyzing job application…</p>
            ) : (
              <>
                {/* ATS Detection */}
                <div style={{ background: 'var(--bg-secondary)', borderRadius: '0.5rem', padding: '0.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Platform Detected</span>
                  <span style={{ fontWeight: 700, textTransform: 'capitalize' }}>
                    {detection?.platform ?? 'Unknown'}
                    {!detection?.automationSupported && (
                      <span style={{ fontSize: '0.7rem', color: '#fbbf24', marginLeft: '0.5rem' }}>⚠ Limited support</span>
                    )}
                  </span>
                </div>

                {/* Confidence */}
                {confidenceResult && (
                  <div style={{ background: 'var(--bg-secondary)', borderRadius: '0.5rem', padding: '0.75rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                      <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Automation Confidence</span>
                      <AutoApplyConfidenceBadge confidence={confidenceResult.confidence} />
                    </div>
                    <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)' }}>{confidenceResult.explanation}</p>
                    <p style={{ margin: '0.4rem 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>⏱ Est. time: {confidenceResult.estimatedCompletionTime}</p>
                  </div>
                )}

                {/* Simulation mode toggle */}
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer', padding: '0.75rem', background: 'var(--bg-secondary)', borderRadius: '0.5rem' }}>
                  <input
                    type="checkbox"
                    checked={simulationMode}
                    onChange={(e) => setSimulationMode(e.target.checked)}
                    id="simulation-mode-toggle"
                    style={{ width: '1rem', height: '1rem', cursor: 'pointer' }}
                  />
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>Simulation Mode</div>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                      Test the flow without submitting. Recommended for first run.
                    </div>
                  </div>
                </label>

                <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.25rem' }}>
                  <button className="btn-outline" onClick={() => setShowModal(false)} style={{ flex: 1 }}>
                    Cancel
                  </button>
                  <button
                    className="btn-primary"
                    onClick={handleStart}
                    disabled={starting}
                    style={{ flex: 2 }}
                    id="auto-apply-start-btn"
                  >
                    {starting ? 'Starting…' : simulationMode ? '▶ Run Simulation' : '🚀 Submit Application'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
