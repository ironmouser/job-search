'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, ChevronUp, Sparkles, Link as LinkIcon, AlertCircle, Loader2, ExternalLink, HelpCircle, X } from 'lucide-react';
import AutofillButton from './AutofillButton';
import { AutoApplyPanel } from './AutoApplyPanel';
import { AutoApplyConfidenceBadge } from './AutoApplyConfidenceBadge';

interface ApplyStepAccordionProps {
  jobId: string;
  initialUrl: string;
  applicationUrl?: string | null;
  jobTitle: string;
  jobCompany: string;
  isPro: boolean;
  appliesThisWeek: number;
  hasAssets: boolean;
  hasResume?: boolean;
  generationsLeftThisWeek?: number;
}

export function ApplyStepAccordion({
  jobId,
  initialUrl,
  applicationUrl,
  jobTitle,
  jobCompany,
  isPro,
  appliesThisWeek,
  hasAssets,
  hasResume,
  generationsLeftThisWeek,
}: ApplyStepAccordionProps) {
  const router = useRouter();
  const [isExpanded, setIsExpanded] = useState(false);
  const [activeUrl, setActiveUrl] = useState(applicationUrl || initialUrl);
  const [customUrl, setCustomUrl] = useState('');
  const [isSavingUrl, setIsSavingUrl] = useState(false);
  const [hasAttemptedCustomUrl, setHasAttemptedCustomUrl] = useState(!!applicationUrl);
  
  const [localHasAssets, setLocalHasAssets] = useState(hasAssets);
  const [isGeneratingAssets, setIsGeneratingAssets] = useState(false);
  const [hasStartedGenerating, setHasStartedGenerating] = useState(false);

  const [confidenceData, setConfidenceData] = useState<{ platform: string; confidence: number } | null>(null);
  const [isCheckingConfidence, setIsCheckingConfidence] = useState(false);
  const [activeSession, setActiveSession] = useState<{ status: string } | null>(null);
  const [isSessionActive, setIsSessionActive] = useState(false);
  const [isHelpDismissed, setIsHelpDismissed] = useState(false);

  useEffect(() => {
    try {
      if (typeof window !== 'undefined') {
        const saved = localStorage.getItem('auto_apply_dismiss_aggregator_help');
        if (saved === 'true') {
          setIsHelpDismissed(true);
        }
      }
    } catch {
      // Ignore localStorage read errors
    }
  }, []);

  const handleDismissHelp = () => {
    setIsHelpDismissed(true);
    try {
      if (typeof window !== 'undefined') {
        localStorage.setItem('auto_apply_dismiss_aggregator_help', 'true');
      }
    } catch {
      // Ignore localStorage write errors
    }
  };

  useEffect(() => {
    setLocalHasAssets(hasAssets);
  }, [hasAssets]);

  // Check URL parameters and custom triggers to auto-expand the accordion
  useEffect(() => {
    const checkAndExpand = () => {
      if (typeof window === 'undefined') return;
      const searchParams = new URLSearchParams(window.location.search);
      const shouldExpand =
        searchParams.get('autoApplyExpand') === 'true' ||
        window.location.hash === '#step-3-apply';

      if (shouldExpand) {
        setIsExpanded(true);
      }
    };

    checkAndExpand();

    const handleExpandTrigger = () => {
      setIsExpanded(true);
    };

    window.addEventListener('auto-apply-expand-trigger', handleExpandTrigger);
    window.addEventListener('hashchange', checkAndExpand);
    window.addEventListener('popstate', checkAndExpand);

    // Also auto-expand if this job currently has an active auto-apply session running
    fetch(`/api/auto-apply/${jobId}/status`, { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.session) {
          const activeStatuses = [
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
          ];
          if (activeStatuses.includes(data.session.status)) {
            setIsExpanded(true);
          }
        }
      })
      .catch(() => {});

    return () => {
      window.removeEventListener('auto-apply-expand-trigger', handleExpandTrigger);
      window.removeEventListener('hashchange', checkAndExpand);
      window.removeEventListener('popstate', checkAndExpand);
    };
  }, [jobId]);

  // Smooth scroll directly to the intervention / issue element once expanded
  useEffect(() => {
    if (!isExpanded) return;
    if (typeof window === 'undefined') return;

    const searchParams = new URLSearchParams(window.location.search);
    const shouldScroll =
      searchParams.get('autoApplyExpand') === 'true' ||
      window.location.hash === '#step-3-apply';

    if (!shouldScroll) return;

    const attempts = [100, 350, 750, 1200];
    const timers: NodeJS.Timeout[] = [];

    attempts.forEach((delay) => {
      const timer = setTimeout(() => {
        const issueElement =
          document.querySelector('[id^="intervention-panel-"]') ||
          document.getElementById('auto-apply-failure-banner') ||
          document.getElementById('auto-apply-low-confidence-warning') ||
          document.getElementById('step-3-apply');

        if (issueElement) {
          issueElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, delay);
      timers.push(timer);
    });

    return () => {
      timers.forEach((t) => clearTimeout(t));
    };
  }, [isExpanded]);

  // Check confidence whenever activeUrl changes
  useEffect(() => {
    if (!activeUrl || !isExpanded || isGeneratingAssets) return;
    let isMounted = true;
    setIsCheckingConfidence(true);

    fetch('/api/auto-apply/detect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobUrl: activeUrl }),
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
              setConfidenceData({ platform: d.platform, confidence: conf.confidence });
              setIsCheckingConfidence(false);
            }
          });
      })
      .catch(() => {
        if (isMounted) setIsCheckingConfidence(false);
      });

    return () => {
      isMounted = false;
    };
  }, [activeUrl, isExpanded]);

  async function handleSaveCustomUrl() {
    if (!customUrl.trim()) return;
    setIsSavingUrl(true);
    try {
      const res = await fetch(`/api/jobs/${jobId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ applicationUrl: customUrl.trim() }),
      });
      if (res.ok) {
        setActiveUrl(customUrl.trim());
        setCustomUrl('');
        setHasAttemptedCustomUrl(true);
      }
    } catch (e) {
      console.error('Failed to save URL', e);
    } finally {
      setIsSavingUrl(false);
    }
  }

  // Determine if we should show the low confidence warning
  const showLowConfidenceWarning = confidenceData && confidenceData.confidence < 40;

  const isInterventionOrRunning =
    isSessionActive ||
    (activeSession &&
      [
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
        'applied',
        'simulated',
      ].includes(activeSession.status));

  return (
    <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', padding: '0', overflow: 'hidden' }}>
      {/* Top Main Section: Manual Apply */}
      <div className="step-card-main-padding" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div style={{ flex: '1 1 280px' }}>
          <h3 style={{ margin: '0 0 0.5rem 0' }}>Apply to Job</h3>
          <p style={{ color: 'var(--text-secondary)', margin: 0, maxWidth: '600px', lineHeight: 1.5 }}>
            Ready to apply? Click the "Apply to Job" button to open the job application on the company's career page.
          </p>
        </div>
        <div className="full-width-mobile" style={{ flexShrink: 0 }}>
          <AutofillButton 
            jobId={jobId} 
            jobUrl={activeUrl} 
            jobTitle={jobTitle} 
            jobCompany={jobCompany} 
            isPro={isPro} 
            appliesThisWeek={appliesThisWeek} 
            hasAssets={localHasAssets}
            generationsLeftThisWeek={generationsLeftThisWeek}
          />
        </div>
      </div>

      {/* Accordion Divider */}
      <div style={{ borderTop: '1px solid var(--border-glass)' }} />

      {/* Accordion Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        style={{
          width: '100%',
          background: '#2663eb22',
          border: 'none',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          cursor: 'pointer',
          textAlign: 'left',
          transition: 'background 0.2s',
        }}
        className="accordion-header step-card-header-padding"
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600, color: 'var(--text-primary)' }}>
          <Sparkles size={16} color="var(--accent-primary)" />
          Auto apply with AI
          {!isPro && (
            <span style={{ fontSize: '0.7rem', background: 'var(--accent-primary)', color: '#fff', padding: '2px 6px', borderRadius: '4px', marginLeft: '0.5rem' }}>PRO</span>
          )}
        </span>
        {isExpanded ? <ChevronUp size={18} color="var(--text-secondary)" /> : <ChevronDown size={18} color="var(--text-secondary)" />}
      </button>

      {/* Accordion Content */}
      {isExpanded && (
        <div
          className="step-card-content-padding"
          style={{
            borderTop: '1px solid var(--border-glass)',
            background: 'var(--bg-secondary)',
            display: 'flex',
            flexDirection: 'column',
            gap: '1.5rem',
          }}
        >
          {/* Direct URL Input Sub-Card */}
          <div
            style={{
              border: '1px solid var(--border-glass, #e2e8f0)',
              borderRadius: '12px',
              padding: '1.25rem 1.35rem 1.15rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.85rem',
              background: 'var(--bg-primary, #ffffff)',
            }}
          >
            {/* Header: Label + Confidence Badge */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
              <label
                style={{
                  fontSize: '0.9rem',
                  fontWeight: 600,
                  color: 'var(--text-secondary, #475569)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                }}
              >
                <LinkIcon size={15} /> Direct Job Application URL
              </label>
              {confidenceData && (
                <AutoApplyConfidenceBadge confidence={confidenceData.confidence} showLabel />
              )}
            </div>

            {/* Input Row + Update URL Button */}
            <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
              <input
                type="url"
                value={customUrl || (hasAttemptedCustomUrl ? activeUrl : '')}
                onChange={(e) => setCustomUrl(e.target.value)}
                placeholder={activeUrl || 'https://company.com/careers/job/12345'}
                style={{
                  flex: 1,
                  padding: '0.65rem 0.95rem',
                  borderRadius: '6px',
                  border: '1px solid var(--border-glass, #e2e8f0)',
                  background: 'var(--bg-secondary, #f8fafc)',
                  color: 'var(--text-primary, #334155)',
                  fontSize: '0.88rem',
                  outline: 'none',
                }}
              />
              <button
                onClick={handleSaveCustomUrl}
                disabled={!customUrl.trim() || isSavingUrl}
                style={{
                  whiteSpace: 'nowrap',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  fontSize: '0.85rem',
                  padding: '0.65rem 1.15rem',
                  borderRadius: '6px',
                  border: '1px solid var(--border-glass, #e2e8f0)',
                  background: 'var(--bg-primary, #ffffff)',
                  color: 'var(--text-secondary, #475569)',
                  fontWeight: 500,
                  cursor: !customUrl.trim() || isSavingUrl ? 'not-allowed' : 'pointer',
                  opacity: !customUrl.trim() ? 0.7 : 1,
                  transition: 'all 0.2s ease',
                }}
              >
                {isSavingUrl ? <Loader2 size={13} className="animate-spin" /> : null}
                Update URL
              </button>
            </div>
          </div>

          {/* Finding & paste the direct application form (compact dismissed state) */}
          {!isInterventionOrRunning && isHelpDismissed && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.65rem',
                flexWrap: 'wrap',
                padding: '0.1rem 0.2rem',
              }}
            >
              <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.92rem' }}>
                Finding &amp; paste the direct application form
              </span>
              {activeUrl ? (
                <a
                  href={activeUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.35rem',
                    color: '#2563eb',
                    textDecoration: 'none',
                    fontWeight: 600,
                    fontSize: '0.88rem',
                  }}
                  title="Open original job listing in a new tab"
                >
                  <ExternalLink size={15} style={{ flexShrink: 0 }} />
                  <span>Open Original Job Post</span>
                </a>
              ) : null}
            </div>
          )}

          {/* Finding the Direct Application Form Info Card (full state with close X) */}
          {!isInterventionOrRunning && !isHelpDismissed && (
            <div
              style={{
                display: 'flex',
                gap: '0.85rem',
                background: 'rgba(59, 130, 246, 0.05)',
                border: '1px solid rgba(59, 130, 246, 0.22)',
                borderRadius: '12px',
                padding: '1.1rem 1.25rem',
                alignItems: 'flex-start',
                position: 'relative',
              }}
            >
              <Sparkles size={18} style={{ color: '#2563eb', flexShrink: 0, marginTop: '2px' }} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.86rem', flex: 1, paddingRight: '1.5rem' }}>
                <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.9rem' }}>
                  Finding the direct application form
                </span>
                <div style={{ margin: 0, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                  <span>
                    When you click Auto Apply, the AI will follow this job listing to locate the company&apos;s direct application form. You can also paste the direct application URL, from the job post, above.
                  </span>
                  {activeUrl ? (
                    <a
                      href={activeUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.3rem',
                        marginLeft: '0.45rem',
                        color: '#1d4ed8',
                        textDecoration: 'none',
                        fontWeight: 600,
                        fontSize: '0.85rem',
                        verticalAlign: 'baseline',
                      }}
                      title="Open original job listing in a new tab"
                    >
                      <ExternalLink size={14} style={{ display: 'inline', verticalAlign: '-2px', flexShrink: 0 }} />
                      <span>Open Original Job Post</span>
                    </a>
                  ) : null}
                </div>
              </div>

              {/* Upper-right Close X button */}
              <button
                onClick={handleDismissHelp}
                aria-label="Dismiss help message"
                title="Dismiss help message"
                style={{
                  position: 'absolute',
                  top: '10px',
                  right: '10px',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--text-secondary, #64748b)',
                  padding: '4px',
                  borderRadius: '6px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'background 0.15s, color 0.15s',
                }}
              >
                <X size={16} />
              </button>
            </div>
          )}

          {/* Main Auto Apply Panel with Stepper, Receipt, and Inline Interventions (No top border) */}
          <AutoApplyPanel
            jobId={jobId}
            jobUrl={activeUrl}
            hasAssets={localHasAssets}
            hasResume={hasResume}
            onStatusChange={(sess, active) => {
              setActiveSession(sess);
              setIsSessionActive(active);
            }}
          />
        </div>
      )}
    </div>
  );
}
