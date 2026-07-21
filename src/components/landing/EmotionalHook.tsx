import { Check } from 'lucide-react';

export default function EmotionalHook() {
  const tasks = [
    "Searches thousands of jobs",
    "Scores every opportunity",
    "Tailors your resume",
    "Prepares applications",
    "Auto applies where supported"
  ];

  return (
    <section style={{ 
      position: 'relative',
      padding: '5rem 2rem',
      background: '#10192E'
    }}>
      <div style={{ 
        maxWidth: '900px',
        margin: '0 auto',
        padding: '3.5rem 3rem',
        background: '#10192E',
        borderRadius: '24px',
        boxShadow: '0 20px 40px rgba(0, 0, 0, 0.4)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        position: 'relative',
        zIndex: 1
      }}>
        <h2 style={{ fontSize: 'clamp(2rem, 3.5vw, 2.5rem)', color: '#ffffff', textAlign: 'center', marginBottom: '2.5rem', fontWeight: 700 }}>
          Wake Up to New Opportunities
        </h2>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem', maxWidth: '380px', margin: '0 auto' }}>
          {tasks.map((task, idx) => (
            <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <Check size={20} color="#10b981" strokeWidth={3} style={{ flexShrink: 0 }} />
              <span style={{ color: '#e2e8f0', fontSize: '1.1rem', fontWeight: 500 }}>{task}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
