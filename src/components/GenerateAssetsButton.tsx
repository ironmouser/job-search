'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { FileText, Loader2 } from 'lucide-react';


interface GenerateAssetsButtonProps {
  jobId: string;
  scrollToTopOnClick?: boolean;
}

export default function GenerateAssetsButton({ jobId, scrollToTopOnClick = false }: GenerateAssetsButtonProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (isGenerating) {
      document.body.style.overflow = 'hidden';

      return () => {
        document.body.style.overflow = '';
      };
    }
  }, [isGenerating]);

  const handleGenerate = async () => {
    if (isGenerating) return;
    
    setIsGenerating(true);
    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId })
      });

      if (res.ok) {
        if (scrollToTopOnClick) {
          window.scrollTo({ top: 0, behavior: 'smooth' });
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

      <div className={`sync-overlay-backdrop ${isGenerating ? 'active' : ''}`}>
        <div className="sync-overlay-content">
          <h2>Generating Assets</h2>
          <p className="sync-overlay-text">Crafting personalized cover letter and resume...</p>
          <p className="sync-overlay-subtext">
            This could take up to 30 seconds to complete.<br />
            Please do not close or refresh this page.
          </p>

        </div>
      </div>
    </>
  );
}
