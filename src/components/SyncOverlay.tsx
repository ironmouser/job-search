"use client";

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

const SYNC_ANIMATIONS = [
  { id: "18485855", link: "https://tenor.com/view/o2-o2robot-o2ad-bubl-o2bubl-gif-18485855", text: "O2 O2robot GIF" },
  { id: "18485865", link: "https://tenor.com/view/o2-o2robot-o2ad-bubl-o2bubl-gif-18485865", text: "O2 O2robot Sticker" },
  { id: "20473504", link: "https://tenor.com/view/o2-o2bubl-bubl-bubble-cute-gif-20473504", text: "O2 O2bubl Sticker" },
  { id: "23961222", link: "https://tenor.com/view/o2-bubl-robot-blue-fun-gif-23961222", text: "O2 Bubl Sticker" },
  { id: "20473515", link: "https://tenor.com/view/o2-o2bubl-bubl-bubble-cute-gif-20473515", text: "O2 O2bubl Sticker" },
];

export default function SyncOverlay({ 
  isSyncing, 
  syncMessage, 
  title = "Syncing in Progress",
  subtext = "This could take up to 3 minutes to complete.\nPlease do not close or refresh this page."
}: { 
  isSyncing: boolean; 
  syncMessage: string;
  title?: string;
  subtext?: React.ReactNode;
}) {
  const [activeAnimIndex, setActiveAnimIndex] = useState(0);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (isSyncing) {
      document.body.style.overflow = 'hidden';

      // Reload Tenor script to parse newly rendered DOM elements
      const existingScript = document.getElementById("tenor-embed-script");
      if (existingScript) {
        existingScript.remove();
      }
      const script = document.createElement('script');
      script.src = "https://tenor.com/embed.js";
      script.async = true;
      script.id = "tenor-embed-script";
      document.body.appendChild(script);

      return () => {
        document.body.style.overflow = '';
      };
    }
  }, [isSyncing]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isSyncing) {
      interval = setInterval(() => {
        setActiveAnimIndex(prev => (prev + 1) % SYNC_ANIMATIONS.length);
      }, 6000);
    } else {
      setActiveAnimIndex(0);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isSyncing]);

  if (!isSyncing || !mounted) return null;

  return createPortal(
    <div className={`sync-overlay-backdrop ${isSyncing ? 'active' : ''}`}>
      <div className="sync-overlay-content">
        <h2>{title}</h2>
        <p className="sync-overlay-text">{syncMessage}</p>
        <div className="sync-overlay-subtext" style={{ whiteSpace: 'pre-line' }}>
          {typeof subtext === 'string' ? subtext.replace(/\\n/g, '\n') : subtext}
        </div>
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
        </div>      </div>
    </div>,
    document.body
  );
}
