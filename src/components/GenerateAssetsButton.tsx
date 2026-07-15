'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { FileText, Loader2 } from 'lucide-react';

const SYNC_ANIMATIONS = [
  { id: "18485855", link: "https://tenor.com/view/o2-o2robot-o2ad-bubl-o2bubl-gif-18485855", text: "O2 O2robot GIF" },
  { id: "18485865", link: "https://tenor.com/view/o2-o2robot-o2ad-bubl-o2bubl-gif-18485865", text: "O2 O2robot Sticker" },
  { id: "20473504", link: "https://tenor.com/view/o2-o2bubl-bubl-bubble-cute-gif-20473504", text: "O2 O2bubl Sticker" },
  { id: "23961222", link: "https://tenor.com/view/o2-bubl-robot-blue-fun-gif-23961222", text: "O2 Bubl Sticker" },
  { id: "20473515", link: "https://tenor.com/view/o2-o2bubl-bubl-bubble-cute-gif-20473515", text: "O2 O2bubl Sticker" },
];

interface GenerateAssetsButtonProps {
  jobId: string;
  scrollToTopOnClick?: boolean;
}

export default function GenerateAssetsButton({ jobId, scrollToTopOnClick = false }: GenerateAssetsButtonProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [activeAnimIndex, setActiveAnimIndex] = useState(0);
  const router = useRouter();

  useEffect(() => {
    const script = document.createElement('script');
    script.src = "https://tenor.com/embed.js";
    script.async = true;
    script.id = "tenor-embed-script-assets";
    document.body.appendChild(script);

    return () => {
      const existingScript = document.getElementById("tenor-embed-script-assets");
      if (existingScript) {
        existingScript.remove();
      }
    };
  }, []);

  useEffect(() => {
    if (isGenerating) {
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = '';
      };
    }
  }, [isGenerating]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isGenerating) {
      interval = setInterval(() => {
        setActiveAnimIndex(prev => (prev + 1) % SYNC_ANIMATIONS.length);
      }, 6000);
    } else {
      setActiveAnimIndex(0);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
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
          <div className="tenor-gif-container" style={{ position: 'relative' }}>
            {SYNC_ANIMATIONS.map((anim, index) => (
              <div 
                key={anim.id}
                style={{
                  position: 'absolute',
                  top: 0, left: 0, right: 0, bottom: 0,
                  opacity: activeAnimIndex === index ? 1 : 0,
                  transition: 'opacity 0.5s ease',
                  pointerEvents: activeAnimIndex === index ? 'auto' : 'none',
                  zIndex: activeAnimIndex === index ? 2 : 1
                }}
              >
                <div 
                  className="tenor-gif-embed" 
                  data-postid={anim.id} 
                  data-share-method="host" 
                  data-aspect-ratio="1" 
                  data-width="100%"
                >
                  <a href={anim.link}>{anim.text}</a>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
