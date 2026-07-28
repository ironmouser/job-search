"use client";

import { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { getS3AssetUrl } from '@/lib/s3';

const GIF_SEQUENCE = ['thumbs.gif', 'lasso.gif', 'head.gif', 'fly.gif'];

/**
 * Returns a random index from 0 to total-1 that is guaranteed not equal to currentIndex.
 */
function getNextRandomIndex(currentIndex: number, total: number): number {
  if (total <= 1) return 0;
  let nextIndex: number;
  do {
    nextIndex = Math.floor(Math.random() * total);
  } while (nextIndex === currentIndex);
  return nextIndex;
}

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
  const [imgSources, setImgSources] = useState<Record<string, string>>({});
  const [isPreloaded, setIsPreloaded] = useState(false);

  useEffect(() => {
    setMounted(true);

    // Pre-initialize S3 image URLs & aggressively preload all GIFs into browser cache
    const initialSources: Record<string, string> = {};
    let loadedCount = 0;
    const totalCount = GIF_SEQUENCE.length;

    const checkAllLoaded = () => {
      loadedCount++;
      if (loadedCount >= totalCount) {
        setIsPreloaded(true);
      }
    };

    GIF_SEQUENCE.forEach(filename => {
      const url = getS3AssetUrl(filename);
      initialSources[filename] = url;
      
      // Eager browser memory preloading
      if (typeof window !== 'undefined') {
        const img = new Image();
        img.onload = checkAllLoaded;
        img.onerror = () => {
          // Fallback to local public path if S3 fails
          initialSources[filename] = `/${filename}`;
          checkAllLoaded();
        };
        img.src = url;
      }
    });
    setImgSources(initialSources);
  }, []);

  useEffect(() => {
    if (isSyncing) {
      document.body.style.overflow = 'hidden';

      // Pick an initial random animation index when sync starts
      const initialRandom = Math.floor(Math.random() * GIF_SEQUENCE.length);
      setActiveAnimIndex(initialRandom);

      // Re-trigger preloading when overlay becomes active to ensure instant playback
      GIF_SEQUENCE.forEach(filename => {
        const src = imgSources[filename] || getS3AssetUrl(filename);
        const img = new Image();
        img.src = src;
      });

      return () => {
        document.body.style.overflow = '';
      };
    }
  }, [isSyncing, imgSources]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isSyncing) {
      // Switch to a random non-consecutive GIF every 10 seconds (10,000 ms)
      interval = setInterval(() => {
        setActiveAnimIndex(prev => getNextRandomIndex(prev, GIF_SEQUENCE.length));
      }, 10000);
    } else {
      setActiveAnimIndex(0);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isSyncing]);

  const handleImageError = (filename: string) => {
    // If S3 URL fails to load, fallback to public folder
    setImgSources(prev => {
      if (prev[filename] !== `/${filename}`) {
        return { ...prev, [filename]: `/${filename}` };
      }
      return prev;
    });
  };

  if (!isSyncing || !mounted) return null;

  return createPortal(
    <div className={`sync-overlay-backdrop ${isSyncing ? 'active' : ''}`}>
      <div className="sync-overlay-content">
        <div className="sync-overlay-header">
          <h2>{title}</h2>
          <p className="sync-overlay-text">{syncMessage}</p>
          <div className="sync-overlay-subtext" style={{ whiteSpace: 'pre-line' }}>
            {typeof subtext === 'string' ? subtext.replace(/\\n/g, '\n') : subtext}
          </div>
        </div>
        
        {/* GIF Container displaying 10-second looping sequence flush against bottom edge */}
        <div className="tenor-gif-container" style={{ position: 'relative', width: '100%', height: '270px', overflow: 'hidden' }}>
          {GIF_SEQUENCE.map((filename, index) => {
            const src = imgSources[filename] || getS3AssetUrl(filename);
            const isActive = activeAnimIndex === index;

            return (
              <div 
                key={filename}
                style={{
                  position: 'absolute',
                  top: 0, 
                  left: 0, 
                  right: 0, 
                  bottom: 0,
                  opacity: isActive ? 1 : 0,
                  transition: 'opacity 0.6s ease-in-out',
                  pointerEvents: isActive ? 'auto' : 'none',
                  zIndex: isActive ? 2 : 1,
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                  overflow: 'hidden',
                }}
              >
                <img
                  src={src}
                  alt={`Syncing animation ${index + 1}`}
                  loading="eager"
                  onError={() => handleImageError(filename)}
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                    display: 'block',
                  }}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>,
    document.body
  );
}
