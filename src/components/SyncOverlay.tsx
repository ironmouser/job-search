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
  jobsFoundCount,
  isRefining = false,
  title = "Syncing in Progress",
  subtext = "This could take up to 3 minutes to complete.\nPlease do not close or refresh this page."
}: { 
  isSyncing: boolean; 
  syncMessage: string;
  jobsFoundCount?: number | null;
  isRefining?: boolean;
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

  const displayCount = (jobsFoundCount !== undefined && jobsFoundCount !== null) ? jobsFoundCount : null;

  return createPortal(
    <div className={`sync-overlay-backdrop ${isSyncing ? 'active' : ''}`}>
      <div className="sync-overlay-content">
        <div className="sync-overlay-header">
          <h2>{title}</h2>
          
          {displayCount !== null && (
            <div 
              style={{
                margin: '1rem auto 1.25rem auto',
                padding: '0.75rem 1.25rem',
                background: 'linear-gradient(135deg, rgba(0, 112, 243, 0.12) 0%, rgba(16, 185, 129, 0.14) 100%)',
                border: '1px solid rgba(0, 112, 243, 0.25)',
                borderRadius: '16px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.85rem',
                boxShadow: '0 4px 16px rgba(0, 112, 243, 0.15)',
                maxWidth: '90%'
              }}
            >
              {/* Container with rotating spinner ring around job number */}
              <div 
                style={{
                  position: 'relative',
                  width: '48px',
                  height: '48px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0
                }}
              >
                {/* Rotating SVG Spinner ring */}
                <svg 
                  className="animate-spin" 
                  viewBox="0 0 48 48" 
                  style={{ 
                    position: 'absolute', 
                    top: 0, 
                    left: 0, 
                    width: '100%', 
                    height: '100%', 
                    animation: 'spin 1.2s linear infinite',
                    overflow: 'visible'
                  }}
                >
                  <circle
                    cx="24"
                    cy="24"
                    r="21"
                    fill="none"
                    stroke="rgba(0, 112, 243, 0.2)"
                    strokeWidth="3"
                  />
                  <circle
                    cx="24"
                    cy="24"
                    r="21"
                    fill="none"
                    stroke="#0070f3"
                    strokeWidth="3.5"
                    strokeDasharray="95 38"
                    strokeLinecap="round"
                  />
                </svg>

                {/* Inner solid blue number badge */}
                <div 
                  style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '50%',
                    background: 'linear-gradient(135deg, #0070f3 0%, #0051a2 100%)',
                    color: '#ffffff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 700,
                    fontSize: '0.95rem',
                    boxShadow: '0 2px 8px rgba(0, 112, 243, 0.35)',
                    zIndex: 2,
                    transition: 'transform 0.2s ease',
                    transform: displayCount > 0 ? 'scale(1.05)' : 'scale(1)'
                  }}
                >
                  {displayCount}
                </div>
              </div>

              <div style={{ textAlign: 'left' }}>
                <div style={{ fontSize: '0.925rem', fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.2 }}>
                  {isRefining
                    ? 'Refining your matches...'
                    : (displayCount === 1 ? '1 Job Found So Far' : `${displayCount} Jobs Found So Far`)
                  }
                </div>
                {!isRefining && displayCount === 0 && (
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                    Scanning job sources and active feeds...
                  </div>
                )}
                {isRefining && (
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                    Removing duplicates, poor matches, and roles you already have
                  </div>
                )}
              </div>
            </div>
          )}

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
