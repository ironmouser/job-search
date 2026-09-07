'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Sparkles, ChevronDown, ChevronUp, Check, Loader2, Save, Info, AlertCircle } from 'lucide-react';

interface TailoringContextCardProps {
  jobId: string;
  initialContext?: string;
  hasAssets?: boolean;
  onContextChange?: (context: string) => void;
  disabled?: boolean;
}

const MAX_CHAR_LIMIT = 1500;

export default function TailoringContextCard({
  jobId,
  initialContext = '',
  hasAssets = false,
  onContextChange,
  disabled = false,
}: TailoringContextCardProps) {
  const [context, setContext] = useState(initialContext);
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved' | 'error'>('idle');
  // If assets already exist and context is empty, collapse by default; otherwise keep open
  const [isCollapsed, setIsCollapsed] = useState(() => hasAssets && !initialContext);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastSavedRef = useRef<string>(initialContext);

  const [prevInitialContext, setPrevInitialContext] = useState(initialContext);
  if (prevInitialContext !== initialContext) {
    setPrevInitialContext(initialContext);
    setContext(initialContext);
  }

  useEffect(() => {
    lastSavedRef.current = initialContext;
  }, [initialContext]);

  const saveContextToBackend = useCallback(async (textToSave: string) => {
    if (textToSave === lastSavedRef.current) {
      return;
    }

    setIsSaving(true);
    setSaveStatus('idle');

    try {
      const res = await fetch(`/api/jobs/${jobId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ additionalContext: textToSave })
      });

      if (res.ok) {
        lastSavedRef.current = textToSave;
        setHasUnsavedChanges(false);
        setSaveStatus('saved');
        setTimeout(() => {
          setSaveStatus((prev) => (prev === 'saved' ? 'idle' : prev));
        }, 2500);
      } else {
        setSaveStatus('error');
      }
    } catch (err) {
      console.error('Failed to auto-save additional context:', err);
      setSaveStatus('error');
    } finally {
      setIsSaving(false);
    }
  }, [jobId]);

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value.slice(0, MAX_CHAR_LIMIT);
    setContext(val);
    setHasUnsavedChanges(val !== lastSavedRef.current);
    onContextChange?.(val);

    // Debounce auto-save by 800ms
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = setTimeout(() => {
      saveContextToBackend(val);
    }, 800);
  };

  const handleManualSave = () => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    saveContextToBackend(context);
  };

  // Clean up debounce timer on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  const isNearLimit = context.length > MAX_CHAR_LIMIT - 150;

  return (
    <div
      className="glass-card"
      style={{
        marginBottom: '1.5rem',
        padding: '1.25rem 1.5rem',
        borderRadius: '12px',
        border: '1px solid var(--border-subtle, rgba(255, 255, 255, 0.1))',
        background: 'var(--card-bg, rgba(255, 255, 255, 0.03))',
        position: 'relative',
        transition: 'all 0.2s ease',
      }}
    >
      {/* Card Header with Expand/Collapse toggle */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          cursor: hasAssets ? 'pointer' : 'default',
          userSelect: 'none',
        }}
        onClick={() => {
          if (hasAssets) setIsCollapsed(!isCollapsed);
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
          <div
            style={{
              width: '28px',
              height: '28px',
              borderRadius: '8px',
              background: 'rgba(45, 181, 165, 0.15)',
              color: 'var(--accent-secondary, #2db5a5)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Sparkles size={16} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontWeight: 600, fontSize: '0.95rem', color: 'var(--text-primary)' }}>
                Additional Experience & Context
              </span>
              <span
                style={{
                  fontSize: '0.7rem',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  padding: '0.15rem 0.45rem',
                  borderRadius: '999px',
                  background: context.trim() ? 'rgba(45, 181, 165, 0.2)' : 'rgba(255, 255, 255, 0.08)',
                  color: context.trim() ? 'var(--accent-secondary, #2db5a5)' : 'var(--text-secondary)',
                }}
              >
                {context.trim() ? 'Active Notes' : 'Optional'}
              </span>
            </div>
            {!isCollapsed && (
              <p
                style={{
                  margin: '0.2rem 0 0 0',
                  fontSize: '0.8rem',
                  color: 'var(--text-secondary)',
                  lineHeight: 1.4,
                }}
              >
                Add specific achievements, projects, or background relevant to this job. The AI will selectively integrate them into your resume, cover letter, networking outreach, and Q&A only where they align with the role.
              </p>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          {isSaving ? (
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
              <Loader2 size={13} className="animate-spin" /> Saving...
            </span>
          ) : saveStatus === 'saved' ? (
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.75rem', color: 'var(--success, #22c55e)' }}>
              <Check size={14} /> Saved
            </span>
          ) : saveStatus === 'error' ? (
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.75rem', color: 'var(--danger, #ef4444)' }}>
              <AlertCircle size={14} /> Error saving
            </span>
          ) : null}

          {hasAssets && (
            <button
              type="button"
              className="btn-secondary"
              style={{
                padding: '0.3rem 0.5rem',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.25rem',
                fontSize: '0.75rem',
                background: 'transparent',
                border: 'none',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
              }}
              aria-label={isCollapsed ? 'Expand additional context' : 'Collapse additional context'}
            >
              {isCollapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
            </button>
          )}
        </div>
      </div>

      {/* Collapsible Body */}
      {!isCollapsed && (
        <div style={{ marginTop: '0.9rem', display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
          <div style={{ position: 'relative' }}>
            <textarea
              value={context}
              onChange={handleTextChange}
              disabled={disabled}
              placeholder="e.g. At Company X, I led the multi-language localization rollout for Product Y across 5 European markets, reducing translation turnaround times by 40%."
              rows={4}
              style={{
                width: '100%',
                padding: '0.75rem 0.85rem',
                borderRadius: '8px',
                border: '1px solid var(--border-color, rgba(255, 255, 255, 0.12))',
                background: 'var(--input-bg, rgba(0, 0, 0, 0.2))',
                color: 'var(--text-primary)',
                fontSize: '0.85rem',
                lineHeight: 1.5,
                resize: 'vertical',
                minHeight: '80px',
                fontFamily: 'inherit',
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
              <Info size={13} style={{ flexShrink: 0 }} />
              <span>
                Irrelevant skills (e.g. brake repairs for an insurance desk role) will not be forced into your materials.
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginLeft: 'auto' }}>
              <span
                style={{
                  fontSize: '0.75rem',
                  color: isNearLimit ? 'var(--danger, #ef4444)' : 'var(--text-secondary)',
                  fontWeight: isNearLimit ? 600 : 400,
                }}
              >
                {context.length} / {MAX_CHAR_LIMIT}
              </span>

              {hasUnsavedChanges && !isSaving && (
                <button
                  type="button"
                  onClick={handleManualSave}
                  className="btn-secondary"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.35rem',
                    fontSize: '0.75rem',
                    padding: '0.25rem 0.6rem',
                    borderRadius: '6px',
                  }}
                >
                  <Save size={12} /> Save Now
                </button>
              )}
            </div>
          </div>

          {hasAssets && context.trim() && (
            <div
              style={{
                marginTop: '0.35rem',
                padding: '0.55rem 0.75rem',
                borderRadius: '6px',
                background: 'rgba(45, 181, 165, 0.08)',
                border: '1px solid rgba(45, 181, 165, 0.2)',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                fontSize: '0.75rem',
                color: 'var(--text-secondary)',
              }}
            >
              <Sparkles size={13} style={{ color: 'var(--accent-secondary, #2db5a5)', flexShrink: 0 }} />
              <span>
                <strong>Context ready:</strong> Click <em>Regenerate</em> on any asset below or use <em>Application Q&A</em> to update your materials with these details.
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
