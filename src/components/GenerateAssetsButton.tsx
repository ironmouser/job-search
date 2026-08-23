'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { FileText, Loader2 } from 'lucide-react';
import SyncOverlay from './SyncOverlay';
import { scrollToTop } from './BackToTopButton';
import UpgradePrompt from './UpgradePrompt';
import JitResumeUploadModal from './common/JitResumeUploadModal';

interface GenerateAssetsButtonProps {
  jobId: string;
  scrollToTopOnClick?: boolean;
  userPlanTier?: string;
  hasResume?: boolean;
  generationsLeftThisWeek?: number;
  trialEndsAt?: Date | string | null;
  // Stats for contextual upgrade prompt
  totalResumesGenerated?: number;
  totalApplied?: number;
  buttonLabel?: string;
}

export default function GenerateAssetsButton({
  jobId,
  scrollToTopOnClick = false,
  userPlanTier = 'FREE',
  hasResume,
  generationsLeftThisWeek,
  trialEndsAt,
  totalResumesGenerated,
  totalApplied,
  buttonLabel,
}: GenerateAssetsButtonProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [showUpgradePrompt, setShowUpgradePrompt] = useState(false);
  const [isJitResumeOpen, setIsJitResumeOpen] = useState(false);
  const [localHasResume, setLocalHasResume] = useState<boolean | undefined>(hasResume);
  const router = useRouter();

  useEffect(() => {
    setLocalHasResume(hasResume);
  }, [hasResume]);

  const executeGenerate = async () => {
    if (isGenerating) return;

    if (userPlanTier !== 'PRO' && !trialEndsAt && generationsLeftThisWeek !== undefined && generationsLeftThisWeek <= 0) {
      setShowUpgradePrompt(true);
      return;
    }

    setIsGenerating(true);
    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId })
      });

      if (res.ok) {
        if (scrollToTopOnClick) {
          scrollToTop();
        }
        router.refresh();
      } else {
        const data = await res.json();
        if (data.code === 'LIMIT_REACHED') {
          setShowUpgradePrompt(true);
        } else if (data.errorCode === 'MISSING_BASE_RESUME') {
          setLocalHasResume(false);
          setIsJitResumeOpen(true);
        } else {
          alert(data.error || 'Failed to generate tailored application documents.');
        }
      }
    } catch (e) {
      console.error(e);
      alert('An error occurred while generating application documents.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleGenerateClick = () => {
    if (localHasResume === false) {
      setIsJitResumeOpen(true);
      return;
    }
    executeGenerate();
  };

  const handleResumeUploadSuccess = () => {
    setLocalHasResume(true);
    setIsJitResumeOpen(false);
    setTimeout(() => {
      executeGenerate();
    }, 100);
  };

  const isPro = userPlanTier === 'PRO' || (trialEndsAt && new Date(trialEndsAt) > new Date());

  return (
    <>
      <div className="full-width-mobile" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
        <button
          onClick={handleGenerateClick}
          disabled={isGenerating}
          className="btn-outline full-width-mobile"
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', whiteSpace: 'nowrap', minHeight: '44px', width: '100%' }}
        >
          {isGenerating ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              Generating...
            </>
          ) : (
            <>
              <FileText size={16} />
              {buttonLabel || 'Generate Tailor Resume & Cover Letter for'}
            </>
          )}
        </button>
        {!isPro && (
          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.35rem', textAlign: 'center', whiteSpace: 'nowrap' }}>
            {generationsLeftThisWeek !== undefined
              ? `${generationsLeftThisWeek} generation${generationsLeftThisWeek === 1 ? '' : 's'} left this week`
              : '1 generation left this week'}
          </span>
        )}
      </div>

      {showUpgradePrompt && (
        <UpgradePrompt
          variant="inline"
          feature="generation"
          stats={{ resumesTailored: totalResumesGenerated, jobsApplied: totalApplied }}
          onDismiss={() => setShowUpgradePrompt(false)}
        />
      )}

      <JitResumeUploadModal
        isOpen={isJitResumeOpen}
        onClose={() => setIsJitResumeOpen(false)}
        onSuccess={handleResumeUploadSuccess}
        title="Upload Resume to Tailor Application"
        description="To generate tailored resumes and cover letters for this job, please upload your base resume."
      />

      <SyncOverlay
        isSyncing={isGenerating}
        title="Tailoring Application"
        syncMessage="Crafting personalized cover letter and resume..."
        subtext={"This could take up to 30 seconds to complete.\nPlease do not close or refresh this page."}
        onClose={() => setIsGenerating(false)}
      />
    </>
  );
}
