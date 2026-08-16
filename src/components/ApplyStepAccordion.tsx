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

            {/* Info Message Row */}
            <div
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '0.45rem',
                fontSize: '0.84rem',
                color: 'var(--text-secondary, #475569)',
                lineHeight: 1.45,
              }}
            >
              <HelpCircle size={15} style={{ color: '#3b82f6', flexShrink: 0, marginTop: '2px' }} />
              <span>
                Aggregator link detected. 1-Click apply will attempt auto-resolve the direct application form, or you can paste a direct URL, from the original job post, above.
              </span>
            </div>

            {/* Open Original Job Post Link - Floated/Aligned Right */}
            {activeUrl && (
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.15rem' }}>
                <a
                  href={activeUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.35rem',
                    fontSize: '0.85rem',
                    color: '#2563eb',
                    textDecoration: 'none',
                    fontWeight: 500,
                  }}
                  title="Open original job listing in a new tab"
                >
                  <ExternalLink size={14} /> Open Original Job Post
                </a>
              </div>
            )}
          </div>

          {/* Main Auto Apply Panel with Stepper, Receipt, and Inline Interventions (No top border) */}
          <AutoApplyPanel
            jobId={jobId}
            jobUrl={activeUrl}
            hasAssets={localHasAssets}
            hasResume={hasResume}
          />
        </div>
      )}
    </div>
  );
}
