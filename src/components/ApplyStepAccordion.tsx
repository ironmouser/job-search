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

  // Automatically start asset generation when opening accordion if user hasn't generated assets yet
  useEffect(() => {
    if (isExpanded && !localHasAssets && !isGeneratingAssets && !hasStartedGenerating) {
      setHasStartedGenerating(true);
      setIsGeneratingAssets(true);

      fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId }),
      })
        .then((res) => {
          if (res.ok) {
            setLocalHasAssets(true);
            router.refresh();
          } else {
            console.error('Failed to auto-generate assets');
          }
        })
        .catch((err) => {
          console.error('Error auto-generating assets:', err);
        })
        .finally(() => {
          setIsGeneratingAssets(false);
        });
    }
  }, [isExpanded, localHasAssets, isGeneratingAssets, hasStartedGenerating, jobId, router]);

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
      <div style={{ padding: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h3 style={{ margin: '0 0 0.5rem 0' }}>Apply to Job</h3>
          <p style={{ color: 'var(--text-secondary)', margin: 0, maxWidth: '600px', lineHeight: 1.5 }}>
            Ready to apply? Click the "Apply to Job" button to open the job application on the company's career page.
          </p>
        </div>
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

      {/* Accordion Divider */}
      <div style={{ borderTop: '1px solid var(--border-glass)' }} />

      {/* Accordion Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        style={{
          width: '100%',
          padding: '1rem 2rem',
          background: '#2663eb22',
          border: 'none',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          cursor: 'pointer',
          textAlign: 'left',
          transition: 'background 0.2s',
        }}
        className="accordion-header"
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
        <div style={{ padding: '2rem', borderTop: '1px solid var(--border-glass)', background: 'var(--bg-secondary)', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          
          {isGeneratingAssets ? (
            /* ONLY show generating message container while assets are generating */
            <div style={{
              background: 'rgba(59, 130, 246, 0.1)',
              border: '1px solid rgba(59, 130, 246, 0.3)',
              borderRadius: '12px',
              padding: '1.75rem 2rem',
              display: 'flex',
              alignItems: 'center',
              gap: '1.25rem',
              color: 'var(--text-primary)'
            }}>
              <Loader2 
                size={28} 
                className="animate-spin" 
                color="var(--accent-primary)" 
                style={{ flexShrink: 0, animation: 'spin 1s linear infinite' }} 
              />
              <div>
                <p style={{ margin: 0, fontSize: '0.95rem', lineHeight: '1.6', color: 'var(--text-primary)' }}>
                  Oops, looks like you didn't generate a resume and cover letter for this job (Step 2). Don't worry, I'll do that now. Be sure to review them before Auto applying.
                </p>
              </div>
            </div>
          ) : (
            /* Regular Accordion Content (shown ONLY after asset generation completes or if assets already exist) */
            <>
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

              {/* Low Confidence Helper OR Low Confidence Error Warning OR AutoApplyPanel */}
              {isCheckingConfidence ? (
                <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                  <Loader2 size={24} className="animate-spin" style={{ margin: '0 auto 1rem', animation: 'spin 1s linear infinite' }} />
                  <p>Analyzing job application format...</p>
                </div>
              ) : showLowConfidenceWarning ? (
                !hasAttemptedCustomUrl ? (
                  /* Guided Link Helper Box (Initial Low Confidence State) */
                  <div
                    id="auto-apply-low-confidence-warning"
                    style={{
                      background: 'rgba(59, 130, 246, 0.08)',
                      border: '1px solid rgba(59, 130, 246, 0.25)',
                      borderRadius: '10px',
                      padding: '1.5rem 1.75rem',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '1rem',
                    }}
                  >
                    <div style={{ display: 'flex', gap: '0.85rem', alignItems: 'flex-start' }}>
                      <HelpCircle color="#3b82f6" size={24} style={{ flexShrink: 0, marginTop: '2px' }} />
                      <div>
                        <h4 style={{ margin: '0 0 0.4rem 0', color: '#3b82f6', fontSize: '1rem', fontWeight: 600 }}>
                          Direct Application Link Needed
                        </h4>
                        <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: 1.55 }}>
                          This job URL appears to be a job board listing (e.g. LinkedIn or Indeed). To start Auto Apply, click <strong>"Get application URL"</strong> below to open the job page in a new tab, copy the direct application page link from the company website, and paste it into the field above.
                        </p>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem', paddingTop: '0.5rem', borderTop: '1px solid rgba(59, 130, 246, 0.15)' }}>
                      <a
                        href={activeUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn-outline"
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.5rem',
                          padding: '0.5rem 1rem',
                          borderRadius: '6px',
                          fontSize: '0.85rem',
                          fontWeight: 600,
                          color: '#3b82f6',
                          borderColor: 'rgba(59, 130, 246, 0.4)',
                          textDecoration: 'none',
                          background: 'rgba(59, 130, 246, 0.05)',
                        }}
                      >
                        <ExternalLink size={14} /> Get application URL
                      </a>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', opacity: 0.7 }}>
                        <span style={{ fontSize: '0.8rem', fontWeight: 500, color: 'var(--text-secondary)' }}>Current Score:</span>
                        <AutoApplyConfidenceBadge confidence={confidenceData.confidence} />
                      </div>
                    </div>
                  </div>
                ) : (
                  /* Red Alert Box (shown only after user submits a custom URL that still fails confidence check) */
                  <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: '8px', padding: '1.5rem', display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
                    <AlertCircle color="#ef4444" size={24} style={{ flexShrink: 0, marginTop: '2px' }} />
                    <div>
                      <h4 style={{ margin: '0 0 0.5rem 0', color: '#ef4444' }}>Direct Link Required</h4>
                      <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: 1.5 }}>
                        The updated URL provided still doesn't look like a supported direct application page. 
                        <strong>Please open the job page, navigate to the company's direct application form, and paste that URL above.</strong>
                      </p>
                      <div style={{ marginTop: '1rem', display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                        <a
                          href={activeUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn-outline"
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.4rem',
                            padding: '0.4rem 0.75rem',
                            borderRadius: '6px',
                            fontSize: '0.8rem',
                            fontWeight: 600,
                            color: '#ef4444',
                            borderColor: 'rgba(239, 68, 68, 0.4)',
                            textDecoration: 'none',
                          }}
                        >
                          <ExternalLink size={14} /> Get application URL
                        </a>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', opacity: 0.8 }}>
                          <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>Detected Score:</span>
                          <AutoApplyConfidenceBadge confidence={confidenceData.confidence} />
                        </div>
                      </div>
                    </div>
                  </div>
                )
              ) : (
                <div>
                  {confidenceData && (
                    <div style={{ marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Automation Confidence:</span>
                      <AutoApplyConfidenceBadge confidence={confidenceData.confidence} showLabel />
                    </div>
                  )}
                  <AutoApplyPanel
                    jobId={jobId}
                    jobUrl={activeUrl}
                    hasAssets={localHasAssets}
                  />
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
