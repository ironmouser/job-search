'use client';

import { useState } from 'react';
import Link from 'next/link';
import SupportModal from '@/components/SupportModal';

export default function PublicFooter() {
  const [isSupportOpen, setIsSupportOpen] = useState(false);

  return (
    <>
      <footer style={{ 
        borderTop: '1px solid var(--border-glass)',
        padding: '4rem var(--section-px)',
        marginTop: '4rem',
        textAlign: 'center'
      }}>
        <div style={{ 
          display: 'flex', 
          justifyContent: 'center', 
          gap: '2rem',
          marginBottom: '2rem'
        }}>
          <Link href="/privacy" style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Privacy</Link>
          <Link href="/terms" style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Terms</Link>
          <button 
            onClick={() => setIsSupportOpen(true)} 
            style={{ 
              background: 'none', 
              border: 'none', 
              color: 'var(--text-secondary)', 
              fontSize: '0.9rem', 
              cursor: 'pointer',
              padding: 0,
              fontFamily: 'inherit'
            }}
          >
            Support
          </button>
        </div>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
          © {new Date().getFullYear()} Job Agent HQ. All rights reserved.
        </p>
      </footer>

      <SupportModal isOpen={isSupportOpen} onClose={() => setIsSupportOpen(false)} />
    </>
  );
}
