"use client";

import { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';

const ANIMATION_SEQUENCE = ['thumbs.mp4', 'lasso.mp4', 'head.mp4', 'fly.mp4'];

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
  const videoRefs = useRef<(HTMLVideoElement | null)[]>([]);

  useEffect(() => {
    setMounted(true);

    // Eagerly preload MP4 video files into browser cache on mount
    if (typeof window !== 'undefined') {
      ANIMATION_SEQUENCE.forEach(filename => {
        fetch(`/${filename}`, { cache: 'force-cache' }).catch(() => {});
        const video = document.createElement('video');
        video.preload = 'auto';
        video.src = `/${filename}`;
      });
    }
  }, []);

  useEffect(() => {
    if (isSyncing) {
      document.body.style.overflow = 'hidden';

      // Pick an initial random animation index when sync starts
      const initialRandom = Math.floor(Math.random() * ANIMATION_SEQUENCE.length);
      setActiveAnimIndex(initialRandom);

      return () => {
        document.body.style.overflow = '';
      };
    }
  }, [isSyncing]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isSyncing) {
      // Switch to a random non-consecutive animation every 10 seconds (10,000 ms)
      interval = setInterval(() => {
        setActiveAnimIndex(prev => getNextRandomIndex(prev, ANIMATION_SEQUENCE.length));
      }, 10000);
    } else {
      setActiveAnimIndex(0);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isSyncing]);

  // Ensure the active video plays continuously
  useEffect(() => {
    if (isSyncing) {
      const activeVideo = videoRefs.current[activeAnimIndex];
      if (activeVideo) {
        activeVideo.currentTime = 0;
        activeVideo.play().catch(() => {});
      }
    }
  }, [activeAnimIndex, isSyncing]);

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
                    ? (displayCount === 1 ? 'Refining 1 Candidate Match...' : `Refining ${displayCount} Candidate Matches...`)
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
                    Filtering duplicates, non-matches & existing list roles
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
        
        {/* MP4 Video Container displaying 10-second looping sequence flush against bottom edge */}
        <div className="tenor-gif-container" style={{ position: 'relative', width: '100%', height: '270px', overflow: 'hidden' }}>
          {ANIMATION_SEQUENCE.map((filename, index) => {
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
                <video
                  ref={el => { videoRefs.current[index] = el; }}
                  src={`/${filename}`}
                  autoPlay
                  loop
                  muted
                  playsInline
                  controls={false}
                  disablePictureInPicture
                  disableRemotePlayback
                  preload="auto"
                  style={{
                    width: '70%',
                    height: '70%',
                    objectFit: 'contain',
                    display: 'block',
                    pointerEvents: 'none',
                    userSelect: 'none',
                    WebkitUserSelect: 'none',
                    outline: 'none',
                    border: 'none',
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
