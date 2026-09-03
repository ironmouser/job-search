'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  Sparkles,
  Link as LinkIcon,
  Loader2,
  ExternalLink,
  HelpCircle,
  Zap,
  Check,
  Download,
  Copy,
  CheckCircle2,
  Globe,
  FileText,
} from 'lucide-react';
import { AutoApplyPanel } from './AutoApplyPanel';
import { AutoApplyConfidenceBadge } from './AutoApplyConfidenceBadge';
import { AutoApplyHowItWorksModal } from './AutoApplyHowItWorksModal';
import AutofillButton from './AutofillButton';
import { safeCopyToClipboard } from '@/lib/clipboard';
import { scrollToTop } from './BackToTopButton';
import { isAutoApplyEnabled } from '@/lib/features';

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
  isEasyApply?: boolean;
  jobSource?: string;
  /** Called after Auto Apply auto-generates assets so the parent can refresh Step 2 */
  onAssetsGenerated?: () => void;
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
  isEasyApply,
  jobSource,
  onAssetsGenerated,
}: ApplyStepAccordionProps) {
  const router = useRouter();
  const [activeUrl, setActiveUrl] = useState(applicationUrl || initialUrl);
  const [customUrl, setCustomUrl] = useState(applicationUrl || '');
  const [isSavingUrl, setIsSavingUrl] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [isHowItWorksOpen, setIsHowItWorksOpen] = useState(false);
  const autoApplyEnabled = isAutoApplyEnabled();
  // Default to manual apply tab per user specification
  const [mode, setMode] = useState<'manual' | 'auto'>('manual');

  useEffect(() => {
    setActiveUrl(applicationUrl || initialUrl);
    setCustomUrl(applicationUrl || '');
    setConfidenceData(null);
    setIsCheckingConfidence(false);
    setSavedSuccess(false);
    setIsSavingUrl(false);
  }, [jobId, applicationUrl, initialUrl]);

  const [localHasAssets, setLocalHasAssets] = useState(hasAssets);
  const [confidenceData, setConfidenceData] = useState<{ platform: string; confidence: number } | null>(null);
  const [isCheckingConfidence, setIsCheckingConfidence] = useState(false);
  const [activeSession, setActiveSession] = useState<{ status: string } | null>(null);
  const [isSessionActive, setIsSessionActive] = useState(false);

  useEffect(() => {
    setLocalHasAssets(hasAssets);
  }, [hasAssets]);

  // Check URL parameters and active sessions to auto-select auto tab if triggered or running
  useEffect(() => {
    if (!autoApplyEnabled) return;
    if (typeof window === 'undefined') return;
    const searchParams = new URLSearchParams(window.location.search);
    if (searchParams.get('autoApplyExpand') === 'true') {
      setMode('auto');
    }

    // Check if an auto-apply session is active in the background
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
            setMode('auto');
          }
        }
      })
      .catch(() => {});
  }, [jobId, autoApplyEnabled]);

  const effectiveUrl = customUrl.trim() && customUrl.trim().startsWith('http') ? customUrl.trim() : activeUrl;

  // Check automation confidence whenever effectiveUrl changes
  useEffect(() => {
    if (!autoApplyEnabled || !effectiveUrl) return;
    let isMounted = true;
    setIsCheckingConfidence(true);

    fetch('/api/auto-apply/detect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobUrl: effectiveUrl }),
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
  }, [effectiveUrl]);

  async function handleSaveCustomUrl(overrideUrl?: string) {
    const targetToSave = (typeof overrideUrl === 'string' ? overrideUrl : customUrl).trim();
    if (!targetToSave) return;
    setIsSavingUrl(true);
    try {
      const res = await fetch(`/api/jobs/${jobId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ applicationUrl: targetToSave }),
      });
      if (res.ok) {
        setActiveUrl(targetToSave);
        setCustomUrl(targetToSave);
        setSavedSuccess(true);
        router.refresh();
        setTimeout(() => {
          setSavedSuccess(false);
        }, 3000);
      }
    } catch (e) {
      console.error('Failed to save URL', e);
    } finally {
      setIsSavingUrl(false);
    }
  }

  // Manual apply execution helper
  const handleManualApply = async () => {
    try {
      if (localHasAssets) {
        const res = await fetch('/api/autofill', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jobId }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.coverLetter) {
            await safeCopyToClipboard(data.coverLetter);
          }
        }
      }

      fetch(`/api/jobs/${jobId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'applied', applied_at: new Date().toISOString() }),
      })
        .then(() => router.refresh())
        .catch(console.error);

      let targetUrl = effectiveUrl;
      const isInternalLink =
        targetUrl.includes('jobagenthq.com') ||
        targetUrl.startsWith('/') ||
        targetUrl.includes('localhost') ||
        targetUrl.includes('railway.app');

      if (isInternalLink) {
        const searchQuery = encodeURIComponent(`${jobTitle} ${jobCompany} careers`);
        targetUrl = `https://www.google.com/search?q=${searchQuery}`;
      }

      sessionStorage.setItem('just_applied_job_id', jobId);
      window.open(targetUrl, '_blank');
      scrollToTop();
    } catch (e) {
      console.error('Manual apply error:', e);
      window.open(effectiveUrl, '_blank');
    }
  };

  const isApplied = activeSession?.status === 'applied' || activeSession?.status === 'simulated';

  // If already applied, guarantee 100% confidence
  const effectiveConfidenceData = isApplied
    ? { platform: confidenceData?.platform || 'ATS', confidence: 100 }
    : confidenceData;

  return (
    <div
      className="glass-card apply-step-card"
      style={{
        display: 'flex',
        flexDirection: 'column',
        padding: '1.5rem',
        gap: '1.25rem',
        overflow: 'hidden',
      }}
    >
      {/* 1. Header Row */}
      <div>
        <h3 style={{ margin: '0 0 0.25rem 0', fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)' }}>
          Apply to Job
        </h3>
        <p style={{ color: 'var(--text-secondary)', margin: 0, fontSize: '0.9rem' }}>
          {autoApplyEnabled
            ? "Choose how you'd like to apply for this position."
            : "Review your tailored assets from Step 2, then complete your application directly."}
        </p>
      </div>

      {/* 2. Segmented Mode Selector Tabs (Only shown if Auto Apply is enabled) */}
      {autoApplyEnabled && (
        <div
          className="app-segmented-tabs"
          role="tablist"
          aria-label="Application Mode"
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '6px',
          }}
        >
          {/* Tab 1: Apply Now - Default */}
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'manual'}
            onClick={() => setMode('manual')}
            className={`app-tab-btn ${mode === 'manual' ? 'active' : ''}`}
            style={{
              padding: '0.7rem 1rem',
              fontSize: '0.92rem',
            }}
          >
            <ExternalLink size={16} />
            <span>Apply Now</span>
          </button>

          {/* Tab 2: Auto Apply With AI */}
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'auto'}
            onClick={() => setMode('auto')}
            className={`app-tab-btn ${mode === 'auto' ? 'active' : ''}`}
            style={{
              padding: '0.7rem 1rem',
              fontSize: '0.92rem',
            }}
          >
            <Sparkles size={16} />
            <span>Auto Apply With AI</span>
          </button>
        </div>
      )}

      {/* Easy Apply Banner if role requires personal sign in */}
      {isEasyApply && (
        <div
          className="apply-easy-banner"
          style={{
            padding: '1rem 1.25rem',
            background: 'rgba(2, 132, 199, 0.08)',
            border: '1px solid rgba(2, 132, 199, 0.25)',
            borderRadius: '10px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '1rem',
            flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontSize: '0.92rem', fontWeight: 700, color: '#0284c7', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <Zap size={16} /> Easy Apply on {jobSource && !jobSource.toLowerCase().includes('google') ? jobSource : 'Job Platform'}
              </span>
              <span style={{ fontSize: '0.7rem', background: 'rgba(2, 132, 199, 0.15)', color: '#0284c7', border: '1px solid rgba(2, 132, 199, 0.3)', padding: '2px 6px', borderRadius: '4px', fontWeight: 600 }}>Personal Account</span>
            </div>
            <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.4, maxWidth: '580px' }}>
              This role is hosted directly on {jobSource && !jobSource.toLowerCase().includes('google') ? jobSource : 'the platform'}&apos;s internal network and requires signing into your personal account.
            </p>
          </div>

          <a
            href={activeUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-primary"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.6rem 1.15rem',
              fontSize: '0.88rem',
              fontWeight: 600,
              textDecoration: 'none',
              background: '#0284c7',
              borderColor: '#0284c7',
              whiteSpace: 'nowrap',
            }}
          >
            Easy Apply on {jobSource && !jobSource.toLowerCase().includes('google') ? jobSource : 'Platform'} <ExternalLink size={15} />
          </a>
        </div>
      )}

      {/* Tab 1 Content: Apply Now (Manual Apply) */}
      {mode === 'manual' && (
        <div
          className="apply-manual-card"
          style={{
            borderRadius: '12px',
            border: '1px solid var(--border-glass, rgba(255, 255, 255, 0.08))',
            background: 'var(--card, #111111)',
            padding: '1.5rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '1rem',
          }}
        >
          {/* Explanation Header */}
          <div>
            <h4 style={{ margin: '0 0 0.4rem 0', fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)' }}>
              Apply directly on the employer&apos;s website
            </h4>
            <p style={{ margin: 0, fontSize: '0.88rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              Download your tailored resume and cover letter from Step 2, then click below to open the job application on the company career page or job board.
            </p>
          </div>

          {/* Action Button */}
          <div style={{ marginTop: '0.5rem' }}>
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
      )}

      {/* Tab 2 Content: Auto Apply With AI */}
      {autoApplyEnabled && mode === 'auto' && (
        <div
          className="apply-auto-card"
          style={{
            borderRadius: '14px',
            border: '1px solid var(--border-glass, rgba(255, 255, 255, 0.08))',
            background: 'var(--bg-secondary, rgba(255, 255, 255, 0.02))',
            padding: '1.35rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '1.25rem',
          }}
        >
          {/* Inner Header Row: Badges (AI Auto Apply + Confidence) & How it works link */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
              <span
                style={{
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  letterSpacing: '0.02em',
                  padding: '4px 10px',
                  borderRadius: '9999px',
                  background: 'rgba(0, 112, 243, 0.12)',
                  color: 'var(--accent-primary, #0070f3)',
                  border: '1px solid rgba(0, 112, 243, 0.25)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                }}
              >
                <Sparkles size={12} /> AI Auto Apply
              </span>

              {/* Confidence Badge with Info Trigger */}
              {effectiveConfidenceData && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <AutoApplyConfidenceBadge
                    confidence={effectiveConfidenceData.confidence}
                    showLabel
                  />
                  <button
                    type="button"
                    onClick={() => setIsHowItWorksOpen(true)}
                    title="How confidence is calculated & how Auto Apply works"
                    style={{
                      background: 'none',
                      border: 'none',
                      padding: 0,
                      color: 'var(--text-muted)',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                    }}
                  >
                    <HelpCircle size={14} />
                  </button>
                </div>
              )}
            </div>

            {/* How it works trigger link */}
            <button
              type="button"
              onClick={() => setIsHowItWorksOpen(true)}
              style={{
                fontSize: '0.8rem',
                color: 'var(--accent-primary, #0070f3)',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.25rem',
                fontWeight: 500,
                padding: '2px 4px',
              }}
            >
              <HelpCircle size={13} /> How AI Auto Apply Works
            </button>
          </div>

          {/* Application URL Card */}
          {!isApplied && (
            <div
              className="apply-url-card"
              style={{
                border: '1px solid var(--border-subtle-blue, rgba(2, 132, 199, 0.15))',
                borderRadius: '12px',
                padding: '1.25rem 1.35rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '1rem',
                background: 'var(--bg-subtle-blue, rgba(2, 132, 199, 0.04))',
              }}
            >
              <label style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--text-secondary, #64748b)', margin: 0 }}>
                Application URL
              </label>

              {/* Input + Update URL */}
              <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                <input
                  type="url"
                  value={customUrl}
                  onChange={(e) => {
                    setCustomUrl(e.target.value);
                    setSavedSuccess(false);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleSaveCustomUrl();
                    }
                  }}
                  onBlur={() => {
                    if (customUrl.trim() && customUrl.trim() !== activeUrl && customUrl.trim().startsWith('http')) {
                      handleSaveCustomUrl();
                    }
                  }}
                  placeholder={activeUrl || 'https://company.com/careers/job/12345'}
                  style={{
                    flex: 1,
                    padding: '0.7rem 1rem',
                    borderRadius: '8px',
                    border: '1px solid var(--border-glass, rgba(0, 0, 0, 0.08))',
                    background: 'var(--bg-primary, #ffffff)',
                    color: 'var(--text-primary, #0f172a)',
                    fontSize: '0.9rem',
                    outline: 'none',
                    boxShadow: '0 1px 2px rgba(0, 0, 0, 0.03)',
                  }}
                />
                <button
                  onClick={() => handleSaveCustomUrl()}
                  disabled={(!customUrl.trim() || (customUrl.trim() === activeUrl && !savedSuccess)) && !isSavingUrl}
                  style={{
                    whiteSpace: 'nowrap',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                    fontSize: '0.88rem',
                    padding: '0.7rem 1.25rem',
                    borderRadius: '8px',
                    border: savedSuccess ? '1px solid #16a34a' : '1px solid var(--border-subtle-blue, rgba(2, 132, 199, 0.25))',
                    background: savedSuccess ? 'rgba(22, 163, 74, 0.12)' : 'var(--bg-primary, #ffffff)',
                    color: savedSuccess ? '#16a34a' : customUrl.trim() && customUrl.trim() !== activeUrl ? 'var(--accent-primary, #0070f3)' : 'var(--text-secondary, #475569)',
                    fontWeight: 600,
                    cursor: (!customUrl.trim() || (customUrl.trim() === activeUrl && !savedSuccess)) && !isSavingUrl ? 'not-allowed' : 'pointer',
                    opacity: (!customUrl.trim() || (customUrl.trim() === activeUrl && !savedSuccess)) && !isSavingUrl ? 0.6 : 1,
                    transition: 'all 0.2s ease',
                    boxShadow: '0 1px 2px rgba(0, 0, 0, 0.03)',
                  }}
                >
                  {isSavingUrl ? (
                    <>
                      <Loader2 size={13} className="animate-spin" /> Saving...
                    </>
                  ) : savedSuccess ? (
                    <>
                      <Check size={14} color="#16a34a" /> Saved
                    </>
                  ) : (
                    'Update URL'
                  )}
                </button>
              </div>

              {/* Direct application form guidance */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', marginTop: '0.15rem' }}>
                <span style={{ fontWeight: 700, fontSize: '0.92rem', color: 'var(--text-primary, #ededed)' }}>
                  Finding the direct application form
                </span>
                <p style={{ margin: 0, fontSize: '0.86rem', color: 'var(--text-secondary, #a3a3a3)', lineHeight: 1.5 }}>
                  Auto Apply will try to find the company&apos;s direct application form, or you can paste the direct link above.
                </p>
                {activeUrl ? (
                  <div style={{ marginTop: '0.2rem' }}>
                    <a
                      href={activeUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.35rem',
                        color: 'var(--accent-primary, #0070f3)',
                        textDecoration: 'none',
                        fontWeight: 600,
                        fontSize: '0.86rem',
                      }}
                      title="Open original job listing in a new tab"
                    >
                      <ExternalLink size={14} />
                      <span>Open Original Job Post</span>
                    </a>
                  </div>
                ) : null}
              </div>
            </div>
          )}

          {/* Auto Apply Panel with Stepper, Receipt, Quota Bar, and Actions */}
          <AutoApplyPanel
            jobId={jobId}
            jobUrl={effectiveUrl}
            hasAssets={localHasAssets}
            hasResume={hasResume}
            onApplyManually={() => setMode('manual')}
            onAssetsGenerated={onAssetsGenerated}
            onStatusChange={(sess, active) => {
              setActiveSession(sess);
              setIsSessionActive(active);
            }}
          />
        </div>
      )}

      {/* How It Works Modal */}
      {autoApplyEnabled && (
        <AutoApplyHowItWorksModal
          isOpen={isHowItWorksOpen}
          onClose={() => setIsHowItWorksOpen(false)}
        />
      )}
    </div>
  );
}
