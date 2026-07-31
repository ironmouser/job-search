import { Check } from 'lucide-react';

export default function StoryFeatures() {
  const features = [
    "Discovers jobs",
    "Scores every opportunity",
    "Generates ATS-friendly resumes",
    "Writes tailored cover letters",
    "Tracks every application",
    "Learns which application systems it supports",
    "Auto applies where possible",
    "Alerts you only when your input is needed"
  ];

  return (
    <div style={{ padding: '4rem var(--section-px)', flex: '1 1 350px' }}>
      <h3 style={{ fontSize: '2rem', color: '#0f172a', marginBottom: '2rem', fontWeight: 700 }}>
        Meet Your AI Job Agent
      </h3>
      
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        {features.map((feature, idx) => (
          <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div style={{ 
              background: 'rgba(37, 99, 235, 0.12)', 
              borderRadius: '50%', 
              width: '28px',
              height: '28px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              color: 'var(--accent-primary)'
            }}>
              <Check size={14} strokeWidth={3} />
            </div>
            <span style={{ color: '#334155', fontSize: '1.1rem', fontWeight: 500 }}>{feature}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
