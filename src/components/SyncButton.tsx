"use client";

import { useState } from 'react';
import { RefreshCw } from 'lucide-react';

interface SyncButtonProps {
  onSyncStateChange?: (isLoading: boolean, statusText: string) => void;
  onSyncComplete?: (newJobsCount: number) => void;
}

export default function SyncButton({ onSyncStateChange, onSyncComplete }: SyncButtonProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [statusText, setStatusText] = useState('Sync Jobs');

  const handleSync = async () => {
    setIsLoading(true);
    onSyncStateChange?.(true, 'Scraping Jobs...');
    try {
      // 1. Scrape
      setStatusText('Scraping Jobs...');
      onSyncStateChange?.(true, 'Scraping Jobs...');
      const response = await fetch('/api/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        const errorMessage = data.error || 'Failed to sync jobs across active platforms.';
        setStatusText('Sync Error');
        onSyncStateChange?.(false, 'Error Syncing');
        alert(`Could not complete job sync: ${errorMessage}`);
        setTimeout(() => setStatusText('Sync Jobs'), 3500);
        return;
      }

      // Record successful job sync in localStorage
      try {
        localStorage.setItem('job_agent_just_completed_job_sync', 'true');
        localStorage.setItem('job_agent_has_completed_job_sync', 'true');
      } catch (e) {}

      const newJobsCount = data.new_jobs_saved || 0;
      onSyncComplete?.(newJobsCount);

      if (newJobsCount === 0) {
        setStatusText('0 New Jobs');
        onSyncStateChange?.(false, 'No new jobs discovered');
        alert('Sync complete! We scanned your active sources and found 0 new listings matching your current keyword and location settings.');
        setTimeout(() => setStatusText('Sync Jobs'), 3500);
      } else {
        const label = newJobsCount === 1 ? 'Added 1 Job!' : `Added ${newJobsCount} Jobs!`;
        setStatusText(label);
        onSyncStateChange?.(true, label);
        setTimeout(() => {
          window.location.reload();
        }, 1200);
      }
    } catch (e) {
      console.error(e);
      setStatusText('Error Syncing');
      onSyncStateChange?.(false, 'Error Syncing');
      alert('An unexpected network error occurred while attempting to sync jobs.');
      setTimeout(() => setStatusText('Sync Jobs'), 3500);
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

