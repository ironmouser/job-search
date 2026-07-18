import Link from 'next/link';

export default function PublicFooter() {
  return (
    <footer style={{ 
      borderTop: '1px solid var(--border-glass)',
      padding: '4rem 2rem',
      marginTop: '4rem',
      textAlign: 'center'
    }}>
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        gap: '2rem',
        marginBottom: '2rem'
      }}>
        <Link href="#" style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Company</Link>
        <Link href="/privacy" style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Privacy</Link>
        <Link href="/terms" style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Terms</Link>
        <Link href="#" style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Support</Link>
        <Link href="#" style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>LinkedIn</Link>
      </div>
      <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
        © {new Date().getFullYear()} Job Agent HQ. All rights reserved.
      </p>
    </footer>
  );
}
