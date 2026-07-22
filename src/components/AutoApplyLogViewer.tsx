'use client';

import { useEffect, useRef, useState } from 'react';

interface LogEntry {
  id: string;
  timestamp: string;
  level: string;
  step: string;
  message: string;
  durationMs?: number | null;
}

interface AutoApplyLogViewerProps {
  jobId: string;
  sessionId?: string | null;
  isActive?: boolean;
}

export function AutoApplyLogViewer({ jobId, sessionId, isActive }: AutoApplyLogViewerProps) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const fetchLogs = async () => {
    const url = `/api/auto-apply/${jobId}/logs` + (sessionId ? `?sessionId=${sessionId}` : '');
    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      setLogs(data.logs ?? []);
      // Auto-scroll to bottom when new logs arrive
      setTimeout(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
      }, 50);
    }
  };

  // Initial load
  useEffect(() => {
    setLoading(true);
    fetchLogs().finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId, sessionId]);

  // Poll while session is active
  useEffect(() => {
    if (!isActive) return;
    const interval = setInterval(fetchLogs, 3000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive, jobId, sessionId]);

  if (loading && logs.length === 0) {
    return <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textAlign: 'center', padding: '1rem 0' }}>Loading logs…</p>;
  }

  if (logs.length === 0) {
    return (
      <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textAlign: 'center', padding: '1rem 0' }}>
        No logs yet — logs appear here as the worker runs.
      </p>
    );
  }

  return (
    <div
      className="log-viewer"
      ref={scrollRef}
      style={{ maxHeight: '300px', overflowY: 'auto' }}
      id="auto-apply-log-viewer"
    >
      {logs.map((entry) => (
        <div key={entry.id} className="log-entry">
          <span className="log-time">
            {new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </span>
          <span className={`log-level log-level-${entry.level}`}>
            {entry.level.toUpperCase().slice(0, 4)}
          </span>
          <span className="log-message">
            {entry.message}
            {entry.durationMs != null && (
              <span style={{ marginLeft: '0.5rem', color: 'var(--text-muted)', fontSize: '0.7rem' }}>
                ({entry.durationMs}ms)
              </span>
            )}
          </span>
        </div>
      ))}
    </div>
  );
}
