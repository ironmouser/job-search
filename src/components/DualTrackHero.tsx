"use client";

import Link from 'next/link';
import { Compass, Sparkles, ArrowRight, Search } from 'lucide-react';

interface DualTrackHeroProps {
  onFindJobsClick: () => void;
  onPrepareClick?: () => void;
}

export default function DualTrackHero({
  onFindJobsClick,
  onPrepareClick,
}: DualTrackHeroProps) {
  return (
    <div 
      className="dual-track-hero-container"
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
        gap: '1rem',
        marginTop: '1.25rem',
        marginBottom: '1.75rem',
      }}
    >
      {/* Track 1: Find a Job */}
      <div
        className="glass-card dual-track-card dual-track-card-find"
        style={{
          padding: '1.35rem 1.5rem',
          borderRadius: '14px',
          border: '1px solid var(--border-glass, rgba(255, 255, 255, 0.12))',
          background: 'linear-gradient(135deg, rgba(56, 189, 248, 0.08) 0%, rgba(30, 58, 138, 0.05) 100%)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          gap: '1rem',
          position: 'relative',
          overflow: 'hidden',
          transition: 'transform 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.85rem' }}>
          <div
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '10px',
              background: 'rgba(56, 189, 248, 0.15)',
              border: '1px solid rgba(56, 189, 248, 0.3)',
              color: '#38bdf8',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <Compass size={22} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h3 style={{ margin: '0 0 0.25rem 0', fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)' }}>
              Find a job
            </h3>
            <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.45 }}>
              Discover opportunities that match your experience and goals across 20+ top job boards.
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
          <button
            type="button"
            onClick={onFindJobsClick}
            className="btn-outline"
            style={{
              padding: '0.55rem 1.15rem',
              borderRadius: '8px',
              fontSize: '0.85rem',
              fontWeight: 600,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.45rem',
              background: 'rgba(56, 189, 248, 0.08)',
              borderColor: 'rgba(56, 189, 248, 0.3)',
              color: '#38bdf8',
            }}
          >
            <Search size={14} />
            <span>Find jobs</span>
          </button>
        </div>
      </div>

      {/* Track 2: Prepare an Application */}
      <div
        className="glass-card dual-track-card dual-track-card-prepare"
        style={{
          padding: '1.35rem 1.5rem',
          borderRadius: '14px',
          border: '1px solid rgba(99, 102, 241, 0.3)',
          background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.1) 0%, rgba(139, 92, 246, 0.05) 100%)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          gap: '1rem',
          position: 'relative',
          overflow: 'hidden',
          transition: 'transform 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.85rem' }}>
          <div
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '10px',
              background: 'rgba(99, 102, 241, 0.18)',
              border: '1px solid rgba(99, 102, 241, 0.35)',
              color: 'var(--accent-primary, #6366f1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <Sparkles size={22} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                Prepare an application
              </h3>
              <span
                style={{
                  fontSize: '0.7rem',
                  fontWeight: 600,
                  color: 'var(--accent-primary, #6366f1)',
                  background: 'rgba(99, 102, 241, 0.15)',
                  padding: '2px 7px',
                  borderRadius: '10px',
                }}
              >
                Already found a job post?
              </span>
            </div>
            <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.45 }}>
              Already found a job somewhere else? Bring it to JAHQ and we will help tailor your application.
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-start', gap: '0.5rem' }}>
          {onPrepareClick ? (
            <button
              type="button"
              onClick={onPrepareClick}
              className="btn-primary"
              style={{
                padding: '0.55rem 1.25rem',
                borderRadius: '8px',
                fontSize: '0.85rem',
                fontWeight: 600,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.45rem',
              }}
            >
              <span>Prepare application</span>
              <ArrowRight size={14} />
            </button>
          ) : (
            <Link
              href="/prepare"
              className="btn-primary"
              style={{
                padding: '0.55rem 1.25rem',
                borderRadius: '8px',
                fontSize: '0.85rem',
                fontWeight: 600,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.45rem',
                textDecoration: 'none',
              }}
            >
              <span>Prepare application</span>
              <ArrowRight size={14} />
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
