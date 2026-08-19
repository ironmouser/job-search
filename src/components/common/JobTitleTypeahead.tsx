"use client";

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { CANONICAL_TITLE_LIST } from '@/lib/roleTaxonomy';
import { Sparkles, Loader2, ChevronRight } from 'lucide-react';

interface JobTitleTypeaheadProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  placeholder?: string;
  required?: boolean;
  autoFocus?: boolean;
  inputStyle?: React.CSSProperties;
  className?: string;
  inputRef?: React.RefObject<HTMLInputElement | null>;
  hasError?: boolean;
}

export default function JobTitleTypeahead({
  id,
  value,
  onChange,
  onKeyDown,
  placeholder = 'e.g. Account Manager, Full Stack Engineer',
  required,
  autoFocus,
  inputStyle,
  className,
  inputRef: externalRef,
  hasError,
}: JobTitleTypeaheadProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [aiSuggestions, setAiSuggestions] = useState<string[]>([]);
  const [isLoadingAi, setIsLoadingAi] = useState(false);

  const internalRef = useRef<HTMLInputElement>(null);
  const inputElRef = externalRef || internalRef;
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // 1. Instant Static Canonical Matches (client-side)
  const staticMatches = useMemo(() => {
    const query = value.trim().toLowerCase();
    if (!query || query.length < 2) return [];

    return CANONICAL_TITLE_LIST.filter(title => {
      const lower = title.toLowerCase();
      return lower.includes(query) && lower !== query;
    }).slice(0, 5);
  }, [value]);

  // 2. Fetch AI Suggestions on Debounce
  useEffect(() => {
    const query = value.trim();
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    if (!query || query.length < 2) {
      setAiSuggestions([]);
      setIsLoadingAi(false);
      return;
    }

    setIsLoadingAi(true);
    debounceTimerRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/title-suggestions?q=${encodeURIComponent(query)}`);
        if (res.ok) {
          const data = await res.json();
          const list: string[] = Array.isArray(data?.suggestions) ? data.suggestions : [];
          setAiSuggestions(list);
        }
      } catch (err) {
        console.warn('[JobTitleTypeahead] Suggestion fetch notice:', err);
      } finally {
        setIsLoadingAi(false);
      }
    }, 380);

    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, [value]);

  // Combined suggestions: deduplicate static + AI suggestions
  const combinedSuggestions = useMemo(() => {
    const query = value.trim().toLowerCase();
    if (!query || query.length < 2) return [];

    const seen = new Set<string>();
    const results: Array<{ title: string; isAi: boolean }> = [];

    // Add static matches
    for (const title of staticMatches) {
      const lower = title.toLowerCase();
      if (!seen.has(lower) && lower !== query) {
        seen.add(lower);
        results.push({ title, isAi: false });
      }
    }

    // Add AI suggestions
    for (const title of aiSuggestions) {
      const lower = title.toLowerCase();
      if (!seen.has(lower) && lower !== query) {
        seen.add(lower);
        results.push({ title, isAi: true });
      }
    }

    return results.slice(0, 7);
  }, [staticMatches, aiSuggestions, value]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  const handleSelect = (title: string) => {
    onChange(title);
    setIsOpen(false);
    setHighlightedIndex(-1);
    inputElRef.current?.focus();
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (isOpen && combinedSuggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlightedIndex(prev => (prev < combinedSuggestions.length - 1 ? prev + 1 : 0));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlightedIndex(prev => (prev > 0 ? prev - 1 : combinedSuggestions.length - 1));
        return;
      }
      if (e.key === 'Enter' && highlightedIndex >= 0 && highlightedIndex < combinedSuggestions.length) {
        e.preventDefault();
        handleSelect(combinedSuggestions[highlightedIndex].title);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setIsOpen(false);
        return;
      }
    }

    if (onKeyDown) {
      onKeyDown(e);
    }
  };

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%' }}>
      <input
        ref={inputElRef}
        id={id}
        type="text"
        required={required}
        autoFocus={autoFocus}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setIsOpen(true);
          setHighlightedIndex(-1);
        }}
        onFocus={() => {
          if (value.trim().length >= 2) setIsOpen(true);
        }}
        onKeyDown={handleInputKeyDown}
        placeholder={placeholder}
        className={className}
        style={inputStyle}
        autoComplete="off"
        role="combobox"
        aria-expanded={isOpen && combinedSuggestions.length > 0}
        aria-autocomplete="list"
      />

      {/* Floating Suggestions Dropdown */}
      {isOpen && combinedSuggestions.length > 0 && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            left: 0,
            right: 0,
            zIndex: 9999,
            background: 'var(--card-bg, #0d1117)',
            border: '1px solid var(--border-glass, rgba(255, 255, 255, 0.15))',
            borderRadius: '10px',
            boxShadow: '0 12px 32px rgba(0, 0, 0, 0.55), 0 0 0 1px rgba(255, 255, 255, 0.05)',
            overflow: 'hidden',
            padding: '0.35rem',
            animation: 'fadeIn 0.15s ease-out',
          }}
        >
          <div
            style={{
              padding: '0.35rem 0.65rem 0.25rem',
              fontSize: '0.72rem',
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              color: 'var(--text-secondary, #94a3b8)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <span>Suggested Roles</span>
            {isLoadingAi && (
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.7rem' }}>
                <Loader2 size={11} className="animate-spin" />
                <span>AI expanding</span>
              </span>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            {combinedSuggestions.map((item, idx) => {
              const isSelected = idx === highlightedIndex;
              return (
                <button
                  key={item.title}
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    handleSelect(item.title);
                  }}
                  onClick={() => handleSelect(item.title)}
                  onMouseEnter={() => setHighlightedIndex(idx)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    width: '100%',
                    padding: '0.55rem 0.75rem',
                    border: 'none',
                    borderRadius: '6px',
                    background: isSelected ? 'rgba(99, 102, 241, 0.18)' : 'transparent',
                    color: isSelected ? 'var(--accent-primary, #6366f1)' : 'var(--text-primary, #ffffff)',
                    fontSize: '0.88rem',
                    fontWeight: 500,
                    textAlign: 'left',
                    cursor: 'pointer',
                    transition: 'background 0.12s ease',
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                    {item.isAi ? (
                      <Sparkles size={13} style={{ color: 'var(--accent-primary, #6366f1)', opacity: 0.85, flexShrink: 0 }} />
                    ) : (
                      <ChevronRight size={13} style={{ opacity: 0.5, flexShrink: 0 }} />
                    )}
                    <span>{item.title}</span>
                  </span>
                  {item.isAi && (
                    <span
                      style={{
                        fontSize: '0.68rem',
                        padding: '1px 6px',
                        borderRadius: '4px',
                        background: 'rgba(99, 102, 241, 0.12)',
                        color: 'var(--accent-primary, #6366f1)',
                        fontWeight: 600,
                      }}
                    >
                      AI
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
