"use client";

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Bot, Copy, Lock, Sparkles, AlertCircle, X, ExternalLink } from 'lucide-react';
import { scrollToTop } from './BackToTopButton';
import UpgradePrompt from './UpgradePrompt';
import { safeCopyToClipboard } from '@/lib/clipboard';

export default function AutofillButton({
  jobId,
  jobUrl,
  jobTitle,
  jobCompany,
  isPro = false,
  appliesThisWeek = 0,
  trialEndsAt,
  totalResumesGenerated,
  totalApplied,
  hasAssets = false,
  generationsLeftThisWeek = 3,
}: {
  jobId: string;
  jobUrl: string;
  jobTitle: string;
  jobCompany: string;
  isPro?: boolean;
  appliesThisWeek?: number;
  trialEndsAt?: Date | string | null;
  totalResumesGenerated?: number;
  totalApplied?: number;
  hasAssets?: boolean;
  generationsLeftThisWeek?: number;
}) {
  const [isLaunching, setIsLaunching] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showUpgradePrompt, setShowUpgradePrompt] = useState(false);

  const [showNoGenerationsModal, setShowNoGenerationsModal] = useState(false);
  const [showPromptGenerateModal, setShowPromptGenerateModal] = useState(false);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const isInTrial = trialEndsAt && new Date(trialEndsAt) > new Date();
  const isEffectivelyPro = isPro || isInTrial;
  const isLocked = !isEffectivelyPro && appliesThisWeek >= 3;

  // Helper to open the job URL directly and mark as applied without asset generation
  const executeDirectApply = () => {
    fetch(`/api/jobs/${jobId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'applied', applied_at: new Date().toISOString() })
    }).catch(console.error);

    let targetUrl = jobUrl;
    const isInternalLink = jobUrl.includes('jobagenthq.com') || jobUrl.startsWith('/') || jobUrl.includes('localhost') || jobUrl.includes('railway.app');

    if (isInternalLink) {
      const searchQuery = encodeURIComponent(`${jobTitle} ${jobCompany} careers`);
      targetUrl = `https://www.google.com/search?q=${searchQuery}`;
    }

    sessionStorage.setItem('just_applied_job_id', jobId);
    window.open(targetUrl, '_blank');
    scrollToTop();
  };

  // Helper to generate assets via API and open job URL
  const handleAutofill = async () => {
    if (isLocked) {
      setShowUpgradePrompt(true);
      return;
    }

    setIsLaunching(true);
    try {
      const res = await fetch('/api/autofill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId })
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        if (data.code === 'LIMIT_REACHED') {
          setShowUpgradePrompt(true);
          setIsLaunching(false);
          return;
        }
        throw new Error(data.error || 'Failed to fetch application assets');
      }

      const data = await res.json();

      if (data.coverLetter) {
        const copiedSuccess = await safeCopyToClipboard(data.coverLetter);
        if (copiedSuccess) {
          setCopied(true);
          setTimeout(() => setCopied(false), 3000);
        }
      }

      fetch(`/api/jobs/${jobId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'applied', applied_at: new Date().toISOString() })
      }).catch(console.error);

      let targetUrl = jobUrl;
      const isInternalLink = jobUrl.includes('jobagenthq.com') || jobUrl.startsWith('/') || jobUrl.includes('localhost') || jobUrl.includes('railway.app');

      if (isInternalLink) {
        const searchQuery = encodeURIComponent(`${jobTitle} ${jobCompany} careers`);
        targetUrl = `https://www.google.com/search?q=${searchQuery}`;
      }

      sessionStorage.setItem('just_applied_job_id', jobId);
      window.open(targetUrl, '_blank');

      setIsLaunching(false);
      scrollToTop();

    } catch (e: any) {
      console.error(e);
      alert(`Error: ${e.message}`);
      setIsLaunching(false);
    }
  };

  // Click handler for "Apply to Job" button
  const handleApplyClick = () => {
    if (isLocked) {
      setShowUpgradePrompt(true);
      return;
    }

    // If assets exist already, generate/fetch them and proceed
    if (hasAssets) {
      handleAutofill();
      return;
    }

    // Assets do NOT exist yet
    // Check if free user is out of weekly generations
    if (!isEffectivelyPro && generationsLeftThisWeek <= 0) {
      setShowNoGenerationsModal(true);
      return;
    }

    // User has generations available -> prompt them
    setShowPromptGenerateModal(true);
  };

  return (
    <div>
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <button
          onClick={handleApplyClick}
          disabled={isLaunching}
          className="btn-primary"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            ...(copied ? { background: '#10b981', color: '#fff' } : {}),
            transition: 'background 0.3s'
          }}
        >
          {isLocked ? <Lock size={18} /> : copied ? <Copy size={18} /> : <Bot size={18} className={isLaunching ? "animate-pulse" : ""} />}
          {isLocked ? 'Apply to Job (Locked)' : isLaunching ? 'Preparing...' : copied ? 'Cover Letter Copied! Opening...' : 'Apply to Job (New Tab)'}
        </button>
      </div>

      {showUpgradePrompt && (
        <UpgradePrompt
          variant="inline"
          feature="autofill"
          stats={{ resumesTailored: totalResumesGenerated, jobsApplied: totalApplied }}
          onDismiss={() => setShowUpgradePrompt(false)}
        />
      )}

      {/* Modal A: Out of weekly generations modal for free users */}
      {isMounted && showNoGenerationsModal && createPortal(
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.6)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '1rem'
        }}>
          <div style={{
            background: 'var(--bg-primary, #0f172a)',
            border: '1px solid var(--border-glass, rgba(255, 255, 255, 0.1))',
            borderRadius: '16px',
            padding: '1.75rem',
            maxWidth: '480px',
            width: '100%',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)',
            position: 'relative',
            color: 'var(--text-primary)'
          }}>
            <button
              onClick={() => setShowNoGenerationsModal(false)}
              style={{
                position: 'absolute',
                top: '1rem',
                right: '1rem',
                background: 'none',
                border: 'none',
                color: 'var(--text-secondary)',
                cursor: 'pointer'
              }}
            >
              <X size={20} />
            </button>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
              <div style={{
                background: 'rgba(239, 68, 68, 0.15)',
                color: '#ef4444',
                padding: '0.6rem',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <AlertCircle size={24} />
              </div>
              <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600 }}>No Generations Left</h3>
            </div>
            <p style={{ color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: '1.5rem', fontSize: '0.95rem' }}>
              You have no more resume and cover letter generations left for the week.
            </p>
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              <button
                onClick={() => setShowNoGenerationsModal(false)}
                className="btn-outline"
                style={{ padding: '0.6rem 1.2rem' }}
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setShowNoGenerationsModal(false);
                  executeDirectApply();
                }}
                className="btn-primary"
                style={{ padding: '0.6rem 1.2rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
              >
                <ExternalLink size={16} /> Proceed to Job Application
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Modal B: Prompt to generate assets before applying */}
      {isMounted && showPromptGenerateModal && createPortal(
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.6)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '1rem'
        }}>
          <div style={{
            background: 'var(--bg-primary, #0f172a)',
            border: '1px solid var(--border-glass, rgba(255, 255, 255, 0.1))',
            borderRadius: '16px',
            padding: '1.75rem',
            maxWidth: '520px',
            width: '100%',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)',
            position: 'relative',
            color: 'var(--text-primary)'
          }}>
            <button
              onClick={() => setShowPromptGenerateModal(false)}
              style={{
                position: 'absolute',
                top: '1rem',
                right: '1rem',
                background: 'none',
                border: 'none',
                color: 'var(--text-secondary)',
                cursor: 'pointer'
              }}
            >
              <X size={20} />
            </button>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
              <div style={{
                background: 'rgba(38, 99, 235, 0.15)',
                color: 'var(--accent-primary)',
                padding: '0.6rem',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <Sparkles size={24} />
              </div>
              <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600 }}>Tailored Assets Not Generated</h3>
            </div>
            <p style={{ color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: '1.5rem', fontSize: '0.95rem' }}>
              You haven't generated a tailored resume, cover letter, and networking message for this job yet. Would you like me to generate them before opening the job application site?
            </p>
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              <button
                onClick={() => {
                  setShowPromptGenerateModal(false);
                  executeDirectApply();
                }}
                className="btn-outline"
                style={{ padding: '0.6rem 1.2rem' }}
              >
                No, Take Me to Job Application
              </button>
              <button
                onClick={() => {
                  setShowPromptGenerateModal(false);
                  handleAutofill();
                }}
                className="btn-primary"
                style={{ padding: '0.6rem 1.2rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
              >
                <Bot size={16} /> Yes, Generate Job Assets
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
