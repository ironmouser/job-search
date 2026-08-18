"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw, Edit3, Save, ExternalLink, Copy, Check } from 'lucide-react';
import SyncOverlay from './SyncOverlay';
import { safeCopyToClipboard } from '@/lib/clipboard';

export default function AutoFetchJobDetails({ jobId, jobUrl, initialDescription }: { jobId: string; jobUrl?: string | null; initialDescription?: string | null }) {
  const router = useRouter();
  const [status, setStatus] = useState<'fetching' | 'scoring' | 'error'>('fetching');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [syncMessage, setSyncMessage] = useState('Connecting to job board...');
  const [showManual, setShowManual] = useState(false);
  const [manualText, setManualText] = useState(initialDescription || '');
  const [savingManual, setSavingManual] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopyUrl = async () => {
    if (jobUrl) {
      const success = await safeCopyToClipboard(jobUrl);
      if (success) {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    }
  };

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
      setErrorMessage(null);
      try {
        // Fetch Details
        const fetchRes = await fetch(`/api/jobs/${jobId}/fetch-details`, { method: 'POST' });
        if (!fetchRes.ok) {
          const errData = await fetchRes.json().catch(() => ({}));
          const errMsg = errData.error || 'Failed to scrape full job details';
          if (isMounted) {
            setErrorMessage(errMsg);
            setStatus('error');
          }
          return;
        }

        if (!isMounted) return;
        setStatus('scoring');

        // Score Job
        try {
          await fetch('/api/score', { 
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ jobId }) 
          });
        } catch (scoreErr) {
          console.warn('Auto-score warning:', scoreErr);
        }

        if (!isMounted) return;
        
        // Reload page to show new data
        router.refresh();
      } catch (err: any) {
        console.warn('Error auto-fetching job details:', err?.message || err);
        if (isMounted) {
          setErrorMessage(err?.message || 'Failed to fetch details');
          setStatus('error');
        }
      }
    };

    fetchAndScore();

    return () => {
      isMounted = false;
    };
  }, [jobId, router, retryCount]);

  const handleManualSave = async () => {
    if (!manualText.trim()) return;
    setSavingManual(true);
    try {
      const res = await fetch(`/api/jobs/${jobId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: manualText.trim() })
      });
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        const targetJobId = data.newJobId || jobId;
        
        await fetch('/api/score', { method: 'POST', body: JSON.stringify({ jobId: targetJobId }) });
        
        if (targetJobId !== jobId) {
            router.push(`/job/${targetJobId}`);
        } else {
            router.refresh();
        }
      } else {
        const errData = await res.json().catch(() => ({}));
        alert(errData.error || 'Failed to save description');
      }
    } catch (e) {
      console.error(e);
      alert('Error saving description');
    } finally {
      setSavingManual(false);
    }
  };

  if (showManual || status === 'error') {
    return (
      <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        {status === 'error' && !showManual && (
          <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid var(--danger)', padding: '1rem', borderRadius: '8px', color: 'var(--text-primary)', fontSize: '0.9rem' }}>
            <p style={{ margin: '0 0 0.5rem 0', fontWeight: 600, color: 'var(--danger)' }}>
              Could not automatically extract full job details.
            </p>
            <p style={{ margin: '0 0 0.5rem 0' }}>
              {errorMessage || 'The job board may be blocking automated scrapers.'}
            </p>
            <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
              You can open the source URL below to view the posting, then paste the full job description manually to score this role.
            </p>
          </div>
        )}

        {jobUrl && (
          <div style={{ 
            background: 'rgba(255, 255, 255, 0.04)', 
            border: '1px solid var(--border-glass)', 
            borderRadius: '8px', 
            padding: '1rem', 
            display: 'flex', 
            flexDirection: 'column', 
            gap: '0.6rem' 
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                Job Posting Source URL:
              </span>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  type="button"
                  onClick={handleCopyUrl}
                  className="btn-outline"
                  style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
                >
                  {copied ? <Check size={14} style={{ color: 'var(--success)' }} /> : <Copy size={14} />}
                  {copied ? 'Copied URL!' : 'Copy URL'}
                </button>
                <a
                  href={jobUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-outline"
                  style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem', display: 'inline-flex', alignItems: 'center', gap: '0.35rem', textDecoration: 'none', color: 'var(--accent-primary)' }}
                >
                  <ExternalLink size={14} /> Open Job Page
                </a>
              </div>
            </div>
            <div style={{ 
              fontSize: '0.85rem', 
              color: 'var(--text-primary)', 
              wordBreak: 'break-all', 
              background: 'rgba(0,0,0,0.25)', 
              borderRadius: '6px'
            }}>
              {jobUrl}
            </div>
          </div>
        )}

        {(!showManual && status === 'error') ? (
          <div className="card-action-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem', width: '100%' }}>
            <button 
                onClick={() => setRetryCount(c => c + 1)}
                className="btn-outline full-width-mobile"
                style={{ padding: '0.6rem 1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', minHeight: '44px', width: '100%' }}
            >
                <RefreshCw size={16} /> Retry Auto-Fetch
            </button>
            <button 
                onClick={() => setShowManual(true)}
                className="btn-primary full-width-mobile"
                style={{ padding: '0.6rem 1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', minHeight: '44px', width: '100%' }}
            >
                <Edit3 size={16} /> Paste Description Manually
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <label style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-primary)' }}>
              Paste Full Job Description
            </label>
            <textarea
              value={manualText}
              onChange={(e) => setManualText(e.target.value)}
              placeholder="Paste the full job posting requirements and details here..."
              rows={12}
              style={{
                width: '100%',
                background: 'rgba(0,0,0,0.2)',
                border: '1px solid var(--border-glass)',
                borderRadius: '8px',
                color: 'var(--text-primary)',
                padding: '1rem',
                fontSize: '0.9rem',
                fontFamily: 'inherit',
                resize: 'vertical'
              }}
            />
            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
              <button
                onClick={() => { setShowManual(false); setStatus('fetching'); setRetryCount(c => c + 1); }}
                className="btn-outline"
                disabled={savingManual}
              >
                Cancel & Retry Auto-Fetch
              </button>
              <button
                onClick={handleManualSave}
                disabled={savingManual || !manualText.trim()}
                className="btn-primary"
                style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
              >
                <Save size={16} />
                {savingManual ? 'Saving & Scoring...' : 'Save & Score Job'}
              </button>
            </div>
          </div>
        )}
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
