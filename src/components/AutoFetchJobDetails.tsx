"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';

export default function AutoFetchJobDetails({ jobId }: { jobId: string }) {
  const router = useRouter();
  const [status, setStatus] = useState<'fetching' | 'scoring' | 'error'>('fetching');

  useEffect(() => {
    let isMounted = true;
    
    const fetchAndScore = async () => {
      try {
        // Fetch Details
        const fetchRes = await fetch(`/api/jobs/${jobId}/fetch-details`, { method: 'POST' });
        if (!fetchRes.ok) {
          throw new Error('Failed to fetch details');
        }

        if (!isMounted) return;
        setStatus('scoring');

        // Score Job
        await fetch('/api/score', { method: 'POST', body: JSON.stringify({}) });

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
  }, [jobId, router]);

  if (status === 'error') {
    return (
      <div style={{ color: 'var(--error)', padding: '1rem', textAlign: 'center' }}>
        Failed to fetch job details. Please try again later.
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '3rem 1rem', color: 'var(--text-secondary)', gap: '1rem' }}>
      <Loader2 className="animate-spin" size={32} color="var(--accent-primary)" />
      <p style={{ margin: 0, fontSize: '1rem' }}>
        {status === 'fetching' ? 'Fetching full job description...' : 'Analyzing and scoring job fit...'}
      </p>
    </div>
  );
}
