"use client";

import { useState } from 'react';
import { Bot, Copy, Lock } from 'lucide-react';
import { scrollToTop } from './BackToTopButton';
import UpgradePrompt from './UpgradePrompt';

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
}) {
  const [isLaunching, setIsLaunching] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showUpgradePrompt, setShowUpgradePrompt] = useState(false);

  const isInTrial = trialEndsAt && new Date(trialEndsAt) > new Date();
  const isEffectivelyPro = isPro || isInTrial;
  const isLocked = !isEffectivelyPro && appliesThisWeek >= 3;

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

      // Copy the generated cover letter to the clipboard
      if (data.coverLetter) {
        await navigator.clipboard.writeText(data.coverLetter);
        setCopied(true);
        setTimeout(() => setCopied(false), 3000);
      }

      // Update job status to applied in the background
      fetch(`/api/jobs/${jobId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'applied', applied_at: new Date().toISOString() })
      }).catch(console.error);

      // Check if the URL is an internal circular link due to missing original source
      let targetUrl = jobUrl;
      const isInternalLink = jobUrl.includes('jobagenthq.com') || jobUrl.startsWith('/') || jobUrl.includes('localhost') || jobUrl.includes('railway.app');

      if (isInternalLink) {
        const searchQuery = encodeURIComponent(`${jobTitle} ${jobCompany} careers`);
        targetUrl = `https://www.google.com/search?q=${searchQuery}`;
      }

      // Mark this job as just-applied so the dashboard can show confetti
      sessionStorage.setItem('just_applied_job_id', jobId);

      // Open the job board (or Google search fallback) in a new tab
      window.open(targetUrl, '_blank');

      setIsLaunching(false);
      scrollToTop();

    } catch (e: any) {
      console.error(e);
      alert(`Error: ${e.message}`);
      setIsLaunching(false);
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <button
          onClick={handleAutofill}
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
    </div>
  );
}
