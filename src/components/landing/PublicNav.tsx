import Link from 'next/link';

export default function PublicNav() {
  return (
    <nav style={{ 
      display: 'flex', 
      justifyContent: 'space-between', 
      alignItems: 'center', 
      padding: '1.5rem 2rem',
      maxWidth: '1200px',
      margin: '0 auto',
      width: '100%'
    }}>
      <div style={{ flex: 1 }}>
        <Link href="/" style={{ textDecoration: 'none' }}>
          <h2 className="page-title" style={{ fontSize: '1.5rem', margin: 0, color: '#06af9e' }}>Job Agent HQ</h2>
        </Link>
      </div>
        
      <div style={{ display: 'flex', gap: '2rem', flex: 2, justifyContent: 'center' }} className="nav-links">
        <Link href="#features" style={{ fontSize: '0.95rem', color: 'var(--text-secondary)' }}>Features</Link>
        <Link href="#how-it-works" style={{ fontSize: '0.95rem', color: 'var(--text-secondary)' }}>How it Works</Link>
        <Link href="/pricing" style={{ fontSize: '0.95rem', color: 'var(--text-secondary)' }}>Pricing</Link>
        <Link href="#faq" style={{ fontSize: '0.95rem', color: 'var(--text-secondary)' }}>FAQ</Link>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', flex: 1, justifyContent: 'flex-end' }}>
        <Link href="/login" style={{ fontSize: '0.95rem', color: 'var(--text-secondary)', fontWeight: 600, textDecoration: 'none' }}>Login</Link>
        <Link href="/login" className="btn-primary" style={{ textDecoration: 'none', padding: '0.6rem 1.25rem', fontSize: '0.95rem', borderRadius: '8px', fontWeight: 600 }}>Get Started</Link>
      </div>
    </nav>
  );
}
