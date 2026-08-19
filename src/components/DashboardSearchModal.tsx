"use client";

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Search, MapPin, X } from 'lucide-react';
import JobTitleTypeahead from '@/components/common/JobTitleTypeahead';

interface DashboardSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultKeyword: string;
  defaultLocation: string;
  onSearch: (keyword: string, location: string) => void;
}

export default function DashboardSearchModal({
  isOpen,
  onClose,
  defaultKeyword,
  defaultLocation,
  onSearch,
}: DashboardSearchModalProps) {
  const [mounted, setMounted] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [location, setLocation] = useState('');

  useEffect(() => {
    setMounted(true);
  }, []);

  // Initialize or refresh values whenever modal is opened
  useEffect(() => {
    if (isOpen) {
      let savedRole = '';
      let savedLoc = '';
      try {
        savedRole = localStorage.getItem('dashboard_search_role') || '';
        savedLoc = localStorage.getItem('dashboard_search_location') || '';
      } catch (e) {}

      setKeyword(savedRole || defaultKeyword || '');
      setLocation(savedLoc || defaultLocation || '');
    }
  }, [isOpen, defaultKeyword, defaultLocation]);

  if (!isOpen || !mounted) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const finalKeyword = keyword.trim();
    const finalLocation = location.trim();

    try {
      localStorage.setItem('dashboard_search_role', finalKeyword);
      localStorage.setItem('dashboard_search_location', finalLocation);
    } catch (e) {}

    onSearch(finalKeyword, finalLocation);
  };

  return createPortal(
    <div
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        background: 'rgba(0, 0, 0, 0.65)',
        padding: '1rem',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'var(--card-bg, #0d1117)',
          border: '1px solid var(--border, rgba(255, 255, 255, 0.12))',
          borderRadius: '16px',
          width: '100%',
          maxWidth: '460px',
          boxShadow: '0 20px 40px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.05)',
          overflow: 'hidden',
          animation: 'fadeIn 0.18s ease-out',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '1.2rem 1.4rem 1rem',
            borderBottom: '1px solid var(--border, rgba(255, 255, 255, 0.08))',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <div
              style={{
                width: '34px',
                height: '34px',
                borderRadius: '10px',
                background: 'rgba(0, 112, 243, 0.12)',
                color: '#0070f3',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Search size={18} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary, #ffffff)' }}>
                Search Online Jobs
              </h3>
              <p style={{ margin: '0.15rem 0 0', fontSize: '0.78rem', color: 'var(--text-secondary, #94a3b8)' }}>
                Search & aggregate across 20+ live job platforms
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-secondary, #94a3b8)',
              cursor: 'pointer',
              padding: '0.35rem',
              borderRadius: '6px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            aria-label="Close modal"
          >
            <X size={18} />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit}>
          <div style={{ padding: '1.4rem', display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
            {/* Job Title Field */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              <label
                htmlFor="search-modal-title"
                style={{
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                  color: 'var(--text-secondary, #94a3b8)',
                }}
              >
                Job Title / Keyword
              </label>
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <Search
                  size={15}
                  style={{
                    position: 'absolute',
                    left: '12px',
                    color: 'var(--text-secondary, #94a3b8)',
                    pointerEvents: 'none',
                  }}
                />
                <JobTitleTypeahead
                  id="search-modal-title"
                  value={keyword}
                  onChange={setKeyword}
                  placeholder={defaultKeyword || 'e.g. Product Manager, Frontend Engineer'}
                  autoFocus
                  inputStyle={{
                    width: '100%',
                    padding: '0.65rem 2.2rem 0.65rem 2.4rem',
                    fontSize: '0.9rem',
                    borderRadius: '8px',
                    border: '1px solid var(--border, rgba(255, 255, 255, 0.15))',
                    background: 'var(--bg-glass, rgba(0, 0, 0, 0.25))',
                    color: 'var(--text-primary, #ffffff)',
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
                {keyword && (
                  <button
                    type="button"
                    onClick={() => setKeyword('')}
                    style={{
                      position: 'absolute',
                      right: '10px',
                      background: 'none',
                      border: 'none',
                      color: 'var(--text-secondary, #94a3b8)',
                      cursor: 'pointer',
                      padding: '2px',
                    }}
                    title="Clear title"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
            </div>

            {/* Location Field */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              <label
                htmlFor="search-modal-location"
                style={{
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                  color: 'var(--text-secondary, #94a3b8)',
                }}
              >
                Location
              </label>
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <MapPin
                  size={15}
                  style={{
                    position: 'absolute',
                    left: '12px',
                    color: 'var(--text-secondary, #94a3b8)',
                    pointerEvents: 'none',
                  }}
                />
                <input
                  id="search-modal-location"
                  type="text"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder={defaultLocation || 'e.g. Remote, San Francisco, New York'}
                  style={{
                    width: '100%',
                    padding: '0.65rem 2.2rem 0.65rem 2.4rem',
                    fontSize: '0.9rem',
                    borderRadius: '8px',
                    border: '1px solid var(--border, rgba(255, 255, 255, 0.15))',
                    background: 'var(--bg-glass, rgba(0, 0, 0, 0.25))',
                    color: 'var(--text-primary, #ffffff)',
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
                {location && (
                  <button
                    type="button"
                    onClick={() => setLocation('')}
                    style={{
                      position: 'absolute',
                      right: '10px',
                      background: 'none',
                      border: 'none',
                      color: 'var(--text-secondary, #94a3b8)',
                      cursor: 'pointer',
                      padding: '2px',
                    }}
                    title="Clear location"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Footer Actions */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
              gap: '0.75rem',
              padding: '1rem 1.4rem 1.25rem',
              borderTop: '1px solid var(--border, rgba(255, 255, 255, 0.08))',
              background: 'rgba(0, 0, 0, 0.15)',
            }}
          >
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '0.55rem 1.1rem',
                borderRadius: '8px',
                border: '1px solid var(--border, rgba(255, 255, 255, 0.15))',
                background: 'transparent',
                color: 'var(--text-secondary, #94a3b8)',
                fontSize: '0.86rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.45rem',
                padding: '0.55rem 1.35rem',
                borderRadius: '8px',
                border: 'none',
                background: '#0070f3',
                color: '#ffffff',
                fontSize: '0.86rem',
                fontWeight: 700,
                cursor: 'pointer',
                boxShadow: '0 4px 14px rgba(0, 112, 243, 0.35)',
              }}
            >
              <Search size={15} />
              <span>Search Jobs</span>
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
