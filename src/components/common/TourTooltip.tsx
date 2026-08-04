'use client';

import React from 'react';
import { createPortal } from 'react-dom';
import type { TooltipRenderProps } from 'react-joyride';

/**
 * Custom Joyride tooltip rendered as a fixed, viewport-centered overlay.
 * This prevents the tooltip/buttons from being pushed off-screen when the
 * highlighted target element is near the bottom (or top) of the page.
 */
export default function TourTooltip({
  continuous,
  index,
  isLastStep,
  size,
  step,
  backProps,
  closeProps,
  primaryProps,
  skipProps,
  tooltipProps,
}: TooltipRenderProps) {
  const content = (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10001,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        pointerEvents: 'none',
      }}
    >
      <div
        {...tooltipProps}
        style={{
          pointerEvents: 'all',
          background: 'var(--bg-surface, #1e1e2e)',
          border: '1px solid var(--border-glass, rgba(255,255,255,0.1))',
          borderRadius: '16px',
          boxShadow: '0 24px 64px rgba(0,0,0,0.45)',
          padding: '1.75rem',
          maxWidth: '420px',
          width: 'calc(100vw - 2rem)',
          display: 'flex',
          flexDirection: 'column',
          gap: '1rem',
        }}
      >
        {/* Header row: title + step counter + close */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.75rem' }}>
          <div style={{ flex: 1 }}>
            {step.title && (
              <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary, #f1f5f9)' }}>
                {step.title}
              </h3>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary, #94a3b8)', fontWeight: 500 }}>
              {index + 1} / {size}
            </span>
            <button
              {...closeProps}
              style={{
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid var(--border-glass, rgba(255,255,255,0.1))',
                borderRadius: '50%',
                width: '28px',
                height: '28px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                color: 'var(--text-secondary, #94a3b8)',
                fontSize: '1rem',
                lineHeight: 1,
                padding: 0,
                transition: 'background 0.15s',
              }}
              aria-label="Close tour"
            >
              ×
            </button>
          </div>
        </div>

        {/* Body */}
        <div style={{ fontSize: '0.92rem', color: 'var(--text-secondary, #94a3b8)', lineHeight: 1.6 }}>
          {step.content}
        </div>

        {/* Progress dots */}
        {size > 1 && (
          <div style={{ display: 'flex', gap: '5px', justifyContent: 'center' }}>
            {Array.from({ length: size }).map((_, i) => (
              <div
                key={i}
                style={{
                  width: i === index ? '18px' : '6px',
                  height: '6px',
                  borderRadius: '3px',
                  background: i === index
                    ? 'var(--accent-primary, #3b82f6)'
                    : 'rgba(255,255,255,0.15)',
                  transition: 'width 0.25s ease, background 0.25s ease',
                }}
              />
            ))}
          </div>
        )}

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: '0.625rem', justifyContent: 'flex-end', marginTop: '0.25rem' }}>
          {/* Skip (only show when not last step) */}
          {!isLastStep && (
            <button
              {...skipProps}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--text-secondary, #94a3b8)',
                fontSize: '0.82rem',
                cursor: 'pointer',
                padding: '0.4rem 0.5rem',
                borderRadius: '6px',
                marginRight: 'auto',
              }}
            >
              Skip tour
            </button>
          )}

          {/* Back */}
          {index > 0 && (
            <button
              {...backProps}
              style={{
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid var(--border-glass, rgba(255,255,255,0.1))',
                borderRadius: '8px',
                padding: '0.5rem 1rem',
                fontSize: '0.88rem',
                fontWeight: 600,
                color: 'var(--text-primary, #f1f5f9)',
                cursor: 'pointer',
              }}
            >
              Back
            </button>
          )}

          {/* Next / Finish */}
          {continuous && (
            <button
              {...primaryProps}
              style={{
                background: 'var(--accent-primary, #3b82f6)',
                border: 'none',
                borderRadius: '8px',
                padding: '0.5rem 1.25rem',
                fontSize: '0.88rem',
                fontWeight: 700,
                color: '#fff',
                cursor: 'pointer',
                boxShadow: '0 4px 12px rgba(59,130,246,0.35)',
              }}
            >
              {isLastStep ? 'Finish' : 'Next'}
            </button>
          )}
        </div>
      </div>
    </div>
  );

  if (typeof document === 'undefined') return null;
  return createPortal(content, document.body);
}
