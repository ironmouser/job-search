"use client";

import { useState } from 'react';
import { Bot, ExternalLink, Copy, CheckCircle, Lock } from 'lucide-react';

export default function AutofillButton({ jobId, jobUrl, jobTitle, jobCompany, isPro = false, appliesThisWeek = 0 }: { jobId: string, jobUrl: string, jobTitle: string, jobCompany: string, isPro?: boolean, appliesThisWeek?: number }) {
  const [isLaunching, setIsLaunching] = useState(false);
  const [copied, setCopied] = useState(false);

  const isLocked = !isPro && appliesThisWeek >= 3;

  const handleAutofill = async () => {
    if (isLocked) {
      alert("Upgrade for unlimited smart applies");
      return;
    }
    
    setIsLaunching(true);
    try {
      const res = await fetch('/api/autofill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId })
      });
      
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to fetch application assets');
      }
      
      const data = await res.json();
      
      // Copy the generated cover letter to the clipboard
      if (data.coverLetter) {
        await navigator.clipboard.writeText(data.coverLetter);
        setCopied(true);
        setTimeout(() => setCopied(false), 3000);
      }

      // Update job status to applied in the background
      fetch(`/api/jobs/${jobId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'applied', applied_at: new Date().toISOString() })
      }).catch(console.error);

      // Check if the URL is an internal circular link due to missing original source
      let targetUrl = jobUrl;
      const isInternalLink = jobUrl.includes('jobagenthq.com') || jobUrl.startsWith('/') || jobUrl.includes('localhost') || jobUrl.includes('railway.app');
      
      if (isInternalLink) {
        const searchQuery = encodeURIComponent(`${jobTitle} ${jobCompany} careers`);
        targetUrl = `https://www.google.com/search?q=${searchQuery}`;
      }

      // Open the job board (or Google search fallback) in a new tab
      window.open(targetUrl, '_blank');
      
      setIsLaunching(false);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      
    } catch (e: any) {
      console.error(e);
      alert(`Error: ${e.message}`);
      setIsLaunching(false);
    }
  };

  return (
    <div style={{ display: 'flex', gap: '0.5rem' }}>
      <button 
        onClick={handleAutofill} 
        disabled={isLaunching}
        className="btn-primary" 
        style={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: '0.5rem', 
          ...(copied ? { background: '#10b981', color: '#fff' } : {}),
          transition: 'background 0.3s'
        }}
      >
        {isLocked ? <Lock size={18} /> : copied ? <Copy size={18} /> : <Bot size={18} className={isLaunching ? "animate-pulse" : ""} />}
        {isLocked ? 'Apply to Job (Locked)' : isLaunching ? 'Preparing...' : copied ? 'Cover Letter Copied! Opening...' : 'Apply to Job (New Tab)'}
      </button>
    </div>
  );
}
