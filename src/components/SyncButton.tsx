"use client";

import { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { trackJobSyncStart, trackJobSyncSuccess, trackJobSyncError } from '@/lib/analytics';

interface SyncButtonProps {
  onSyncStateChange?: (isLoading: boolean, statusText: string, jobsFoundCount?: number, isRefining?: boolean) => void;
  onSyncComplete?: (newJobsCount: number) => void;
  compact?: boolean;
}

export default function SyncButton({ onSyncStateChange, onSyncComplete, compact = false }: SyncButtonProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [statusText, setStatusText] = useState('Search for Jobs');

  const handleSync = async () => {
    setIsLoading(true);
    setStatusText('Searching 20+ Job Boards...');
    onSyncStateChange?.(true, 'Initiating Omni-Scrape across job boards...', 0);
    trackJobSyncStart();
    
    try {
      const response = await fetch('/api/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        const errorMessage = data.error || 'Failed to search online jobs across active platforms.';
        setStatusText('Search Error');
        onSyncStateChange?.(false, 'Error Searching');
        trackJobSyncError(errorMessage);
        alert(`Could not complete job search: ${errorMessage}`);
        setTimeout(() => setStatusText('Search for Jobs'), 3500);
        return;
      }

      let data: any = {};
      let runningCount = 0;

      if (response.body) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            try {
              // Strip SSE 'data: ' prefix if present
              const jsonStr = trimmed.startsWith('data: ') ? trimmed.slice(6) : trimmed;
              const payload = JSON.parse(jsonStr);
              if (typeof payload.foundCount === 'number') {
                runningCount = payload.foundCount;
                const isRefining = payload.type === 'normalization';
                onSyncStateChange?.(true, payload.message || `Found ${runningCount} possible matches...`, runningCount, isRefining);
              }
              if (payload.type === 'complete' || payload.new_jobs_saved !== undefined) {
                data = payload;
              }
            } catch (e) {}
          }
        }

        if (buffer.trim()) {
          try {
            const raw = buffer.trim();
            const jsonStr = raw.startsWith('data: ') ? raw.slice(6) : raw;
            const payload = JSON.parse(jsonStr);
            if (typeof payload.foundCount === 'number') {
              runningCount = payload.foundCount;
            }
            if (payload.type === 'complete' || payload.new_jobs_saved !== undefined) {
              data = payload;
            }
          } catch (e) {}
        }
      } else {
        data = await response.json().catch(() => ({}));
      }

      // Record successful job sync in localStorage
      try {
        localStorage.setItem('job_agent_just_completed_job_sync', 'true');
        localStorage.setItem('job_agent_has_completed_job_sync', 'true');
      } catch (e) {}

      const newJobsCount = data.new_jobs_saved || 0;
      trackJobSyncSuccess(runningCount, newJobsCount);
      onSyncComplete?.(newJobsCount);

      if (newJobsCount === 0) {
        setStatusText('0 New Jobs Found');
        onSyncStateChange?.(false, 'No new jobs discovered');
        alert('Search complete! We scanned your active sources and found 0 new listings matching your current keyword and location settings.');
        setTimeout(() => {
          setStatusText('Search for Jobs');
          // Refresh in case server saved jobs that weren't reflected in the count
          window.location.reload();
        }, 1500);
      } else {
        const label = newJobsCount === 1 ? 'Found 1 New Job!' : `Found ${newJobsCount} New Jobs!`;
        setStatusText(label);
        onSyncStateChange?.(true, label, runningCount);
        setTimeout(() => {
          window.location.reload();
        }, 1200);
      }
    } catch (e: any) {
      console.error(e);
      const errStr = e?.message || 'Unexpected network error';
      setStatusText('Search Error');
      onSyncStateChange?.(false, 'Error Searching');
      trackJobSyncError(errStr);
      alert('An unexpected network error occurred while attempting to search online jobs.');
      setTimeout(() => setStatusText('Search for Jobs'), 3500);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <button 
      className="btn-primary" 
      onClick={handleSync} 
      disabled={isLoading}
      style={{
        padding: compact ? '0.4rem 0.85rem' : '0.85rem 1.6rem',
        borderRadius: compact ? '9999px' : '12px',
        fontWeight: 600,
        fontSize: compact ? '0.85rem' : '1rem',
        background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
        color: '#ffffff',
        boxShadow: compact ? '0 2px 10px rgba(37, 99, 235, 0.3)' : '0 4px 24px rgba(37, 99, 235, 0.45)',
        display: 'flex',
        alignItems: 'center',
        gap: compact ? '0.4rem' : '0.65rem',
        cursor: isLoading ? 'not-allowed' : 'pointer',
        border: 'none',
        whiteSpace: 'nowrap'
      }}
    >
      <RefreshCw size={compact ? 15 : 20} className={isLoading ? "animate-spin" : ""} /> 
      <span>{statusText}</span>
    </button>
  );
}

