"use client";

import { useState } from 'react';
import { RefreshCw } from 'lucide-react';

interface SyncButtonProps {
  onSyncStateChange?: (isLoading: boolean, statusText: string) => void;
}

export default function SyncButton({ onSyncStateChange }: SyncButtonProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [statusText, setStatusText] = useState('Sync Jobs');

  const handleSync = async () => {
    setIsLoading(true);
    onSyncStateChange?.(true, 'Scraping Jobs...');
    try {
      // 1. Scrape
      setStatusText('Scraping Jobs...');
      onSyncStateChange?.(true, 'Scraping Jobs...');
      await fetch('/api/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });

      // 2. Score
      setStatusText('Scoring Opportunities...');
      onSyncStateChange?.(true, 'Scoring Opportunities...');
      await fetch('/api/score', { method: 'POST', body: JSON.stringify({}) });

      setStatusText('Done!');
      onSyncStateChange?.(true, 'Done!');
      // Refresh the page to show new data
      window.location.reload();
    } catch (e) {
      console.error(e);
      setStatusText('Error Syncing');
      onSyncStateChange?.(false, 'Error Syncing');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <button className="btn-primary" onClick={handleSync} disabled={isLoading}>
      <RefreshCw size={18} className={isLoading ? "animate-spin" : ""} /> 
      {statusText}
    </button>
  );
}

