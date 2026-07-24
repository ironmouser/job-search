'use client';

import { useState, useEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { getAssetUrl } from '@/lib/assets';

const slides = [
  {
    label: 'Dashboard',
    placeholder: 'Dashboard UI — Jobs Found, Great Matches, Scored, Archived',
    accent: '#2563eb',
    image: '/dashboard.png',
  },
  {
    label: 'Kanban Board',
    placeholder: 'Kanban Board — Application pipeline',
    accent: '#7c3aed',
    image: '/pipeline.png',
  },
  {
    label: 'Resume Generator',
    placeholder: 'Resume Generator — AI tailored resumes',
    accent: '#06af9e',
    image: '/resume.png',
  },
  {
    label: 'Job Detail',
    placeholder: 'Job Detail — Full description, score, and actions',
    accent: '#f59e0b',
    image: '/Job.png',
  },
];

export default function ProductShowcase() {
  const [activeIdx, setActiveIdx] = useState(0);
  const [animKey, setAnimKey] = useState(0);
  const [direction, setDirection] = useState<'left' | 'right'>('right');
  const isAnimating = useRef(false);

  const navigate = (newIdx: number, dir: 'left' | 'right') => {
    if (isAnimating.current) return;
    isAnimating.current = true;
    setDirection(dir);
    setActiveIdx(newIdx);
    setAnimKey(k => k + 1);
    setTimeout(() => { isAnimating.current = false; }, 400);
  };

  const prev = () => navigate((activeIdx - 1 + slides.length) % slides.length, 'left');
  const next = () => navigate((activeIdx + 1) % slides.length, 'right');
  const goTo = (idx: number) => navigate(idx, idx > activeIdx ? 'right' : 'left');

  const getSlide = (offset: number) => slides[(activeIdx + offset + slides.length) % slides.length];

  return (
    <>
    <style>{`
      @keyframes slideInRight { from { opacity: 0; transform: translateX(40px) scale(0.97); } to { opacity: 1; transform: translateX(0) scale(1); } }
      @keyframes slideInLeft  { from { opacity: 0; transform: translateX(-40px) scale(0.97); } to { opacity: 1; transform: translateX(0) scale(1); } }
      .slide-in-right { animation: slideInRight 0.4s cubic-bezier(0.22, 1, 0.36, 1) both; }
      .slide-in-left  { animation: slideInLeft  0.4s cubic-bezier(0.22, 1, 0.36, 1) both; }
    `}</style>
    <section style={{ padding: '6rem 0', overflow: 'hidden' }}>
      <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '0 var(--section-px)', position: 'relative' }}>
        <h2 style={{ fontSize: '2.5rem', color: 'var(--text-primary)', marginBottom: '2.5rem', textAlign: 'center' }}>See it in Action</h2>

        {/* Tab Navigation */}
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '3rem', flexWrap: 'wrap', justifyContent: 'center' }}>
          {slides.map((slide, idx) => (
            <button
              key={slide.label}
              onClick={() => goTo(idx)}
              style={{
                padding: '0.6rem 1.25rem',
                borderRadius: '8px',
                border: 'none',
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: '0.95rem',
                transition: 'all 0.25s ease',
                background: activeIdx === idx ? slide.accent : 'var(--bg-surface)',
                color: activeIdx === idx ? '#fff' : 'var(--text-secondary)',
                boxShadow: activeIdx === idx ? `0 4px 12px ${slide.accent}55` : 'none',
              }}
            >
              {slide.label}
            </button>
          ))}
        </div>

        {/* Carousel */}
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1.5rem' }}>

          {/* Prev Arrow */}
          <button onClick={prev} style={{ position: 'absolute', left: '0.5rem', zIndex: 10, background: 'var(--bg-surface)', border: '1px solid var(--border-glass)', borderRadius: '50%', width: '44px', height: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--text-primary)', boxShadow: 'rgba(0,0,0,0.2) 0px 4px 12px' }}>
            <ChevronLeft size={20} />
          </button>

          {/* Left Peek */}
          <div style={{ flex: '0 0 auto', width: '280px', opacity: 0.45, transform: 'scale(0.88)', transition: 'all 0.4s cubic-bezier(0.22, 1, 0.36, 1)', pointerEvents: 'none', borderRadius: '10px', overflow: 'hidden', minHeight: '280px', display: 'flex', alignItems: 'center' }}>
            <img src={getAssetUrl(getSlide(-1).image)} alt={getSlide(-1).label} style={{ width: '100%', height: 'auto', display: 'block', borderRadius: '10px', objectFit: 'contain' }} />
          </div>

          {/* Active Slide */}
          <div
            key={animKey}
            className={direction === 'right' ? 'slide-in-right' : 'slide-in-left'}
            style={{ flex: '0 0 auto', width: 'min(640px, 80vw)', borderRadius: '10px', overflow: 'hidden', boxShadow: `0 25px 60px rgba(0,0,0,0.4), 0 0 0 1px ${slides[activeIdx].accent}44`, transition: 'box-shadow 0.4s ease, background 0.4s ease', display: 'flex', alignItems: 'center' }}
          >
            <img src={getAssetUrl(slides[activeIdx].image)} alt={slides[activeIdx].label} style={{ width: '100%', height: 'auto', display: 'block', borderRadius: '10px', objectFit: 'contain' }} />
          </div>

          {/* Right Peek */}
          <div style={{ flex: '0 0 auto', width: '280px', opacity: 0.45, transform: 'scale(0.88)', transition: 'all 0.4s cubic-bezier(0.22, 1, 0.36, 1)', pointerEvents: 'none', borderRadius: '10px', overflow: 'hidden', minHeight: '280px', display: 'flex', alignItems: 'center' }}>
            <img src={getAssetUrl(getSlide(1).image)} alt={getSlide(1).label} style={{ width: '100%', height: 'auto', display: 'block', borderRadius: '10px', objectFit: 'contain' }} />
          </div>

          {/* Next Arrow */}
          <button onClick={next} style={{ position: 'absolute', right: '0.5rem', zIndex: 10, background: 'var(--bg-surface)', border: '1px solid var(--border-glass)', borderRadius: '50%', width: '44px', height: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--text-primary)', boxShadow: 'rgba(0,0,0,0.2) 0px 4px 12px' }}>
            <ChevronRight size={20} />
          </button>
        </div>

        {/* Dot indicators */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem', marginTop: '2rem' }}>
          {slides.map((_, idx) => (
            <button key={idx} onClick={() => goTo(idx)} style={{ width: idx === activeIdx ? '24px' : '8px', height: '8px', borderRadius: '4px', border: 'none', cursor: 'pointer', transition: 'all 0.35s cubic-bezier(0.22, 1, 0.36, 1)', background: idx === activeIdx ? slides[activeIdx].accent : 'var(--border-glass)' }} />
          ))}
        </div>
      </div>
    </section>
    </>
  );
}

