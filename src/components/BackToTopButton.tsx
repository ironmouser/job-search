"use client";

import { ArrowUp } from 'lucide-react';

export default function BackToTopButton() {
  return (
    <button 
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} 
      className="btn-outline" 
      style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'var(--bg-glass)' }}
    >
      <ArrowUp size={16} /> Back to Top
    </button>
  );
}
