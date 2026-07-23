'use client';

import { useState, useEffect } from 'react';
import { ChevronDown, ChevronUp, Sparkles, Link as LinkIcon, AlertCircle, Loader2 } from 'lucide-react';
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
}: ApplyStepAccordionProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [activeUrl, setActiveUrl] = useState(applicationUrl || initialUrl);
  const [customUrl, setCustomUrl] = useState('');
  const [isSavingUrl, setIsSavingUrl] = useState(false);
  
  const [confidenceData, setConfidenceData] = useState<{ platform: string; confidence: number } | null>(null);
  const [isCheckingConfidence, setIsCheckingConfidence] = useState(false);

  // Check confidence whenever activeUrl changes
  useEffect(() => {
    if (!activeUrl || !isExpanded) return;
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
                placeholder={activeUrl}
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
                {isSavingUrl ? <Loader2 size={14} className="animate-spin" /> : null}
                Update URL
              </button>
            </div>
            {applicationUrl && (
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Using custom application URL.</span>
            )}
          </div>

          {/* Low Confidence Warning OR AutoApplyPanel */}
          {isCheckingConfidence ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
              <Loader2 size={24} className="animate-spin" style={{ margin: '0 auto 1rem' }} />
              <p>Analyzing job application format...</p>
            </div>
          ) : showLowConfidenceWarning ? (
            <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: '8px', padding: '1.5rem', display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
              <AlertCircle color="#ef4444" size={24} style={{ flexShrink: 0, marginTop: '2px' }} />
              <div>
                <h4 style={{ margin: '0 0 0.5rem 0', color: '#ef4444' }}>Direct Link Required</h4>
                <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: 1.5 }}>
                  The current URL doesn't look like it supports Auto Apply (the application might be nested behind the apply button on a job board like Indeed or LinkedIn). 
                  Try navigating to the company's direct career page and pasting the URL above to see if we can automate it!
                </p>
                <div style={{ marginTop: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', opacity: 0.6 }}>
                  <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>Detected Score:</span>
                  <AutoApplyConfidenceBadge confidence={confidenceData.confidence} />
                </div>
              </div>
            </div>
          ) : (
            <div>
              {confidenceData && (
                <div style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Automation Confidence:</span>
                  <AutoApplyConfidenceBadge confidence={confidenceData.confidence} showLabel />
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                    ({confidenceData.platform !== 'unknown' ? confidenceData.platform.charAt(0).toUpperCase() + confidenceData.platform.slice(1) : 'Custom Form'})
                  </span>
                </div>
              )}
              <AutoApplyPanel
                jobId={jobId}
                jobUrl={activeUrl}
                hasAssets={hasAssets}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
