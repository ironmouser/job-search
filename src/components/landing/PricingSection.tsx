import Link from 'next/link';
import { Check, Zap } from 'lucide-react';

export default function PricingSection() {
  return (
    <section id="pricing" style={{ padding: '6rem var(--section-px)', background: '#a4dbc6' }}>
      <div style={{ maxWidth: '950px', margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: '4rem' }}>
          <h2 style={{ fontSize: '2.5rem', fontWeight: 700, color: '#0f172a', marginBottom: '1rem', letterSpacing: '-0.02em' }}>
            Simple, Transparent Pricing
          </h2>
          <p style={{ color: '#1e293b', fontSize: '1.1rem', fontWeight: 500 }}>
            Choose the plan that fits your career goals.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '2.5rem', alignItems: 'center', justifyContent: 'center' }}>
          {/* Free Tier */}
          <div style={{ 
            background: '#ffffff', 
            borderRadius: '20px', 
            padding: '2.5rem 2rem', 
            display: 'flex', 
            flexDirection: 'column',
            boxShadow: '0 10px 30px -5px rgba(0, 0, 0, 0.08)',
            border: '1px solid rgba(0, 0, 0, 0.06)'
          }}>
            <h3 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#0f172a', marginBottom: '0.5rem' }}>
              Free Starter
            </h3>
            <p style={{ color: '#475569', fontSize: '0.95rem', marginBottom: '1.5rem', minHeight: '2.8rem' }}>
              Essential job discovery and pipeline tracking.
            </p>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.25rem', marginBottom: '2rem' }}>
              <span style={{ fontSize: '3rem', fontWeight: 800, color: '#0f172a' }}>$0</span>
              <span style={{ color: '#64748b', fontWeight: 500 }}>/month</span>
            </div>
            <Link 
              href="/login" 
              style={{ 
                width: '100%', 
                textAlign: 'center', 
                textDecoration: 'none', 
                marginBottom: '2rem',
                padding: '0.85rem 1.5rem',
                borderRadius: '10px',
                fontWeight: 600,
                fontSize: '1rem',
                color: '#0f172a',
                background: '#f1f5f9',
                border: '1px solid #cbd5e1',
                display: 'inline-block'
              }}
            >
              Get Started Free
            </Link>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              {[
                'Multi-board job search & aggregation',
                'AI Opportunity Scoring & fit analysis',
                'Interactive Kanban application pipeline',
                'Standard 1-click apply links',
              ].map((item) => (
                <li key={item} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', color: '#334155', fontSize: '0.9rem' }}>
                  <Check size={18} color="#2563eb" style={{ flexShrink: 0 }} />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Pro Tier (Upgrade to Pro - High Contrast Pop) */}
          <div style={{ 
            background: 'linear-gradient(145deg, #0f172a 0%, #1e293b 100%)', 
            borderRadius: '20px', 
            padding: '2.75rem 2rem 2.5rem', 
            display: 'flex', 
            flexDirection: 'column', 
            border: '2.5px solid #2563eb', 
            position: 'relative',
            boxShadow: '0 25px 50px -12px rgba(15, 23, 42, 0.45)',
            transform: 'scale(1.02)'
          }}>
            <div style={{ 
              position: 'absolute', 
              top: '-14px', 
              left: '50%', 
              transform: 'translateX(-50%)', 
              background: '#2563eb', 
              color: '#ffffff', 
              padding: '0.3rem 1.2rem', 
              borderRadius: '99px', 
              fontSize: '0.8rem', 
              fontWeight: 700, 
              letterSpacing: '0.04em', 
              boxShadow: '0 4px 14px rgba(37, 99, 235, 0.5)' 
            }}>
              MOST POPULAR
            </div>
            <h3 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#ffffff', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              Pro Unlimited <Zap size={20} color="#f59e0b" fill="currentColor" />
            </h3>
            <p style={{ color: '#94a3b8', fontSize: '0.95rem', marginBottom: '1.5rem', minHeight: '2.8rem' }}>
              Unlimited AI asset generation & automated applications.
            </p>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.25rem', marginBottom: '2rem' }}>
              <span style={{ fontSize: '3rem', fontWeight: 800, color: '#ffffff' }}>$20</span>
              <span style={{ color: '#94a3b8', fontWeight: 500 }}>/month</span>
            </div>
            <Link 
              href="/login" 
              style={{ 
                width: '100%', 
                textAlign: 'center', 
                textDecoration: 'none', 
                marginBottom: '2rem',
                padding: '0.85rem 1.5rem',
                borderRadius: '10px',
                fontWeight: 700,
                fontSize: '1rem',
                color: '#ffffff',
                background: '#2563eb',
                boxShadow: '0 4px 14px rgba(37, 99, 235, 0.4)',
                display: 'inline-block'
              }}
            >
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
                <li key={item} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', color: '#f1f5f9', fontSize: '0.9rem', fontWeight: 500 }}>
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

