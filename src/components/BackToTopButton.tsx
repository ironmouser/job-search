"use client";

import { ArrowUp } from 'lucide-react';

export function scrollToTop() {
  const mainContent = document.querySelector('.main-content');
  if (mainContent) {
    mainContent.scrollTo({ top: 0, behavior: 'smooth' });
  }
  window.scrollTo({ top: 0, behavior: 'smooth' });
  document.documentElement.scrollTo({ top: 0, behavior: 'smooth' });
  document.body.scrollTo({ top: 0, behavior: 'smooth' });
}

export default function BackToTopButton() {
  return (
    <button 
      onClick={scrollToTop} 
      className="btn-outline" 
      style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'var(--bg-glass)' }}
    >
      <ArrowUp size={16} /> Back to Top
    </button>
  );
}
