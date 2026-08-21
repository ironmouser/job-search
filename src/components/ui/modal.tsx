'use client';

import * as React from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  maxWidth?: string;
}

export function Modal({
  isOpen,
  onClose,
  title,
  description,
  children,
  maxWidth = "550px",
}: ModalProps) {
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !mounted) return null;

  return createPortal(
    <div
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
        padding: '1rem',
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '100%',
          maxWidth: maxWidth,
          maxHeight: 'calc(100dvh - 2rem)',
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--card)',
          color: 'var(--card-foreground)',
          borderRadius: 'var(--radius, 12px)',
          border: '1px solid var(--border)',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.3), 0 8px 10px -6px rgba(0, 0, 0, 0.2)',
          overflow: 'hidden',
          animation: 'fadeIn 0.2s ease-out forwards',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {(title || description) && (
          <div
            style={{
              padding: '1.25rem 1.5rem',
              borderBottom: '1px solid var(--border)',
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              background: 'var(--card-header-bg)',
              flexShrink: 0,
            }}
          >
            <div>
              {title && (
                <h3
                  style={{
                    margin: 0,
                    fontSize: '1.125rem',
                    fontWeight: 600,
                    color: 'var(--foreground)',
                    fontFamily: 'var(--font-display)',
                  }}
                >
                  {title}
                </h3>
              )}
              {description && (
                <p
                  style={{
                    margin: '0.25rem 0 0 0',
                    fontSize: '0.875rem',
                    color: 'var(--muted-foreground)',
                  }}
                >
                  {description}
                </p>
              )}
            </div>
            <button
              onClick={onClose}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--muted-foreground)',
                cursor: 'pointer',
                padding: '0.25rem',
                borderRadius: '4px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
              title="Close modal"
            >
              <X size={18} />
            </button>
          </div>
        )}
        <div
          style={{
            padding: '1.5rem',
            overflowY: 'auto',
            flex: 1,
            WebkitOverflowScrolling: 'touch',
          }}
        >
          {children}
        </div>
      </div>
    </div>,
    document.body
  );
}
