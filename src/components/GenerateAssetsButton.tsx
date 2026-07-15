'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { FileText, Loader2 } from 'lucide-react';

interface GenerateAssetsButtonProps {
  jobId: string;
  scrollToTopOnClick?: boolean;
}

export default function GenerateAssetsButton({ jobId, scrollToTopOnClick = false }: GenerateAssetsButtonProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const router = useRouter();

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
  );
}
