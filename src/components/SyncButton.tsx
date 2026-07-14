"use client";

import { useState } from 'react';
import { RefreshCw } from 'lucide-react';

export default function SyncButton() {
  const [isLoading, setIsLoading] = useState(false);
  const [statusText, setStatusText] = useState('Sync Jobs');

  const handleSync = async () => {
    setIsLoading(true);
    try {
      // 1. Scrape
      setStatusText('Scraping Jobs...');
      await fetch('/api/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });

      // 2. Score
      setStatusText('Scoring Opportunities...');
      await fetch('/api/score', { method: 'POST', body: JSON.stringify({}) });

      // 3. Generate Assets
      setStatusText('Generating Assets...');
      await fetch('/api/generate', { method: 'POST', body: JSON.stringify({}) });

      setStatusText('Done!');
      // Refresh the page to show new data
      window.location.reload();
    } catch (e) {
      console.error(e);
      setStatusText('Error Syncing');
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
