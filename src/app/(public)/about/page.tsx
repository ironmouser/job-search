import Link from 'next/link';

export default function AboutUsPage() {
  return (
    <div style={{ maxWidth: '900px', margin: '4rem auto', padding: '0 2rem', color: 'var(--text-primary)', lineHeight: 1.7 }}>
      <Link href="/" style={{ color: 'var(--accent-primary)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '0.5rem', marginBottom: '2rem', fontWeight: 500 }}>
        ← Back to Home
      </Link>
      
      <div className="glass-card" style={{ padding: '3.5rem 3rem', borderRadius: '16px', background: 'var(--bg-surface)', border: '1px solid var(--border-glass)' }}>
        <h1 style={{ fontSize: '2.8rem', marginBottom: '1rem', color: 'var(--text-primary)', fontWeight: 800, letterSpacing: '-0.02em' }}>About Job Agent HQ</h1>
        <p style={{ fontSize: '1.25rem', color: 'var(--text-secondary)', marginBottom: '2.5rem', fontWeight: 400 }}>
          Empowering job seekers with unified job discovery, instant AI match scoring, and smart application tracking.
        </p>
        
        <hr style={{ border: 'none', borderTop: '1px solid var(--border-glass)', margin: '2rem 0' }} />

        <h2 style={{ fontSize: '1.8rem', marginTop: '2.5rem', marginBottom: '1rem', color: 'var(--text-primary)', fontWeight: 700 }}>Our Mission</h2>
        <p>
          Searching for a new opportunity should feel clear and focused, not overwhelming. Juggling dozens of job boards and spending hours parsing long job descriptions can make searching feel like a full-time job.
        </p>
        <p style={{ marginTop: '1rem' }}>
          Job Agent HQ was created to bring clarity to your career journey. We aggregate opportunities from across the web into one central workspace, using AI analysis to highlight your best matches and streamline your preparation.
        </p>

        <h2 style={{ fontSize: '1.8rem', marginTop: '2.5rem', marginBottom: '1rem', color: 'var(--text-primary)', fontWeight: 700 }}>Why Job Agent HQ?</h2>
        <p>
          We build tools that respect your time, privacy, and career goals. Here is what makes our platform different:
        </p>
        
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1.5rem', margin: '2rem 0' }}>
          <div style={{ padding: '1.5rem', borderRadius: '12px', background: 'rgba(255, 255, 255, 0.03)', border: '1px solid var(--border-glass)' }}>
            <h3 style={{ fontSize: '1.2rem', marginBottom: '0.5rem', color: 'var(--accent-primary)', fontWeight: 600 }}>Unified Job Feed</h3>
            <p style={{ fontSize: '0.95rem', color: 'var(--text-secondary)' }}>
              No jumping between multiple tabs and job sites. See aggregated listings from top job boards in a single workspace so you never miss a solid opening.
            </p>
          </div>

          <div style={{ padding: '1.5rem', borderRadius: '12px', background: 'rgba(255, 255, 255, 0.03)', border: '1px solid var(--border-glass)' }}>
            <h3 style={{ fontSize: '1.2rem', marginBottom: '0.5rem', color: 'var(--accent-primary)', fontWeight: 600 }}>AI Match Scoring</h3>
            <p style={{ fontSize: '0.95rem', color: 'var(--text-secondary)' }}>
              Save hours of reading line by line. Get immediate fit scores and breakdown of key qualifications, helping you focus your energy on high value opportunities.
            </p>
          </div>

          <div style={{ padding: '1.5rem', borderRadius: '12px', background: 'rgba(255, 255, 255, 0.03)', border: '1px solid var(--border-glass)' }}>
            <h3 style={{ fontSize: '1.2rem', marginBottom: '0.5rem', color: 'var(--accent-primary)', fontWeight: 600 }}>Tailored Excellence</h3>
            <p style={{ fontSize: '0.95rem', color: 'var(--text-secondary)' }}>
              Stand out to hiring managers. Generate customized resumes and personalized cover letters aligned directly with specific job requirements in seconds.
            </p>
          </div>

          <div style={{ padding: '1.5rem', borderRadius: '12px', background: 'rgba(255, 255, 255, 0.03)', border: '1px solid var(--border-glass)' }}>
            <h3 style={{ fontSize: '1.2rem', marginBottom: '0.5rem', color: 'var(--accent-primary)', fontWeight: 600 }}>Privacy First</h3>
            <p style={{ fontSize: '0.95rem', color: 'var(--text-secondary)' }}>
              Your career data belongs to you. We never sell your personal information or share your saved jobs, resumes, or application records with outside parties.
            </p>
          </div>
        </div>

        <h2 style={{ fontSize: '1.8rem', marginTop: '2.5rem', marginBottom: '1rem', color: 'var(--text-primary)', fontWeight: 700 }}>What We Offer</h2>
        <ul style={{ paddingLeft: '1.5rem', margin: '1rem 0', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <li><strong>Aggregated Job Feed:</strong> Explore listings from multiple major job boards in one unified interface.</li>
          <li><strong>AI Match Analysis:</strong> Evaluate fit scores and extract key requirements from job descriptions instantly.</li>
          <li><strong>Tailored Resumes & Cover Letters:</strong> Draft tailored application documents matched to target postings.</li>
          <li><strong>Kanban Pipeline Manager:</strong> Track every application organized cleanly by stage.</li>
          <li><strong>Application Co-Pilot:</strong> Get guided assistance to organize and submit your applications efficiently.</li>
        </ul>

        <hr style={{ border: 'none', borderTop: '1px solid var(--border-glass)', margin: '2.5rem 0 2rem 0' }} />

        <div style={{ background: 'rgba(255, 255, 255, 0.02)', padding: '1.5rem', borderRadius: '12px', border: '1px solid var(--border-glass)', textAlign: 'center' }}>
          <h3 style={{ fontSize: '1.3rem', marginBottom: '0.5rem', fontWeight: 600 }}>Ready to simplify your job search?</h3>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '1.25rem' }}>Take control of your job search with Job Agent HQ today.</p>
          <Link href="/login" className="btn-primary" style={{ display: 'inline-block', textDecoration: 'none', padding: '0.75rem 1.75rem', borderRadius: '8px', fontWeight: 600 }}>
            Get Started Today
          </Link>
        </div>
      </div>
    </div>
  );
}
