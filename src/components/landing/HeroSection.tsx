import Link from 'next/link';
import { getAssetUrl } from '@/lib/assets';

export default function HeroSection() {
  return (
    <section style={{ 
      padding: '6rem var(--section-px) 4rem', 
      maxWidth: '1280px',
      margin: '0 auto',
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 400px), 1fr))',
      gap: '4rem',
      alignItems: 'start'
    }}>
      <div style={{ textAlign: 'left' }}>
        <h1 style={{ 
          fontSize: 'clamp(3rem, 5vw, 4.5rem)', 
          lineHeight: 1.1,
          marginBottom: '1.5rem',
          color: 'var(--text-primary)',
          fontWeight: 700,
          letterSpacing: '-0.02em'
        }}>
          Find More Jobs.<br />
          <span style={{ color: '#2563eb' }}>Apply Faster.</span> Let AI Do the Work.
        </h1>
        
        <p style={{ 
          fontSize: '1.15rem',
          color: 'var(--text-secondary)',
          marginBottom: '1rem',
          lineHeight: 1.6,
          maxWidth: '500px'
        }}>
          Your personal AI job search agent discovers jobs, tailors your resume, writes cover letters, and can automatically complete online application forms using the information and documents you've approved.
        </p>

        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.5rem' }}>
          <Link href="/login" className="btn-primary" style={{ padding: '0.8rem 1.5rem', fontSize: '1.05rem', fontWeight: 600, borderRadius: '8px' }}>
            Get Started Free
          </Link>
          <img 
            src={getAssetUrl('/lil-bot.png')} 
            alt="Job Agent Bot" 
            style={{ height: '195px', width: 'auto', objectFit: 'contain', margin: '-1.5rem 0' }} 
          />
        </div>
      </div>

      <div className="hero-dashboard-wrapper">
        {/* Glow behind */}
        <div style={{ 
          position: 'absolute', top: '10%', left: '10%', right: '10%', bottom: '10%', 
          background: '#06af9e', filter: 'blur(56px)', opacity: 0.2, zIndex: 0 
        }} />
        <div style={{ 
          position: 'absolute', top: '20%', left: '0%', right: '20%', bottom: '0%', 
          background: 'var(--accent-primary)', filter: 'blur(56px)', opacity: 0.3, zIndex: 0 
        }} />
        
        {/* Dashboard Mockup */}
        <div style={{
          position: 'relative',
          zIndex: 1,
          background: 'linear-gradient(145deg, #1e3a8a 0%, #0f172a 100%)',
          borderRadius: '16px',
          padding: '1.4rem',
          boxShadow: '0 17px 35px -8px rgba(0, 0, 0, 0.5)',
          border: '1px solid rgba(255,255,255,0.1)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.05rem' }}>
            <div style={{ fontSize: '0.875rem', color: '#fff', fontWeight: 600 }}>Dashboard</div>
            <div style={{ width: '14px', height: '14px', border: '1.5px solid rgba(255,255,255,0.3)', borderRadius: '3px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ width: '7px', height: '7px', background: 'rgba(255,255,255,0.3)', borderRadius: '1px' }} />
            </div>
          </div>
          
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.7rem' }}>
            <div style={{ background: '#2563eb', padding: '1.05rem', borderRadius: '8px' }}>
              <div style={{ fontSize: '1.75rem', fontWeight: 700, color: '#fff', lineHeight: 1 }}>47</div>
              <div style={{ color: 'rgba(255,255,255,0.9)', fontSize: '0.63rem', marginTop: '0.35rem', fontWeight: 500 }}>Jobs Found</div>
            </div>
            <div style={{ background: '#06af9e', padding: '1.05rem', borderRadius: '8px' }}>
              <div style={{ fontSize: '1.75rem', fontWeight: 700, color: '#fff', lineHeight: 1 }}>12</div>
              <div style={{ color: 'rgba(255,255,255,0.9)', fontSize: '0.63rem', marginTop: '0.35rem', fontWeight: 500 }}>Great Matches</div>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.1)', padding: '1.05rem', borderRadius: '8px' }}>
              <div style={{ fontSize: '1.75rem', fontWeight: 700, color: '#fff', lineHeight: 1 }}>28</div>
              <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.63rem', marginTop: '0.35rem', fontWeight: 500 }}>Scored</div>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.1)', padding: '1.05rem', borderRadius: '8px' }}>
              <div style={{ fontSize: '1.75rem', fontWeight: 700, color: '#fff', lineHeight: 1 }}>2</div>
              <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.63rem', marginTop: '0.35rem', fontWeight: 500 }}>Archived</div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
