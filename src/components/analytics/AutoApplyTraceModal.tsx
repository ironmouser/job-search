'use client';

import React, { useEffect, useState, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  ExternalLink,
  Copy,
  Check,
  Search,
  Filter,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Clock,
  Zap,
  Terminal,
  Cpu,
  Layers,
  HelpCircle,
  ChevronDown,
  ChevronRight,
  Shield,
  FileText,
  Bot,
  User as UserIcon,
} from 'lucide-react';

export interface TraceLogEntry {
  id: string;
  timestamp: string;
  level: string;
  step: string;
  message: string;
  metadata?: Record<string, any> | null;
  durationMs?: number | null;
  screenshotPath?: string | null;
}

export interface TraceInterventionItem {
  id: string;
  reason: string;
  description: string;
  screenshotUrl?: string | null;
  pageUrl?: string | null;
  resolvedAt?: string | null;
  resolution?: string | null;
  createdAt: string;
}

export interface TraceSessionData {
  id: string;
  sessionId: string;
  userId: string;
  userName: string;
  userEmail: string;
  userPlan?: string;
  userRole?: string;
  jobId: string;
  jobTitle: string;
  company: string;
  jobUrl: string;
  applicationUrl: string;
  location?: string;
  status: string;
  statusCategory: string;
  statusDisplay: string;
  atsPlatform: string;
  atsConfidence?: number | null;
  automationConfidence?: number | null;
  simulationMode: boolean;
  failureReason?: string | null;
  failureDetails?: string | null;
  currentStep?: string | null;
  stepsCompleted?: number;
  stepsTotal?: number | null;
  retryCount?: number;
  maxRetries?: number;
  workerId?: string | null;
  confirmationNumber?: string | null;
  confirmationScreenshotUrl?: string | null;
  submittedAnswersSummary?: any;
  questionsAnsweredCount?: number;
  startedAt?: string | null;
  completedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  latencyMs?: number | null;
  latencyFormatted: string;
  queueLatencyMs?: number | null;
  tokenUsage?: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    estimatedCostUsd: number;
  };
  summary: string;
  interventionsCount: number;
  logsCount: number;
}

interface AutoApplyTraceModalProps {
  session: TraceSessionData | null;
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Parses plain text containing URLs and renders clickable hyperlinks
 * that open in a new window/tab safely with external icons.
 */
function renderLinkifiedText(text: string): React.ReactNode {
  if (!text) return null;

  // Regex to match URLs (http, https)
  const urlRegex = /(https?:\/\/[^\s<>"'()]+)/g;
  const parts = text.split(urlRegex);

  return parts.map((part, index) => {
    if (part.match(urlRegex)) {
      return (
        <a
          key={index}
          href={part}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          style={{
            color: '#60a5fa',
            textDecoration: 'underline',
            wordBreak: 'break-all',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '2px',
            fontWeight: 500,
          }}
          title={`Open ${part} in a new tab`}
        >
          {part}
          <ExternalLink size={11} style={{ display: 'inline', verticalAlign: 'middle', flexShrink: 0 }} />
        </a>
      );
    }
    return part;
  });
}

export function AutoApplyTraceModal({ session, isOpen, onClose }: AutoApplyTraceModalProps) {
  const [mounted, setMounted] = useState<boolean>(false);
  const [logs, setLogs] = useState<TraceLogEntry[]>([]);
  const [interventions, setInterventions] = useState<TraceInterventionItem[]>([]);
  const [loadingLogs, setLoadingLogs] = useState<boolean>(false);
  const [logFilterLevel, setLogFilterLevel] = useState<string>('ALL');
  const [logSearchQuery, setLogSearchQuery] = useState<string>('');
  const [copiedLogs, setCopiedLogs] = useState<boolean>(false);
  const [expandedMetadataIds, setExpandedMetadataIds] = useState<Set<string>>(new Set());
  const [activeSubTab, setActiveSubTab] = useState<'logs' | 'overview' | 'answers' | 'interventions'>('logs');

  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Fetch full execution logs for this session
  const fetchSessionLogs = async () => {
    if (!session?.id) return;
    try {
      setLoadingLogs(true);
      const res = await fetch(`/api/system-analytics/sessions/${session.id}/logs`);
      if (res.ok) {
        const data = await res.json();
        setLogs(data.logs || []);
        setInterventions(data.interventions || []);
      }
    } catch (err) {
      console.error('Failed to fetch session logs:', err);
    } finally {
      setLoadingLogs(false);
    }
  };

  useEffect(() => {
    if (isOpen && session?.id) {
      setLogSearchQuery('');
      setLogFilterLevel('ALL');
      setExpandedMetadataIds(new Set());
      setActiveSubTab('logs');
      fetchSessionLogs();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, session?.id]);

  // Handle ESC key to close modal
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const toggleMetadata = (id: string) => {
    setExpandedMetadataIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleCopyLogs = () => {
    if (!logs.length && !session) return;
    const header = `=== AUTO APPLY TRACE LOGS ===\nSession ID: ${session?.id}\nUser: ${session?.userName} (${session?.userEmail})\nJob: ${session?.jobTitle} @ ${session?.company}\nStatus: ${session?.statusDisplay} (${session?.status})\nATS: ${session?.atsPlatform}\nTokens: ${session?.tokenUsage?.totalTokens || 0}\nLatency: ${session?.latencyFormatted}\nDate: ${session?.createdAt}\n\n`;

    const logLines = filteredLogs.map((log) => {
      const time = new Date(log.timestamp).toISOString();
      const meta = log.metadata ? ` | Meta: ${JSON.stringify(log.metadata)}` : '';
      const dur = log.durationMs != null ? ` (${log.durationMs}ms)` : '';
      return `[${time}] [${log.level.toUpperCase()}] [${log.step}] ${log.message}${dur}${meta}`;
    }).join('\n');

    navigator.clipboard.writeText(header + logLines);
    setCopiedLogs(true);
    setTimeout(() => setCopiedLogs(false), 2000);
  };

  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      if (logFilterLevel !== 'ALL' && log.level.toUpperCase() !== logFilterLevel) {
        return false;
      }
      if (logSearchQuery.trim()) {
        const q = logSearchQuery.toLowerCase();
        const msgMatch = log.message.toLowerCase().includes(q);
        const stepMatch = log.step.toLowerCase().includes(q);
        const metaMatch = log.metadata ? JSON.stringify(log.metadata).toLowerCase().includes(q) : false;
        return msgMatch || stepMatch || metaMatch;
      }
      return true;
    });
  }, [logs, logFilterLevel, logSearchQuery]);

  if (!isOpen || !session || !mounted || typeof document === 'undefined') {
    return null;
  }

  const getStatusBadgeStyle = (cat: string) => {
    switch (cat) {
      case 'complete':
        return { bg: 'rgba(52, 211, 153, 0.15)', text: '#34d399', border: '1px solid rgba(52, 211, 153, 0.3)' };
      case 'failed':
        return { bg: 'rgba(239, 68, 68, 0.15)', text: '#f87171', border: '1px solid rgba(239, 68, 68, 0.3)' };
      case 'canceled':
        return { bg: 'rgba(148, 163, 184, 0.15)', text: '#94a3b8', border: '1px solid rgba(148, 163, 184, 0.3)' };
      case 'simulated':
        return { bg: 'rgba(168, 85, 247, 0.15)', text: '#c084fc', border: '1px solid rgba(168, 85, 247, 0.3)' };
      case 'queued':
        return { bg: 'rgba(56, 189, 248, 0.15)', text: '#38bdf8', border: '1px solid rgba(56, 189, 248, 0.3)' };
      default:
        return { bg: 'rgba(251, 191, 36, 0.15)', text: '#fbbf24', border: '1px solid rgba(251, 191, 36, 0.3)' };
    }
  };

  const getLevelStyle = (level: string) => {
    switch (level.toLowerCase()) {
      case 'error':
        return { bg: 'rgba(239,68,68,0.2)', text: '#f87171', border: 'rgba(239,68,68,0.3)' };
      case 'warn':
        return { bg: 'rgba(251,191,36,0.2)', text: '#fbbf24', border: 'rgba(251,191,36,0.3)' };
      case 'debug':
        return { bg: 'rgba(148,163,184,0.2)', text: '#94a3b8', border: 'rgba(148,163,184,0.3)' };
      default:
        return { bg: 'rgba(56,189,248,0.2)', text: '#38bdf8', border: 'rgba(56,189,248,0.3)' };
    }
  };

  const statusStyle = getStatusBadgeStyle(session.statusCategory);

  const modalContent = (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        backgroundColor: 'rgba(10, 14, 23, 0.82)',
        padding: '1rem',
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '1080px',
          maxHeight: '92vh',
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: '#111827',
          border: '1px solid rgba(255, 255, 255, 0.12)',
          borderRadius: '16px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)',
          overflow: 'hidden',
          color: '#f3f4f6',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: '1.25rem 1.5rem',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
            backgroundColor: '#172033',
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: '1rem',
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap', marginBottom: '0.4rem' }}>
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  padding: '3px 10px',
                  borderRadius: '99px',
                  fontSize: '0.78rem',
                  fontWeight: 700,
                  background: statusStyle.bg,
                  color: statusStyle.text,
                  border: statusStyle.border,
                }}
              >
                {session.statusCategory === 'complete' && <CheckCircle2 size={13} />}
                {session.statusCategory === 'failed' && <AlertCircle size={13} />}
                {session.statusCategory === 'in_progress' && <RefreshCw size={13} className="spin" />}
                {session.statusDisplay}
              </div>

              <span
                style={{
                  fontSize: '0.75rem',
                  padding: '2px 8px',
                  borderRadius: '6px',
                  background: 'rgba(99,102,241,0.15)',
                  color: '#818cf8',
                  border: '1px solid rgba(99,102,241,0.25)',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                }}
              >
                {session.atsPlatform || 'Generic ATS'}
                {session.atsConfidence ? ` (${session.atsConfidence}%)` : ''}
              </span>

              {session.simulationMode ? (
                <span
                  style={{
                    fontSize: '0.75rem',
                    padding: '2px 8px',
                    borderRadius: '6px',
                    background: 'rgba(168,85,247,0.15)',
                    color: '#c084fc',
                    border: '1px solid rgba(168,85,247,0.25)',
                    fontWeight: 600,
                  }}
                >
                  Simulation Mode
                </span>
              ) : (
                <span
                  style={{
                    fontSize: '0.75rem',
                    padding: '2px 8px',
                    borderRadius: '6px',
                    background: 'rgba(16,185,129,0.15)',
                    color: '#34d399',
                    border: '1px solid rgba(16,185,129,0.25)',
                    fontWeight: 600,
                  }}
                >
                  Live Apply
                </span>
              )}

              <span style={{ fontSize: '0.75rem', color: '#9ca3af', fontFamily: 'monospace' }}>
                ID: {session.id.slice(0, 8)}…{session.id.slice(-4)}
              </span>
            </div>

            <h2 style={{ fontSize: '1.25rem', fontWeight: 800, margin: '0 0 0.25rem 0', color: '#ffffff', letterSpacing: '-0.01em' }}>
              {session.jobTitle} <span style={{ color: '#9ca3af', fontWeight: 400 }}>at</span> {session.company}
            </h2>

            <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', fontSize: '0.82rem', color: '#9ca3af', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <UserIcon size={14} color="#818cf8" />
                <span style={{ color: '#f3f4f6', fontWeight: 600 }}>{session.userName}</span>
                <span>({session.userEmail})</span>
                {session.userPlan && (
                  <span style={{ fontSize: '0.7rem', padding: '1px 6px', borderRadius: '4px', background: 'rgba(255,255,255,0.08)', color: '#d1d5db' }}>
                    {session.userPlan}
                  </span>
                )}
              </div>

              {session.jobUrl && (
                <a
                  href={session.jobUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', color: '#60a5fa', textDecoration: 'none' }}
                >
                  <ExternalLink size={13} /> Job Posting
                </a>
              )}

              {session.applicationUrl && session.applicationUrl !== session.jobUrl && (
                <a
                  href={session.applicationUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', color: '#a78bfa', textDecoration: 'none' }}
                >
                  <ExternalLink size={13} /> ATS Direct URL
                </a>
              )}
            </div>
          </div>

          <button
            onClick={onClose}
            style={{
              background: 'rgba(255, 255, 255, 0.06)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              color: '#9ca3af',
              borderRadius: '8px',
              width: '34px',
              height: '34px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
            title="Close modal (Esc)"
          >
            <X size={18} />
          </button>
        </div>

        {/* Telemetry Summary Strip */}
        <div
          style={{
            padding: '0.75rem 1.5rem',
            backgroundColor: '#0f172a',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
            gap: '0.75rem',
            fontSize: '0.8rem',
          }}
        >
          <div>
            <div style={{ color: '#9ca3af', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Execution Latency</div>
            <div style={{ fontWeight: 700, color: '#f3f4f6', fontSize: '0.95rem', marginTop: '2px' }}>
              {session.latencyFormatted}
            </div>
          </div>

          <div>
            <div style={{ color: '#9ca3af', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>AI Token Usage</div>
            <div style={{ fontWeight: 700, color: '#818cf8', fontSize: '0.95rem', marginTop: '2px' }}>
              {(session.tokenUsage?.totalTokens || 0).toLocaleString()}{' '}
              <span style={{ fontSize: '0.75rem', fontWeight: 400, color: '#9ca3af' }}>
                (${session.tokenUsage?.estimatedCostUsd ? session.tokenUsage.estimatedCostUsd.toFixed(4) : '0.0000'})
              </span>
            </div>
          </div>

          <div>
            <div style={{ color: '#9ca3af', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Progress Step</div>
            <div style={{ fontWeight: 600, color: '#f3f4f6', fontSize: '0.85rem', marginTop: '2px' }}>
              {session.currentStep || session.status} {session.stepsTotal ? `(${session.stepsCompleted}/${session.stepsTotal})` : ''}
            </div>
          </div>

          <div>
            <div style={{ color: '#9ca3af', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Triggered Date</div>
            <div style={{ fontWeight: 600, color: '#f3f4f6', fontSize: '0.82rem', marginTop: '2px' }}>
              {new Date(session.createdAt).toLocaleDateString()} {new Date(session.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </div>
          </div>

          <div>
            <div style={{ color: '#9ca3af', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Worker ID</div>
            <div style={{ fontWeight: 600, color: '#9ca3af', fontSize: '0.8rem', marginTop: '2px', fontFamily: 'monospace' }}>
              {session.workerId || 'Dedicated Pool'}
            </div>
          </div>
        </div>

        {/* Failure Callout Banner if Failed */}
        {session.statusCategory === 'failed' && (
          <div
            style={{
              padding: '0.85rem 1.5rem',
              backgroundColor: 'rgba(239, 68, 68, 0.12)',
              borderBottom: '1px solid rgba(239, 68, 68, 0.25)',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '0.75rem',
            }}
          >
            <AlertCircle size={18} color="#f87171" style={{ flexShrink: 0, marginTop: '2px' }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, color: '#f87171', fontSize: '0.85rem' }}>
                Failure Root Cause: {session.failureReason ? session.failureReason.replace(/_/g, ' ') : 'Automation Error'}
              </div>
              <div style={{ color: '#fca5a5', fontSize: '0.8rem', marginTop: '2px' }}>
                {renderLinkifiedText(session.failureDetails || session.summary || 'Encountered unexpected obstruction during execution.')}
              </div>
            </div>
          </div>
        )}

        {/* Modal Navigation Tabs */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0.5rem 1.5rem',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
            backgroundColor: '#131c2e',
            flexWrap: 'wrap',
            gap: '0.5rem',
          }}
        >
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              onClick={() => setActiveSubTab('logs')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
                padding: '0.45rem 0.9rem',
                borderRadius: '8px',
                border: 'none',
                background: activeSubTab === 'logs' ? 'rgba(99,102,241,0.2)' : 'transparent',
                color: activeSubTab === 'logs' ? '#818cf8' : '#9ca3af',
                fontSize: '0.85rem',
                fontWeight: activeSubTab === 'logs' ? 700 : 500,
                cursor: 'pointer',
              }}
            >
              <Terminal size={15} />
              Execution Logs ({logs.length})
            </button>

            <button
              onClick={() => setActiveSubTab('overview')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
                padding: '0.45rem 0.9rem',
                borderRadius: '8px',
                border: 'none',
                background: activeSubTab === 'overview' ? 'rgba(99,102,241,0.2)' : 'transparent',
                color: activeSubTab === 'overview' ? '#818cf8' : '#9ca3af',
                fontSize: '0.85rem',
                fontWeight: activeSubTab === 'overview' ? 700 : 500,
                cursor: 'pointer',
              }}
            >
              <FileText size={15} />
              Session Summary
            </button>

            {session.submittedAnswersSummary && (
              <button
                onClick={() => setActiveSubTab('answers')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  padding: '0.45rem 0.9rem',
                  borderRadius: '8px',
                  border: 'none',
                  background: activeSubTab === 'answers' ? 'rgba(99,102,241,0.2)' : 'transparent',
                  color: activeSubTab === 'answers' ? '#818cf8' : '#9ca3af',
                  fontSize: '0.85rem',
                  fontWeight: activeSubTab === 'answers' ? 700 : 500,
                  cursor: 'pointer',
                }}
              >
                <Bot size={15} />
                Q&A Answers ({session.questionsAnsweredCount || 0})
              </button>
            )}

            {interventions.length > 0 && (
              <button
                onClick={() => setActiveSubTab('interventions')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  padding: '0.45rem 0.9rem',
                  borderRadius: '8px',
                  border: 'none',
                  background: activeSubTab === 'interventions' ? 'rgba(245,158,11,0.2)' : 'transparent',
                  color: activeSubTab === 'interventions' ? '#fbbf24' : '#9ca3af',
                  fontSize: '0.85rem',
                  fontWeight: activeSubTab === 'interventions' ? 700 : 500,
                  cursor: 'pointer',
                }}
              >
                <AlertCircle size={15} />
                Interventions ({interventions.length})
              </button>
            )}
          </div>

          {activeSubTab === 'logs' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
              {/* Log Level Filter */}
              <div style={{ display: 'flex', background: 'rgba(0,0,0,0.25)', borderRadius: '6px', padding: '2px', border: '1px solid rgba(255,255,255,0.08)' }}>
                {['ALL', 'INFO', 'WARN', 'ERROR'].map((lvl) => (
                  <button
                    key={lvl}
                    onClick={() => setLogFilterLevel(lvl)}
                    style={{
                      padding: '2px 8px',
                      borderRadius: '4px',
                      border: 'none',
                      background: logFilterLevel === lvl ? 'rgba(99,102,241,0.3)' : 'transparent',
                      color: logFilterLevel === lvl ? '#818cf8' : '#9ca3af',
                      fontSize: '0.72rem',
                      fontWeight: logFilterLevel === lvl ? 700 : 500,
                      cursor: 'pointer',
                    }}
                  >
                    {lvl}
                  </button>
                ))}
              </div>

              {/* In-Log Search */}
              <div style={{ position: 'relative' }}>
                <Search size={13} style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', color: '#6b7280' }} />
                <input
                  type="text"
                  placeholder="Filter logs..."
                  value={logSearchQuery}
                  onChange={(e) => setLogSearchQuery(e.target.value)}
                  style={{
                    padding: '4px 8px 4px 26px',
                    fontSize: '0.78rem',
                    background: 'rgba(0,0,0,0.3)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '6px',
                    color: '#f3f4f6',
                    outline: 'none',
                    width: '140px',
                  }}
                />
              </div>

              {/* Copy Logs */}
              <button
                onClick={handleCopyLogs}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.3rem',
                  padding: '4px 10px',
                  borderRadius: '6px',
                  border: '1px solid rgba(255,255,255,0.12)',
                  background: 'rgba(255,255,255,0.05)',
                  color: '#d1d5db',
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
                title="Copy all logs to clipboard"
              >
                {copiedLogs ? <Check size={13} color="#34d399" /> : <Copy size={13} />}
                {copiedLogs ? 'Copied' : 'Copy'}
              </button>

              {/* Refresh Logs */}
              <button
                onClick={fetchSessionLogs}
                disabled={loadingLogs}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.3rem',
                  padding: '4px 8px',
                  borderRadius: '6px',
                  border: '1px solid rgba(255,255,255,0.12)',
                  background: 'rgba(255,255,255,0.05)',
                  color: '#d1d5db',
                  fontSize: '0.78rem',
                  cursor: loadingLogs ? 'not-allowed' : 'pointer',
                }}
                title="Refresh log stream"
              >
                <RefreshCw size={13} className={loadingLogs ? 'spin' : ''} />
              </button>
            </div>
          )}
        </div>

        {/* Content Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '1.25rem 1.5rem', minHeight: '320px', maxHeight: '58vh' }}>
          {/* TAB 1: EXECUTION LOGS */}
          {activeSubTab === 'logs' && (
            <div>
              {loadingLogs && logs.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '3rem', color: '#9ca3af' }}>
                  <RefreshCw size={24} className="spin" style={{ marginBottom: '0.5rem' }} />
                  <div>Fetching execution log trace...</div>
                </div>
              ) : filteredLogs.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '3rem', color: '#9ca3af' }}>
                  <Terminal size={24} style={{ marginBottom: '0.5rem', opacity: 0.5 }} />
                  <div>{logs.length === 0 ? 'No execution logs recorded for this session yet.' : 'No logs match current filter.'}</div>
                </div>
              ) : (
                <div
                  ref={scrollRef}
                  style={{
                    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                    fontSize: '0.8rem',
                    lineHeight: '1.5',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.35rem',
                  }}
                >
                  {filteredLogs.map((log) => {
                    const lvlStyle = getLevelStyle(log.level);
                    const isExpanded = expandedMetadataIds.has(log.id);
                    const hasMetadata = log.metadata && Object.keys(log.metadata).length > 0;

                    return (
                      <div
                        key={log.id}
                        style={{
                          padding: '0.4rem 0.6rem',
                          borderRadius: '6px',
                          background: log.level === 'error' ? 'rgba(239, 68, 68, 0.08)' : 'rgba(255, 255, 255, 0.02)',
                          border: log.level === 'error' ? '1px solid rgba(239, 68, 68, 0.25)' : '1px solid rgba(255, 255, 255, 0.04)',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.6rem' }}>
                          <span style={{ color: '#6b7280', fontSize: '0.72rem', flexShrink: 0, marginTop: '2px' }}>
                            {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}
                          </span>

                          <span
                            style={{
                              padding: '1px 6px',
                              borderRadius: '4px',
                              fontSize: '0.68rem',
                              fontWeight: 700,
                              background: lvlStyle.bg,
                              color: lvlStyle.text,
                              flexShrink: 0,
                              border: `1px solid ${lvlStyle.border}`,
                            }}
                          >
                            {log.level.toUpperCase()}
                          </span>

                          <span
                            style={{
                              color: '#a78bfa',
                              fontSize: '0.75rem',
                              fontWeight: 600,
                              flexShrink: 0,
                              padding: '0 4px',
                              background: 'rgba(167, 139, 250, 0.1)',
                              borderRadius: '3px',
                            }}
                          >
                            {log.step}
                          </span>

                          <div style={{ flex: 1, color: '#e5e7eb', wordBreak: 'break-word' }}>
                            {renderLinkifiedText(log.message)}

                            {log.durationMs != null && (
                              <span style={{ marginLeft: '0.5rem', color: '#9ca3af', fontSize: '0.7rem' }}>
                                (+{log.durationMs}ms)
                              </span>
                            )}
                          </div>

                          {hasMetadata && (
                            <button
                              onClick={() => toggleMetadata(log.id)}
                              style={{
                                background: 'transparent',
                                border: 'none',
                                color: '#9ca3af',
                                cursor: 'pointer',
                                padding: '2px 4px',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '2px',
                                fontSize: '0.7rem',
                              }}
                              title="Toggle structured metadata"
                            >
                              {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                              Meta
                            </button>
                          )}
                        </div>

                        {/* Collapsible Metadata JSON */}
                        {hasMetadata && isExpanded && (
                          <div
                            style={{
                              marginTop: '0.4rem',
                              padding: '0.5rem 0.75rem',
                              borderRadius: '4px',
                              background: 'rgba(0, 0, 0, 0.4)',
                              border: '1px solid rgba(255, 255, 255, 0.08)',
                              overflowX: 'auto',
                              fontSize: '0.72rem',
                              color: '#93c5fd',
                            }}
                          >
                            <pre style={{ margin: 0 }}>{JSON.stringify(log.metadata, null, 2)}</pre>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: SESSION SUMMARY & DETAILS */}
          {activeSubTab === 'overview' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px', padding: '1.25rem' }}>
                <h4 style={{ margin: '0 0 0.75rem 0', fontSize: '0.95rem', fontWeight: 700, color: '#818cf8', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Zap size={16} /> Auto Apply Execution Overview
                </h4>
                <p style={{ margin: 0, fontSize: '0.9rem', color: '#d1d5db', lineHeight: 1.6 }}>
                  {session.summary}
                </p>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
                {/* Candidate & Job info */}
                <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px', padding: '1.1rem' }}>
                  <h5 style={{ margin: '0 0 0.75rem 0', fontSize: '0.85rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase' }}>
                    Candidate & Job Details
                  </h5>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem', fontSize: '0.82rem' }}>
                    <div><span style={{ color: '#9ca3af' }}>User:</span> <strong>{session.userName}</strong> ({session.userEmail})</div>
                    <div><span style={{ color: '#9ca3af' }}>Plan Tier:</span> <strong>{session.userPlan || 'FREE'}</strong></div>
                    <div><span style={{ color: '#9ca3af' }}>Job Title:</span> <strong>{session.jobTitle}</strong></div>
                    <div><span style={{ color: '#9ca3af' }}>Company:</span> <strong>{session.company}</strong></div>
                    <div><span style={{ color: '#9ca3af' }}>Location:</span> <strong>{session.location || 'Unspecified'}</strong></div>
                    <div>
                      <span style={{ color: '#9ca3af' }}>Job URL:</span>{' '}
                      {session.jobUrl ? (
                        <a href={session.jobUrl} target="_blank" rel="noopener noreferrer" style={{ color: '#60a5fa', textDecoration: 'underline' }}>
                          Open Job Link <ExternalLink size={11} style={{ display: 'inline' }} />
                        </a>
                      ) : 'N/A'}
                    </div>
                  </div>
                </div>

                {/* Automation & ATS Details */}
                <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px', padding: '1.1rem' }}>
                  <h5 style={{ margin: '0 0 0.75rem 0', fontSize: '0.85rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase' }}>
                    Automation & ATS Diagnostics
                  </h5>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem', fontSize: '0.82rem' }}>
                    <div><span style={{ color: '#9ca3af' }}>ATS Platform:</span> <strong>{session.atsPlatform}</strong></div>
                    <div><span style={{ color: '#9ca3af' }}>ATS Confidence:</span> <strong>{session.atsConfidence ? `${session.atsConfidence}%` : 'N/A'}</strong></div>
                    <div><span style={{ color: '#9ca3af' }}>Automation Confidence:</span> <strong>{session.automationConfidence ? `${session.automationConfidence}%` : 'N/A'}</strong></div>
                    <div><span style={{ color: '#9ca3af' }}>Retry Attempts:</span> <strong>{session.retryCount || 0} / {session.maxRetries || 3}</strong></div>
                    <div><span style={{ color: '#9ca3af' }}>Queue Latency:</span> <strong>{session.queueLatencyMs ? `${(session.queueLatencyMs / 1000).toFixed(2)}s` : 'Instant'}</strong></div>
                    <div><span style={{ color: '#9ca3af' }}>Confirmation Number:</span> <strong>{session.confirmationNumber || 'N/A'}</strong></div>
                  </div>
                </div>
              </div>

              {session.confirmationScreenshotUrl && (
                <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px', padding: '1.1rem' }}>
                  <h5 style={{ margin: '0 0 0.75rem 0', fontSize: '0.85rem', fontWeight: 700, color: '#34d399', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <CheckCircle2 size={16} /> Submission Proof Screenshot
                  </h5>
                  <a href={session.confirmationScreenshotUrl} target="_blank" rel="noopener noreferrer" style={{ color: '#60a5fa', fontSize: '0.85rem', textDecoration: 'underline' }}>
                    View full screenshot in new tab <ExternalLink size={12} style={{ display: 'inline' }} />
                  </a>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: Q&A ANSWERS */}
          {activeSubTab === 'answers' && (
            <div>
              {session.submittedAnswersSummary ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {Array.isArray(session.submittedAnswersSummary) ? (
                    session.submittedAnswersSummary.map((item: any, idx: number) => (
                      <div
                        key={idx}
                        style={{
                          padding: '0.85rem 1rem',
                          borderRadius: '8px',
                          background: 'rgba(255,255,255,0.03)',
                          border: '1px solid rgba(255,255,255,0.08)',
                        }}
                      >
                        <div style={{ color: '#9ca3af', fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', marginBottom: '4px' }}>
                          Question #{idx + 1}: {item.label || item.question || item.id || 'Custom Field'}
                        </div>
                        <div style={{ color: '#f3f4f6', fontSize: '0.85rem', fontWeight: 600, lineHeight: 1.5 }}>
                          {item.answer ? renderLinkifiedText(String(item.answer)) : <span style={{ color: '#9ca3af', fontStyle: 'italic' }}>No answer required / Blank</span>}
                        </div>
                        {item.confidence != null && (
                          <div style={{ marginTop: '4px', fontSize: '0.72rem', color: item.confidence >= 80 ? '#34d399' : '#fbbf24' }}>
                            Confidence: {item.confidence}%
                          </div>
                        )}
                      </div>
                    ))
                  ) : typeof session.submittedAnswersSummary === 'object' ? (
                    Object.entries(session.submittedAnswersSummary).map(([key, val], idx) => (
                      <div
                        key={key}
                        style={{
                          padding: '0.85rem 1rem',
                          borderRadius: '8px',
                          background: 'rgba(255,255,255,0.03)',
                          border: '1px solid rgba(255,255,255,0.08)',
                        }}
                      >
                        <div style={{ color: '#9ca3af', fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', marginBottom: '4px' }}>
                          Field: {key}
                        </div>
                        <div style={{ color: '#f3f4f6', fontSize: '0.85rem', fontWeight: 600 }}>
                          {renderLinkifiedText(typeof val === 'string' ? val : JSON.stringify(val))}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div style={{ color: '#9ca3af' }}>No structured answers available.</div>
                  )}
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '3rem', color: '#9ca3af' }}>
                  No custom question answers recorded for this session.
                </div>
              )}
            </div>
          )}

          {/* TAB 4: INTERVENTIONS */}
          {activeSubTab === 'interventions' && (
            <div>
              {interventions.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '3rem', color: '#9ca3af' }}>
                  No human intervention requests were required for this session.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {interventions.map((inv) => (
                    <div
                      key={inv.id}
                      style={{
                        padding: '1rem',
                        borderRadius: '8px',
                        background: 'rgba(245,158,11,0.08)',
                        border: '1px solid rgba(245,158,11,0.25)',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                        <span style={{ fontWeight: 700, color: '#fbbf24', fontSize: '0.85rem' }}>
                          Reason: {inv.reason.replace(/_/g, ' ')}
                        </span>
                        <span
                          style={{
                            fontSize: '0.72rem',
                            padding: '2px 8px',
                            borderRadius: '4px',
                            background: inv.resolution === 'completed' ? 'rgba(52,211,153,0.2)' : 'rgba(239,68,68,0.2)',
                            color: inv.resolution === 'completed' ? '#34d399' : '#f87171',
                            fontWeight: 600,
                          }}
                        >
                          {inv.resolution || 'Pending'}
                        </span>
                      </div>
                      <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.82rem', color: '#f3f4f6' }}>
                        {inv.description}
                      </p>
                      {inv.pageUrl && (
                        <div style={{ fontSize: '0.75rem', color: '#9ca3af' }}>
                          Page URL: {renderLinkifiedText(inv.pageUrl)}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div
          style={{
            padding: '0.85rem 1.5rem',
            borderTop: '1px solid rgba(255, 255, 255, 0.08)',
            backgroundColor: '#172033',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '0.8rem',
            color: '#9ca3af',
          }}
        >
          <div>
            Viewing trace for session <code style={{ color: '#818cf8' }}>{session.id}</code>
          </div>

          <button
            onClick={onClose}
            style={{
              padding: '0.45rem 1.2rem',
              borderRadius: '8px',
              border: '1px solid rgba(255,255,255,0.15)',
              background: 'rgba(255,255,255,0.08)',
              color: '#ffffff',
              fontSize: '0.85rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
