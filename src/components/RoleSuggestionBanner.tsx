"use client";

import React, { useState } from 'react';
import { Sparkles, X, ArrowUpRight } from 'lucide-react';

interface RoleSuggestionBannerProps {
  suggestions: string[];
  currentKeyword: string;
  onSelectRole: (role: string) => void;
  onDismiss?: () => void;
}

export default function RoleSuggestionBanner({
  suggestions,
  currentKeyword,
  onSelectRole,
  onDismiss,
}: RoleSuggestionBannerProps) {
  const [dismissed, setDismissed] = useState(false);

  // Filter out any suggestion that matches current keyword
  const filteredSuggestions = (suggestions || []).filter(
    s => s.toLowerCase().trim() !== currentKeyword.toLowerCase().trim()
  );

  if (dismissed || filteredSuggestions.length === 0) {
    return null;
  }

  const handleDismiss = () => {
    setDismissed(true);
    if (onDismiss) onDismiss();
  };

  return (
    <div
      className="glass-card animate-fade-in"
      style={{
        width: '100%',
        boxSizing: 'border-box',
        padding: '0.85rem 1.15rem',
        marginBottom: '1rem',
        background: 'rgba(99, 102, 241, 0.06)',
        border: '1px solid rgba(99, 102, 241, 0.22)',
        borderRadius: '12px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '0.75rem',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap', flex: 1 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.35rem',
            color: 'var(--accent-primary, #6366f1)',
            fontWeight: 600,
            fontSize: '0.85rem',
            flexShrink: 0,
          }}
        >
          <Sparkles size={15} />
          <span>Related Roles Discovered:</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap' }}>
          {filteredSuggestions.slice(0, 4).map((role) => (
            <button
              key={role}
              type="button"
              onClick={() => onSelectRole(role)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.25rem',
                padding: '0.25rem 0.65rem',
                borderRadius: '6px',
                border: '1px solid rgba(99, 102, 241, 0.3)',
                background: 'rgba(99, 102, 241, 0.12)',
                color: 'var(--text-primary, #ffffff)',
                fontSize: '0.8rem',
                fontWeight: 500,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(99, 102, 241, 0.25)';
                e.currentTarget.style.borderColor = 'var(--accent-primary, #6366f1)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(99, 102, 241, 0.12)';
                e.currentTarget.style.borderColor = 'rgba(99, 102, 241, 0.3)';
              }}
              title={`Switch search to "${role}"`}
            >
              <span>{role}</span>
              <ArrowUpRight size={12} style={{ opacity: 0.7 }} />
            </button>
          ))}
        </div>
      </div>

      <button
        type="button"
        onClick={handleDismiss}
        style={{
          background: 'none',
          border: 'none',
          color: 'var(--text-secondary, #94a3b8)',
          cursor: 'pointer',
          padding: '4px',
          borderRadius: '4px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          opacity: 0.8,
        }}
        title="Dismiss suggestions"
        aria-label="Dismiss suggestions"
      >
        <X size={15} />
      </button>
    </div>
  );
}
