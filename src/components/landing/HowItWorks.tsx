import { getAssetUrl } from '@/lib/assets';

export default function HowItWorks() {
  const steps = [
    {
      title: "Resume",
      desc: "Upload your existing resume once. Our system parses and understands your background."
    },
    {
      title: "AI Finds Jobs",
      desc: "Our AI searches multiple job boards and scores each opportunity against your profile."
    },
    {
      title: "AI Tailors",
      desc: "Every application receives a customized resume and cover letter to match the job description."
    },
    {
      title: "Auto Apply",
      desc: "For supported job sites, the agent completes the application form automatically."
    },
    {
      title: "Track Everything",
      desc: "Manage every application from one centralized Kanban board and track your success rate."
    }
  ];

  return (
    <section id="how-it-works" style={{ padding: '6rem var(--section-px)', background: 'var(--bg-glass)' }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
        
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 350px), 1fr))', gap: '4rem', alignItems: 'center' }}>
          
          {/* Left Column: Timeline */}
          <div>
            <h2 style={{ fontSize: '2.5rem', color: 'var(--text-primary)', marginBottom: '3rem' }}>How It Works</h2>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2.5rem', position: 'relative' }}>
              {/* Vertical Line */}
              <div style={{ 
                position: 'absolute', left: '19px', top: '10px', bottom: '10px', 
                width: '2px', background: 'var(--border-glass)', zIndex: 0 
              }} />

              {steps.map((step, idx) => (
                <div key={idx} style={{ display: 'flex', gap: '1.5rem', position: 'relative', zIndex: 1 }}>
                  <div style={{ 
                    width: '40px', height: '40px', borderRadius: '50%', 
                    background: (idx === 0 || idx === 4) ? 'var(--accent-primary)' : '#0d9488', 
                    color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontWeight: 'bold', fontSize: '1.2rem', flexShrink: 0,
                    boxShadow: '0 0 0 6px var(--bg-glass)'
                  }}>
                    {idx + 1}
                  </div>
                  <div style={{ paddingTop: '0.25rem' }}>
                    <h3 style={{ fontSize: '1.25rem', color: 'var(--text-primary)', marginBottom: '0.5rem', fontWeight: 600 }}>{step.title}</h3>
                    <p style={{ color: 'var(--text-secondary)', lineHeight: 1.6 }}>{step.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right Column: Layers Illustration */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%' }}>
            <img 
              src={getAssetUrl('/layers.png')} 
              alt="How it works workflow diagram" 
              style={{ width: '100%', height: 'auto', objectFit: 'contain' }} 
            />
          </div>
        </div>
      </div>
    </section>
  );
}
