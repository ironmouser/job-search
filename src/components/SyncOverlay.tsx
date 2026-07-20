"use client";

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';


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
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (isSyncing) {
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = '';
      };
    }
  }, [isSyncing]);

  if (!isSyncing || !mounted) return null;

  return createPortal(
    <div className={`sync-overlay-backdrop ${isSyncing ? 'active' : ''}`}>
      <div className="sync-overlay-content">
        <h2>{title}</h2>
        <p className="sync-overlay-text">{syncMessage}</p>
        <div className="sync-overlay-subtext" style={{ whiteSpace: 'pre-line' }}>
          {subtext}
        </div>

      </div>
    </div>,
    document.body
  );
}
