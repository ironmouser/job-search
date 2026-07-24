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
    <section id="features" style={{ padding: '6rem var(--section-px)', background: '#f8fafc' }}>
      <style>{`
        .comparison-child-div {
          max-width: 1050px;
          margin: 0 auto;
          background-image: url('/light-robot.png');
          background-repeat: no-repeat;
          background-position: right bottom;
          background-size: 380px auto;
          min-height: 520px;
        }

        .comparison-card {
          max-width: 660px;
          width: 100%;
          border-radius: 16px;
          overflow: hidden;
          box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.08), 0 8px 10px -6px rgba(0, 0, 0, 0.03);
          border: 1px solid rgba(0, 0, 0, 0.06);
          background: #ffffff;
          display: grid;
          grid-template-columns: 1fr 1fr;
        }

        .comparison-header {
          max-width: 660px;
          width: 100%;
          text-align: center;
          margin-bottom: 3.5rem;
        }

        @media (max-width: 960px) {
          .comparison-child-div {
            background-position: right -20px bottom;
            background-size: 300px auto;
          }
          .comparison-card,
          .comparison-header {
            max-width: 500px;
          }
        }

        @media (max-width: 768px) {
          .comparison-child-div {
            background-image: none;
            min-height: auto;
          }
          .comparison-card,
          .comparison-header {
            max-width: 100%;
          }
        }
      `}</style>

      <div className="comparison-child-div">
        {/* Title Header */}
        <div className="comparison-header">
          <h2 style={{ 
            fontSize: '2.5rem', 
            fontWeight: 700, 
            color: '#0f172a', 
            marginBottom: '0.75rem',
            letterSpacing: '-0.02em'
          }}>
            Why It's Different
          </h2>
          <p style={{ color: '#64748b', fontSize: '1.1rem', margin: 0 }}>
            Stop applying like it's 2015.
          </p>
        </div>

        {/* Comparison Card */}
        <div className="comparison-card">
          {/* Header Row */}
          <div style={{ 
            background: '#ffffff', 
            padding: '1.2rem 1.5rem', 
            borderBottom: '1px solid #f1f5f9' 
          }}>
            <h3 style={{ 
              fontSize: '1.15rem', 
              color: '#0f172a', 
              margin: 0, 
              fontWeight: 700 
            }}>
              Traditional
            </h3>
          </div>

          <div style={{ 
            background: '#06af9e', 
            padding: '1.2rem 1.5rem', 
            borderBottom: '1px solid rgba(255,255,255,0.2)' 
          }}>
            <h3 style={{ 
              fontSize: '1.15rem', 
              color: '#ffffff', 
              margin: 0, 
              fontWeight: 700 
            }}>
              Your AI Agent
            </h3>
          </div>

          {/* Data Rows */}
          {comparisons.map((item, idx) => (
            <div style={{ display: 'contents' }} key={idx}>
              {/* Traditional Side */}
              <div style={{ 
                background: '#ffffff', 
                padding: '1rem 1.25rem', 
                borderBottom: idx === comparisons.length - 1 ? 'none' : '1px solid #f1f5f9',
                display: 'flex', 
                alignItems: 'center', 
                gap: '0.75rem',
                color: '#475569'
              }}>
                <X size={16} color="#f87171" style={{ flexShrink: 0 }} />
                <span style={{ fontSize: '0.95rem', fontWeight: 400 }}>{item.old}</span>
              </div>

              {/* AI Agent Side */}
              <div style={{ 
                background: '#06af9e', 
                padding: '1rem 1.25rem', 
                borderBottom: idx === comparisons.length - 1 ? 'none' : '1px solid rgba(255,255,255,0.2)',
                display: 'flex', 
                alignItems: 'center', 
                gap: '0.75rem',
                color: '#ffffff'
              }}>
                <div style={{
                  width: '20px',
                  height: '20px',
                  borderRadius: '50%',
                  background: '#ffffff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0
                }}>
                  <Check size={13} color="#06af9e" strokeWidth={3} />
                </div>
                <span style={{ fontSize: '0.95rem', fontWeight: 600 }}>{item.new}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

