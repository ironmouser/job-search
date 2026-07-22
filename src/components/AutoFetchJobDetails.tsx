"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw } from 'lucide-react';
import SyncOverlay from './SyncOverlay';

export default function AutoFetchJobDetails({ jobId }: { jobId: string }) {
  const router = useRouter();
  const [status, setStatus] = useState<'fetching' | 'scoring' | 'error'>('fetching');
  const [retryCount, setRetryCount] = useState(0);
  const [syncMessage, setSyncMessage] = useState('Connecting to job board...');

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (status === 'fetching') {
        const messages = [
            'Connecting to job board...',
            'Bypassing bot protection...',
            'Extracting full job description...',
            'Reading page content...',
            'Almost there...'
        ];
        let msgIndex = 0;
        interval = setInterval(() => {
            msgIndex = Math.min(msgIndex + 1, messages.length - 1);
            setSyncMessage(messages[msgIndex]);
        }, 4000);
    } else if (status === 'scoring') {
        setSyncMessage('Analyzing and scoring job fit...');
    }
    return () => {
        if (interval) clearInterval(interval);
    };
  }, [status]);

  useEffect(() => {
    let isMounted = true;
    
    const fetchAndScore = async () => {
      setStatus('fetching');
      try {
        // Fetch Details
        const fetchRes = await fetch(`/api/jobs/${jobId}/fetch-details`, { method: 'POST' });
        if (!fetchRes.ok) {
          throw new Error('Failed to fetch details');
        }

        if (!isMounted) return;
        setStatus('scoring');

        // Score Job
        await fetch('/api/score', { method: 'POST', body: JSON.stringify({ jobId }) });

        if (!isMounted) return;
        
        // Reload page to show new data
        router.refresh();
      } catch (err) {
        console.error('Error auto-fetching job details:', err);
        if (isMounted) setStatus('error');
      }
    };

    fetchAndScore();

    return () => {
      isMounted = false;
    };
  }, [jobId, router, retryCount]);

  if (status === 'error') {
    return (
      <div style={{ color: 'var(--error)', padding: '1rem', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
        <p style={{ margin: 0 }}>Failed to fetch job details. The job board might be temporarily blocking our scraper.</p>
        <button 
            onClick={() => setRetryCount(c => c + 1)}
            className="btn-outline"
            style={{ padding: '0.5rem 1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', borderColor: 'var(--error)', color: 'var(--error)' }}
        >
            <RefreshCw size={16} /> Try Again
        </button>
      </div>
    );
  }

  return (
    <>
      <div style={{ padding: '2rem 1rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
        Fetching full job description...
      </div>
      <SyncOverlay 
        isSyncing={true} 
        syncMessage={syncMessage} 
        title="Fetching Details"
        subtext={`We are currently extracting the full job description.\nThis usually takes about 10-15 seconds.`}
      />
    </>
  );
}
