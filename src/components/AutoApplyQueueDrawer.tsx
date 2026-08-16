'use client';

import { useEffect, useState, useCallback } from 'react';
import { Bot, X, Play, Loader2, CheckCircle2, AlertCircle, ChevronDown, ChevronUp, Pause, RefreshCw } from 'lucide-react';
import { AutoApplyStatus } from '@/lib/auto-apply/types';

export interface BatchQueueItem {
  jobId: string;
  title: string;
  company: string;
  status: 'queued' | 'active' | 'applied' | 'failed' | 'needs_intervention';
  sessionId?: string;
  errorMessage?: string;
}

interface AutoApplyQueueDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  items: BatchQueueItem[];
  onItemStatusChange?: (jobId: string, status: string) => void;
}

const MAX_CONCURRENT_ACTIVE = 3;

export function AutoApplyQueueDrawer({
  isOpen,
  onClose,
  items: initialItems,
  onItemStatusChange,
}: AutoApplyQueueDrawerProps) {
  const [queue, setQueue] = useState<BatchQueueItem[]>([]);
  const [collapsed, setCollapsed] = useState(false);
  const [isProcessingQueue, setIsProcessingQueue] = useState(false);

  useEffect(() => {
    setQueue(initialItems);
  }, [initialItems]);

  const activeCount = queue.filter(q => q.status === 'active').length;
  const queuedCount = queue.filter(q => q.status === 'queued').length;
  const completedCount = queue.filter(q => q.status === 'applied').length;
  const failedCount = queue.filter(q => q.status === 'failed' || q.status === 'needs_intervention').length;

  // Process queue to maintain max 3 concurrent active sessions
  const processNextInQueue = useCallback(async () => {
    if (isProcessingQueue) return;
    setIsProcessingQueue(true);

    try {
      const currentActive = queue.filter(q => q.status === 'active').length;
      const availableSlots = MAX_CONCURRENT_ACTIVE - currentActive;

      if (availableSlots <= 0) return;

      const nextToStart = queue.filter(q => q.status === 'queued').slice(0, availableSlots);

      for (const item of nextToStart) {
        // Mark as active locally
        setQueue(prev => prev.map(i => i.jobId === item.jobId ? { ...i, status: 'active' } : i));
        onItemStatusChange?.(item.jobId, 'active');

        // Trigger start API
        try {
          const res = await fetch(`/api/auto-apply/${item.jobId}/start`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ simulationMode: false }),
          });
          const data = await res.json();
          if (res.ok && data.sessionId) {
            setQueue(prev => prev.map(i => i.jobId === item.jobId ? { ...i, sessionId: data.sessionId } : i));
          } else {
            setQueue(prev => prev.map(i => i.jobId === item.jobId ? { ...i, status: 'failed', errorMessage: data.error || 'Failed to start' } : i));
            onItemStatusChange?.(item.jobId, 'failed');
          }
        } catch (err: any) {
          setQueue(prev => prev.map(i => i.jobId === item.jobId ? { ...i, status: 'failed', errorMessage: err.message || 'Network error' } : i));
          onItemStatusChange?.(item.jobId, 'failed');
        }
      }
    } finally {
      setIsProcessingQueue(false);
    }
  }, [queue, isProcessingQueue, onItemStatusChange]);

  // Check active statuses
  useEffect(() => {
    if (!isOpen || queue.length === 0) return;

    const activeItems = queue.filter(q => q.status === 'active' && q.sessionId);
    if (activeItems.length === 0 && queuedCount > 0) {
      processNextInQueue();
      return;
    }

    const interval = setInterval(async () => {
      for (const item of activeItems) {
        try {
          const res = await fetch(`/api/auto-apply/${item.jobId}/status`);
          if (res.ok) {
            const data = await res.json();
            const sessionStatus = data.session?.status;
            if (sessionStatus === AutoApplyStatus.APPLIED) {
              setQueue(prev => prev.map(i => i.jobId === item.jobId ? { ...i, status: 'applied' } : i));
              onItemStatusChange?.(item.jobId, 'applied');
            } else if (sessionStatus === AutoApplyStatus.FAILED) {
              setQueue(prev => prev.map(i => i.jobId === item.jobId ? { ...i, status: 'failed', errorMessage: data.session?.failureReason } : i));
              onItemStatusChange?.(item.jobId, 'failed');
            } else if (sessionStatus === AutoApplyStatus.NEEDS_INTERVENTION) {
              setQueue(prev => prev.map(i => i.jobId === item.jobId ? { ...i, status: 'needs_intervention' } : i));
              onItemStatusChange?.(item.jobId, 'needs_intervention');
            }
          }
        } catch {
          // Ignore polling errors
        }
      }
    }, 4000);

    return () => clearInterval(interval);
  }, [isOpen, queue, queuedCount, processNextInQueue, onItemStatusChange]);

  if (!isOpen || queue.length === 0) return null;

  if (collapsed) {
    return (
      <div
        onClick={() => setCollapsed(false)}
        style={{
          position: 'fixed',
          bottom: '1.5rem',
          left: '1.5rem',
          zIndex: 9980,
          background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
          color: '#ffffff',
          borderRadius: '9999px',
          padding: '0.65rem 1.25rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.6rem',
          boxShadow: '0 10px 25px -5px rgba(37, 99, 235, 0.4)',
          cursor: 'pointer',
          fontWeight: 600,
          fontSize: '0.85rem',
        }}
      >
        <Bot size={18} />
        <span>Queue: {completedCount}/{queue.length} Applied ({activeCount} active)</span>
        <ChevronUp size={16} />
      </div>
    );
  }

  return (
    <div
      style={{
        position: 'fixed',
        bottom: '1.5rem',
        left: '1.5rem',
        zIndex: 9980,
        width: '420px',
        maxWidth: 'calc(100vw - 3rem)',
        background: 'var(--bg-secondary, #0f172a)',
        border: '1px solid var(--border-glass, #334155)',
        borderRadius: '12px',
        padding: '1.1rem',
        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.3), 0 8px 10px -6px rgba(0, 0, 0, 0.2)',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.85rem',
        color: 'var(--text-primary, #f8fafc)',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-glass, #334155)', paddingBottom: '0.6rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Bot size={18} color="#3b82f6" />
          <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>
            Auto Apply Queue ({completedCount}/{queue.length} Done)
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
          <button
            onClick={() => setCollapsed(true)}
            style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '2px' }}
            title="Minimize Drawer"
          >
            <ChevronDown size={17} />
          </button>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '2px' }}
            title="Close Drawer"
          >
            <X size={17} />
          </button>
        </div>
      </div>

      {/* Stats Summary */}
      <div style={{ display: 'flex', gap: '0.75rem', fontSize: '0.78rem', color: '#94a3b8' }}>
        <span style={{ color: '#3b82f6', fontWeight: 600 }}>Active: {activeCount}/{MAX_CONCURRENT_ACTIVE}</span>
        <span>Queued: {queuedCount}</span>
        <span style={{ color: '#10b981', fontWeight: 600 }}>Applied: {completedCount}</span>
        {failedCount > 0 && <span style={{ color: '#ef4444', fontWeight: 600 }}>Action Required: {failedCount}</span>}
      </div>

      {/* Queue List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '220px', overflowY: 'auto', paddingRight: '4px' }}>
        {queue.map((item) => {
          const isAct = item.status === 'active';
          const isApp = item.status === 'applied';
          const isFail = item.status === 'failed' || item.status === 'needs_intervention';
          return (
            <div
              key={item.jobId}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0.5rem 0.75rem',
                borderRadius: '6px',
                background: isAct ? 'rgba(59, 130, 246, 0.1)' : isApp ? 'rgba(16, 185, 129, 0.1)' : isFail ? 'rgba(239, 68, 68, 0.1)' : 'var(--bg-primary, #1e293b)',
                border: `1px solid ${isAct ? 'rgba(59, 130, 246, 0.3)' : isApp ? 'rgba(16, 185, 129, 0.3)' : isFail ? 'rgba(239, 68, 68, 0.3)' : 'var(--border-glass, #334155)'}`,
                fontSize: '0.82rem',
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.1rem', overflow: 'hidden', paddingRight: '0.5rem' }}>
                <span style={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.title}</span>
                <span style={{ fontSize: '0.73rem', color: '#94a3b8' }}>{item.company}</span>
              </div>
              <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                {isAct && <Loader2 size={15} color="#3b82f6" className="animate-spin" />}
                {isApp && <CheckCircle2 size={15} color="#10b981" />}
                {isFail && <AlertCircle size={15} color="#ef4444" />}
                <span style={{
                  fontSize: '0.7rem',
                  fontWeight: 600,
                  textTransform: 'capitalize',
                  color: isAct ? '#3b82f6' : isApp ? '#10b981' : isFail ? '#ef4444' : '#94a3b8',
                }}>
                  {item.status.replace('_', ' ')}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
