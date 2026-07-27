'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { FileText, Loader2 } from 'lucide-react';
import SyncOverlay from './SyncOverlay';
import { scrollToTop } from './BackToTopButton';

interface GenerateAssetsButtonProps {
  jobId: string;
  scrollToTopOnClick?: boolean;
  userPlanTier?: string;
  generationsLeftThisWeek?: number;
}

export default function GenerateAssetsButton({ jobId, scrollToTopOnClick = false, userPlanTier = 'FREE', generationsLeftThisWeek }: GenerateAssetsButtonProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const router = useRouter();

  const handleGenerate = async () => {
    if (isGenerating) return;
    
    if (userPlanTier !== 'PRO' && generationsLeftThisWeek !== undefined && generationsLeftThisWeek <= 0) {
      alert('Free accounts are limited to 3 asset generations per week. Please upgrade to Pro for unlimited generation.');
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
        alert(data.error || 'Failed to generate assets. Please ensure you are on the PRO plan if required.');
      }
    } catch (e) {
      console.error(e);
      alert('An error occurred while generating assets.');
    } finally {
      setIsGenerating(false);
    }
  };

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
        {userPlanTier !== 'PRO' && (
          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.35rem', textAlign: 'center', whiteSpace: 'nowrap' }}>
            {generationsLeftThisWeek !== undefined 
              ? `${generationsLeftThisWeek} generation${generationsLeftThisWeek === 1 ? '' : 's'} left this week for free account` 
              : '3 generations left this week for free account'}
          </span>
        )}
      </div>

      <SyncOverlay 
        isSyncing={isGenerating}
        title="Generating Assets"
        syncMessage="Crafting personalized cover letter and resume..."
        subtext={"This could take up to 30 seconds to complete.\nPlease do not close or refresh this page."}
      />
    </>
  );
}
