'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { FileText, Loader2 } from 'lucide-react';
import SyncOverlay from './SyncOverlay';
import { scrollToTop } from './BackToTopButton';
import UpgradePrompt from './UpgradePrompt';

interface GenerateAssetsButtonProps {
  jobId: string;
  scrollToTopOnClick?: boolean;
  userPlanTier?: string;
  generationsLeftThisWeek?: number;
  trialEndsAt?: Date | string | null;
  // Stats for contextual upgrade prompt
  totalResumesGenerated?: number;
  totalApplied?: number;
}

export default function GenerateAssetsButton({
  jobId,
  scrollToTopOnClick = false,
  userPlanTier = 'FREE',
  generationsLeftThisWeek,
  trialEndsAt,
  totalResumesGenerated,
  totalApplied,
}: GenerateAssetsButtonProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [showUpgradePrompt, setShowUpgradePrompt] = useState(false);
  const router = useRouter();

  const handleGenerate = async () => {
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
        } else {
          alert(data.error || 'Failed to generate assets.');
        }
      }
    } catch (e) {
      console.error(e);
      alert('An error occurred while generating assets.');
    } finally {
      setIsGenerating(false);
    }
  };

  const isPro = userPlanTier === 'PRO' || (trialEndsAt && new Date(trialEndsAt) > new Date());

  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <button
          onClick={handleGenerate}
          disabled={isGenerating}
          className="btn-outline"
          style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', whiteSpace: 'nowrap' }}
        >
          {isGenerating ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              Generating...
            </>
          ) : (
            <>
              <FileText size={16} />
              Generate Assets
            </>
          )}
        </button>
        {!isPro && (
          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.35rem', textAlign: 'center', whiteSpace: 'nowrap' }}>
            {generationsLeftThisWeek !== undefined
              ? `${generationsLeftThisWeek} generation${generationsLeftThisWeek === 1 ? '' : 's'} left this week`
              : '3 generations left this week'}
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

      <SyncOverlay
        isSyncing={isGenerating}
        title="Generating Assets"
        syncMessage="Crafting personalized cover letter and resume..."
        subtext={"This could take up to 30 seconds to complete.\nPlease do not close or refresh this page."}
      />
    </>
  );
}
