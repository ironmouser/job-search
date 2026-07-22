import Link from 'next/link';
import { Check, Sparkles, Zap } from 'lucide-react';

export default function PricingSection() {
  return (
    <section id="pricing" style={{ padding: '6rem var(--section-px)', background: 'var(--bg-glass)' }}>
      <div style={{ maxWidth: '900px', margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: '4rem' }}>
          <h2 style={{ fontSize: '2.5rem', color: 'var(--text-primary)', marginBottom: '1rem' }}>Simple, Transparent Pricing</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '1.1rem' }}>Choose the plan that fits your career goals.</p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '2rem', justifyContent: 'center' }}>
          {/* Free Tier */}
          <div className="glass-card" style={{ padding: '2.5rem 2rem', display: 'flex', flexDirection: 'column' }}>
            <h3 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.5rem' }}>Free Starter</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', marginBottom: '1.5rem', minHeight: '2.8rem' }}>
              Essential job discovery and pipeline tracking.
            </p>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.25rem', marginBottom: '2rem' }}>
              <span style={{ fontSize: '3rem', fontWeight: 800, color: 'var(--text-primary)' }}>$0</span>
              <span style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>/month</span>
            </div>
            <Link href="/login" className="btn-outline" style={{ width: '100%', textAlign: 'center', textDecoration: 'none', marginBottom: '2rem' }}>
              Get Started Free
            </Link>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              {[
                'Multi-board job search & aggregation',
                'AI Opportunity Scoring & fit analysis',
                'Interactive Kanban application pipeline',
                'Standard 1-click apply links',
              ].map((item) => (
                <li key={item} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                  <Check size={18} color="var(--accent-primary)" style={{ flexShrink: 0 }} />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Pro Tier */}
          <div className="glass-card" style={{ padding: '2.5rem 2rem', display: 'flex', flexDirection: 'column', border: '2px solid var(--accent-primary)', background: 'rgba(37,99,235,0.05)', position: 'relative' }}>
            <div style={{ position: 'absolute', top: '-14px', left: '50%', transform: 'translateX(-50%)', background: 'var(--accent-primary)', color: '#fff', padding: '0.25rem 1rem', borderRadius: '99px', fontSize: '0.8rem', fontWeight: 700, letterSpacing: '0.03em', boxShadow: '0 4px 12px var(--accent-glow)' }}>
              MOST POPULAR
            </div>
            <h3 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              Pro Unlimited <Zap size={20} color="#f2a900" fill="currentColor" />
            </h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', marginBottom: '1.5rem', minHeight: '2.8rem' }}>
              Unlimited AI asset generation & automated applications.
            </p>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.25rem', marginBottom: '2rem' }}>
              <span style={{ fontSize: '3rem', fontWeight: 800, color: 'var(--text-primary)' }}>$29</span>
              <span style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>/month</span>
            </div>
            <Link href="/login" className="btn-primary" style={{ width: '100%', textAlign: 'center', textDecoration: 'none', marginBottom: '2rem' }}>
              Upgrade to Pro
            </Link>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              {[
                'Everything in Free Starter',
                'Unlimited AI Tailored Resumes & Cover Letters',
                'Auto Apply Worker automation (hands-free)',
                'AI Application Q&A Assistant',
                'Automatic Email Sync (Gmail / IMAP)',
                'Custom Career Page URL Scraper',
              ].map((item) => (
                <li key={item} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', color: 'var(--text-primary)', fontSize: '0.9rem', fontWeight: 500 }}>
                  <Check size={18} color="#10b981" style={{ flexShrink: 0 }} />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
