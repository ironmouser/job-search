'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Menu, X } from 'lucide-react';

export default function PublicNav() {
  const [isOpen, setIsOpen] = useState(false);

  const toggleMenu = () => setIsOpen(!isOpen);
  const closeMenu = () => setIsOpen(false);

  return (
    <nav className="public-nav">
      <div className="public-nav-header">
        <Link href="/" style={{ textDecoration: 'none' }} onClick={closeMenu}>
          <h2 className="page-title" style={{ fontSize: '1.5rem', margin: 0, color: '#06af9e' }}>Job Agent HQ</h2>
        </Link>
        
        <button className="public-nav-burger" onClick={toggleMenu} aria-label="Toggle navigation">
          {isOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      <div className={`public-nav-menu ${isOpen ? 'open' : ''}`}>
        <div className="public-nav-links">
          <Link href="#features" style={{ fontSize: '0.95rem', color: 'var(--text-secondary)' }} onClick={closeMenu}>Features</Link>
          <Link href="#how-it-works" style={{ fontSize: '0.95rem', color: 'var(--text-secondary)' }} onClick={closeMenu}>How it Works</Link>
          <Link href="/pricing" style={{ fontSize: '0.95rem', color: 'var(--text-secondary)' }} onClick={closeMenu}>Pricing</Link>
          <Link href="#faq" style={{ fontSize: '0.95rem', color: 'var(--text-secondary)' }} onClick={closeMenu}>FAQ</Link>
        </div>

        <div className="public-nav-actions">
          <Link href="/login" style={{ fontSize: '0.95rem', color: 'var(--text-secondary)', fontWeight: 600, textDecoration: 'none' }} onClick={closeMenu}>Login</Link>
          <Link href="/login" className="btn-primary" style={{ textDecoration: 'none', padding: '0.6rem 1.25rem', fontSize: '0.95rem', borderRadius: '8px', fontWeight: 600, textAlign: 'center' }} onClick={closeMenu}>Get Started</Link>
        </div>
      </div>
    </nav>
  );
}
