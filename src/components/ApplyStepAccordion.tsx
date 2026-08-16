'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, ChevronUp, Sparkles, Link as LinkIcon, AlertCircle, Loader2, ExternalLink, HelpCircle } from 'lucide-react';
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

    return () => {
      window.removeEventListener('auto-apply-expand-trigger', handleExpandTrigger);
      window.removeEventListener('hashchange', checkAndExpand);
      window.removeEventListener('popstate', checkAndExpand);
    };
  }, []);

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
        <div className="step-card-content-padding" style={{ borderTop: '1px solid var(--border-glass)', background: 'var(--bg-secondary)', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          
          {/* Custom URL Input Section */}
              {/* Custom URL Input Section */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <LinkIcon size={14} /> Direct Job Application URL
                </label>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <input
                    type="url"
                    value={customUrl}
                    onChange={(e) => setCustomUrl(e.target.value)}
                    placeholder={showLowConfidenceWarning && !hasAttemptedCustomUrl ? 'https://boards.greenhouse.io/company/jobs/12345' : activeUrl}
                    style={{
                      flex: 1,
                      padding: '0.6rem 1rem',
                      borderRadius: '6px',
                      border: '1px solid var(--border-glass)',
                      background: 'var(--bg-primary)',
                      color: 'var(--text-primary)',
                      fontSize: '0.9rem',
                    }}
                  />
                  <button
                    className="btn-outline"
                    onClick={handleSaveCustomUrl}
                    disabled={!customUrl.trim() || isSavingUrl}
                    style={{ whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
                  >
                    {isSavingUrl ? <Loader2 size={14} className="animate-spin" style={{ animation: 'spin 1s linear infinite' }} /> : null}
                    Update URL
                  </button>
                </div>

                {/* Supported ATS Domain Chips */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap', marginTop: '0.2rem' }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Supported platforms:</span>
                  {['Greenhouse', 'Lever', 'Workday', 'Ashby', 'SmartRecruiters', 'BambooHR'].map((ats) => (
                    <span
                      key={ats}
                      style={{
                        fontSize: '0.7rem',
                        padding: '1px 6px',
                        borderRadius: '4px',
                        background: 'var(--bg-primary)',
                        border: '1px solid var(--border-glass)',
                        color: 'var(--text-secondary)',
                      }}
                    >
                      {ats}
                    </span>
                  ))}
                </div>

                {applicationUrl && (
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Using custom application URL.</span>
                )}
              </div>

              {/* Confidence Score Header */}
              {confidenceData && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem', padding: '0.5rem 0' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                    <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Automation Confidence:</span>
                    <AutoApplyConfidenceBadge confidence={confidenceData.confidence} showLabel />
                  </div>
                  {showLowConfidenceWarning && (
                    <a
                      href={activeUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn-outline"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.4rem',
                        padding: '0.35rem 0.75rem',
                        borderRadius: '6px',
                        fontSize: '0.8rem',
                        fontWeight: 600,
                        color: 'var(--accent-primary)',
                        textDecoration: 'none',
                      }}
                    >
                      <ExternalLink size={14} /> Open Original Job Post
                    </a>
                  )}
                </div>
              )}

              {/* Low Confidence Non-Blocking Tip */}
              {showLowConfidenceWarning && !hasAttemptedCustomUrl && (
                <div
                  style={{
                    background: 'rgba(59, 130, 246, 0.08)',
                    border: '1px solid rgba(59, 130, 246, 0.25)',
                    borderRadius: '8px',
                    padding: '0.9rem 1.1rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem',
                    fontSize: '0.83rem',
                    color: 'var(--text-secondary)',
                  }}
                >
                  <HelpCircle color="#3b82f6" size={18} style={{ flexShrink: 0 }} />
                  <span>
                    This job link is from an aggregator (e.g. LinkedIn or Indeed). 1-Click Auto Apply will attempt to resolve the direct application link automatically. If desired, you can also paste a direct Greenhouse or Lever link above.
                  </span>
                </div>
              )}

              {/* Main Auto Apply Panel */}
              <AutoApplyPanel
                jobId={jobId}
                jobUrl={activeUrl}
                hasAssets={localHasAssets}
              />
        </div>
      )}
    </div>
  );
}
