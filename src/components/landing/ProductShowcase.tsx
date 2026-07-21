'use client';

import { useState, useEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

const slides = [
  {
    label: 'Dashboard',
    placeholder: 'Dashboard UI — Jobs Found, Great Matches, Scored, Archived',
    accent: '#2563eb',
    mockup: (
      <div style={{ padding: '2rem var(--section-px)', width: '100%' }}>
        <div style={{ marginBottom: '1.5rem', fontSize: '1.1rem', fontWeight: 600, color: '#fff', opacity: 0.9 }}>AI Dashboard</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
          <div style={{ background: '#2563eb', padding: '1.25rem', borderRadius: '10px' }}>
            <div style={{ fontSize: '2rem', fontWeight: 700, color: '#fff' }}>47</div>
            <div style={{ color: 'rgba(255,255,255,0.8)', fontSize: '0.8rem' }}>Jobs Found</div>
          </div>
          <div style={{ background: '#06af9e', padding: '1.25rem', borderRadius: '10px' }}>
            <div style={{ fontSize: '2rem', fontWeight: 700, color: '#fff' }}>12</div>
            <div style={{ color: 'rgba(255,255,255,0.8)', fontSize: '0.8rem' }}>Great Matches</div>
          </div>
          <div style={{ background: 'rgba(255,255,255,0.15)', padding: '1.25rem', borderRadius: '10px' }}>
            <div style={{ fontSize: '2rem', fontWeight: 700, color: '#fff' }}>8</div>
            <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.8rem' }}>Applied</div>
          </div>
          <div style={{ background: 'rgba(255,255,255,0.15)', padding: '1.25rem', borderRadius: '10px' }}>
            <div style={{ fontSize: '2rem', fontWeight: 700, color: '#fff' }}>3</div>
            <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.8rem' }}>Waiting for Review</div>
          </div>
        </div>
      </div>
    ),
  },
  {
    label: 'Kanban Board',
    placeholder: 'Kanban Board — Application pipeline',
    accent: '#7c3aed',
    mockup: (
      <div style={{ padding: '2rem var(--section-px)', width: '100%' }}>
        <div style={{ marginBottom: '1.5rem', fontSize: '1.1rem', fontWeight: 600, color: '#fff', opacity: 0.9 }}>Application Pipeline</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.75rem' }}>
          {['Scored', 'Assets Ready', 'Applied', 'Interviewing'].map((col) => (
            <div key={col}>
              <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.6)', marginBottom: '0.5rem', fontWeight: 600 }}>{col}</div>
              {[1, 2].map(i => (
                <div key={i} style={{ background: 'rgba(255,255,255,0.1)', padding: '0.6rem', borderRadius: '6px', marginBottom: '0.5rem' }}>
                  <div style={{ width: '80%', height: '6px', background: 'rgba(255,255,255,0.3)', borderRadius: '2px', marginBottom: '0.4rem' }} />
                  <div style={{ width: '55%', height: '5px', background: 'rgba(255,255,255,0.2)', borderRadius: '2px' }} />
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    ),
  },
  {
    label: 'Resume Generator',
    placeholder: 'Resume Generator — AI tailored resumes',
    accent: '#06af9e',
    mockup: (
      <div style={{ padding: '2rem var(--section-px)', width: '100%' }}>
        <div style={{ marginBottom: '1.5rem', fontSize: '1.1rem', fontWeight: 600, color: '#fff', opacity: 0.9 }}>AI Resume Generator</div>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <div style={{ flex: 1, background: 'rgba(255,255,255,0.08)', borderRadius: '8px', padding: '1rem' }}>
            {[90, 70, 85, 60, 75].map((w, i) => (
              <div key={i} style={{ height: '6px', width: `${w}%`, background: 'rgba(255,255,255,0.3)', borderRadius: '2px', marginBottom: '0.6rem' }} />
            ))}
          </div>
          <div style={{ flex: 1, background: 'rgba(6,175,158,0.2)', border: '1px solid rgba(6,175,158,0.4)', borderRadius: '8px', padding: '1rem' }}>
            <div style={{ fontSize: '0.7rem', color: '#06af9e', fontWeight: 600, marginBottom: '0.75rem' }}>AI Tailored</div>
            {[95, 80, 90, 70, 85].map((w, i) => (
              <div key={i} style={{ height: '6px', width: `${w}%`, background: '#06af9e', opacity: 0.6, borderRadius: '2px', marginBottom: '0.6rem' }} />
            ))}
          </div>
        </div>
      </div>
    ),
  },
  {
    label: 'Job Detail',
    placeholder: 'Job Detail — Full description, score, and actions',
    accent: '#f59e0b',
    mockup: (
      <div style={{ padding: '2rem var(--section-px)', width: '100%' }}>
        <div style={{ marginBottom: '1rem', fontSize: '1.1rem', fontWeight: 600, color: '#fff', opacity: 0.9 }}>Job Detail</div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
          <div>
            <div style={{ width: '140px', height: '10px', background: 'rgba(255,255,255,0.4)', borderRadius: '3px', marginBottom: '0.4rem' }} />
            <div style={{ width: '90px', height: '7px', background: 'rgba(255,255,255,0.2)', borderRadius: '3px' }} />
          </div>
          <div style={{ background: '#f59e0b', color: '#000', fontWeight: 700, fontSize: '1.2rem', padding: '0.4rem 0.75rem', borderRadius: '8px' }}>92</div>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
          {['Apply', 'Generate Resume', 'Cover Letter'].map(btn => (
            <div key={btn} style={{ background: 'rgba(255,255,255,0.1)', padding: '0.35rem 0.6rem', borderRadius: '6px', fontSize: '0.65rem', color: 'rgba(255,255,255,0.7)' }}>{btn}</div>
          ))}
        </div>
        {[100, 85, 70, 90, 65, 80].map((w, i) => (
          <div key={i} style={{ height: '5px', width: `${w}%`, background: 'rgba(255,255,255,0.15)', borderRadius: '2px', marginBottom: '0.5rem' }} />
        ))}
      </div>
    ),
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
          <div style={{ flex: '0 0 auto', width: '280px', opacity: 0.45, transform: 'scale(0.88)', transition: 'all 0.4s cubic-bezier(0.22, 1, 0.36, 1)', pointerEvents: 'none', borderRadius: '16px', overflow: 'hidden', background: `linear-gradient(145deg, ${getSlide(-1).accent}55 0%, #0f172a 100%)`, minHeight: '280px', display: 'flex', alignItems: 'center' }}>
            {getSlide(-1).mockup}
          </div>

          {/* Active Slide */}
          <div
            key={animKey}
            className={direction === 'right' ? 'slide-in-right' : 'slide-in-left'}
            style={{ flex: '0 0 auto', width: 'min(640px, 80vw)', borderRadius: '20px', overflow: 'hidden', boxShadow: `0 25px 60px rgba(0,0,0,0.4), 0 0 0 1px ${slides[activeIdx].accent}44`, background: `linear-gradient(145deg, ${slides[activeIdx].accent}88 0%, #0f172a 100%)`, transition: 'box-shadow 0.4s ease, background 0.4s ease', minHeight: '320px', display: 'flex', alignItems: 'center' }}
          >
            {slides[activeIdx].mockup}
          </div>

          {/* Right Peek */}
          <div style={{ flex: '0 0 auto', width: '280px', opacity: 0.45, transform: 'scale(0.88)', transition: 'all 0.4s cubic-bezier(0.22, 1, 0.36, 1)', pointerEvents: 'none', borderRadius: '16px', overflow: 'hidden', background: `linear-gradient(145deg, ${getSlide(1).accent}55 0%, #0f172a 100%)`, minHeight: '280px', display: 'flex', alignItems: 'center' }}>
            {getSlide(1).mockup}
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

