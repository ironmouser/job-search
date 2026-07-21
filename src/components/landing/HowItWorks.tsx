import { FileText, Search, Edit3, Send, LayoutGrid } from 'lucide-react';

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

          {/* Right Column: Illustrations */}
          <div style={{ position: 'relative', minHeight: '500px', width: '100%', display: 'flex', alignItems: 'center' }}>
            
            {/* Card 1: Resume / Profile */}
            <div className="glass-card" style={{ 
              position: 'absolute', top: '5%', right: '5%', width: '70%', padding: '1.5rem', zIndex: 1,
              transform: 'rotate(2deg)'
            }}>
              <div style={{ width: '40%', height: '12px', background: 'var(--border-glass)', borderRadius: '4px', marginBottom: '1.5rem' }} />
              <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'var(--accent-primary)', opacity: 0.5 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ width: '60%', height: '10px', background: 'var(--border-glass)', borderRadius: '4px', marginBottom: '0.75rem' }} />
                  <div style={{ width: '90%', height: '8px', background: 'var(--border-glass)', borderRadius: '4px', marginBottom: '0.5rem' }} />
                  <div style={{ width: '80%', height: '8px', background: 'var(--border-glass)', borderRadius: '4px' }} />
                </div>
              </div>
            </div>

            {/* Card 2: AI / Kanban */}
            <div className="glass-card" style={{ 
              position: 'absolute', top: '35%', left: '0', width: '85%', padding: '1.5rem', zIndex: 2, 
              border: '1px solid var(--accent-primary)', 
              boxShadow: '0 15px 35px rgba(37,99,235,0.15)' 
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
                <div style={{ width: '30%', height: '12px', background: 'var(--accent-primary)', borderRadius: '4px' }} />
                <div style={{ width: '20px', height: '20px', borderRadius: '4px', background: 'var(--border-glass)' }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem' }}>
                {[1,2,3].map(i => (
                  <div key={i} style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '6px', padding: '0.75rem' }}>
                    <div style={{ width: '60%', height: '8px', background: 'var(--text-secondary)', opacity: 0.5, borderRadius: '2px', marginBottom: '0.75rem' }} />
                    <div style={{ width: '100%', height: '30px', background: 'var(--border-glass)', borderRadius: '4px', marginBottom: '0.5rem' }} />
                    <div style={{ width: '100%', height: '30px', background: 'var(--border-glass)', borderRadius: '4px' }} />
                  </div>
                ))}
              </div>
            </div>

            {/* Card 3: Status / Apply */}
            <div className="glass-card" style={{ 
              position: 'absolute', bottom: '10%', right: '10%', width: '60%', padding: '1.5rem', zIndex: 3,
              transform: 'rotate(-2deg)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
                <div style={{ width: '50%', height: '12px', background: 'var(--border-glass)', borderRadius: '4px' }} />
                <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: '#10b981' }} />
              </div>
              <div style={{ width: '100%', height: '8px', background: 'var(--border-glass)', borderRadius: '4px', marginBottom: '0.5rem' }} />
              <div style={{ width: '80%', height: '8px', background: 'var(--border-glass)', borderRadius: '4px', marginBottom: '1rem' }} />
              <div style={{ width: '100%', height: '40px', background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.2)', borderRadius: '6px' }} />
            </div>

          </div>
        </div>
      </div>
    </section>
  );
}
