import { Check, X } from 'lucide-react';

export default function Comparison() {
  const comparisons = [
    { old: "Search manually", new: "AI searches continuously" },
    { old: "Read every description", new: "AI scores every job" },
    { old: "Rewrite resume", new: "AI customizes instantly" },
    { old: "Write cover letter", new: "AI writes it" },
    { old: "Fill forms", new: "AI fills them" },
    { old: "Track applications in spreadsheets", new: "Built-in Kanban" }
  ];

  return (
    <section id="features" style={{ padding: '6rem var(--section-px)' }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: '4rem' }}>
          <h2 style={{ fontSize: '2.5rem', color: 'var(--text-primary)', marginBottom: '1rem' }}>Why It's Different</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '1.1rem' }}>Stop applying like it's 2015.</p>
        </div>

        <div style={{ 
          borderRadius: '16px', 
          overflow: 'hidden', 
          border: '1px solid var(--border-glass)',
          display: 'grid', 
          gridTemplateColumns: '1fr 1.2fr',
          boxShadow: 'rgba(0, 0, 0, 0.3) 0px 5px 10px -2px'
        }}>
          {/* Header Row */}
          <div style={{ background: 'var(--bg-surface)', padding: '1.5rem 2rem', borderBottom: '1px solid var(--border-glass)' }}>
            <h3 style={{ fontSize: '1.25rem', color: 'var(--text-primary)', margin: 0 }}>Traditional</h3>
          </div>
          <div style={{ background: '#06af9e', padding: '1.5rem 2rem', borderBottom: '1px solid rgba(255,255,255,0.2)' }}>
            <h3 style={{ fontSize: '1.25rem', color: '#fff', margin: 0, fontWeight: 600 }}>Your AI Agent</h3>
          </div>

          {/* Data Rows */}
          {comparisons.map((item, idx) => (
            <div style={{ display: 'contents' }} key={idx}>
              {/* Traditional Side */}
              <div style={{ 
                background: idx % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent', 
                padding: '1.5rem 2rem', 
                borderBottom: idx === comparisons.length - 1 ? 'none' : '1px solid var(--border-glass)',
                display: 'flex', alignItems: 'center', gap: '1rem',
                color: 'var(--text-secondary)'
              }}>
                <X size={20} color="var(--danger)" opacity={0.5} style={{ flexShrink: 0 }} />
                <span style={{ fontSize: '1.05rem' }}>{item.old}</span>
              </div>

              {/* AI Agent Side */}
              <div style={{ 
                background: '#06af9e', 
                padding: '1.5rem 2rem', 
                borderBottom: idx === comparisons.length - 1 ? 'none' : '1px solid rgba(255,255,255,0.2)',
                display: 'flex', alignItems: 'center', gap: '1rem',
                color: '#fff'
              }}>
                <div style={{
                  width: '24px',
                  height: '24px',
                  borderRadius: '50%',
                  background: '#fff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                  flexShrink: 0
                }}>
                  <Check size={14} color="#10b981" strokeWidth={3} />
                </div>
                <span style={{ fontSize: '1.05rem', fontWeight: 500 }}>{item.new}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
