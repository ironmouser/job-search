import Link from 'next/link';

export default function PricingSection() {
  return (
    <section id="pricing" style={{ padding: '6rem 2rem', background: 'var(--bg-glass)' }}>
      <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: '4rem' }}>
          <h2 style={{ fontSize: '2.5rem', color: 'var(--text-primary)', marginBottom: '1rem' }}>Pricing</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '1.1rem' }}>Simple, transparent pricing.</p>
        </div>

        <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap', justifyContent: 'center' }}>
          {/* Free */}
          <div className="glass-card" style={{ flex: '1 1 300px', textAlign: 'center', padding: '3rem 2rem' }}>
            <h3 style={{ fontSize: '1.5rem', color: 'var(--text-primary)', marginBottom: '1rem' }}>Free</h3>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem' }}>Basic automated job search</p>
            <Link href="/login" className="btn-outline" style={{ width: '100%', display: 'block', textDecoration: 'none' }}>
              Get Started
            </Link>
          </div>

          {/* Professional */}
          <div className="glass-card" style={{ flex: '1 1 300px', textAlign: 'center', padding: '3rem 2rem', border: '2px solid var(--accent-primary)', background: 'rgba(37,99,235,0.05)', position: 'relative' }}>
            <div style={{ position: 'absolute', top: '-14px', left: '50%', transform: 'translateX(-50%)', background: 'var(--accent-primary)', color: '#fff', padding: '0.25rem 1rem', borderRadius: '99px', fontSize: '0.85rem', fontWeight: 600 }}>Most Popular</div>
            <h3 style={{ fontSize: '1.5rem', color: 'var(--text-primary)', marginBottom: '1rem' }}>Professional</h3>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem' }}>Unlimited jobs & tailored resumes</p>
            <Link href="/login" className="btn-primary" style={{ width: '100%', display: 'block', textDecoration: 'none' }}>
              Get Started
            </Link>
          </div>

          {/* Unlimited */}
          <div className="glass-card" style={{ flex: '1 1 300px', textAlign: 'center', padding: '3rem 2rem' }}>
            <h3 style={{ fontSize: '1.5rem', color: 'var(--text-primary)', marginBottom: '1rem' }}>Unlimited</h3>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem' }}>Auto-apply everywhere</p>
            <Link href="/login" className="btn-outline" style={{ width: '100%', display: 'block', textDecoration: 'none' }}>
              Get Started
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
