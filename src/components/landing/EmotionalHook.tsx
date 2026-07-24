import { Check } from 'lucide-react';
import { getAssetUrl } from '@/lib/assets';

export default function EmotionalHook() {
  const guyBgUrl = getAssetUrl('/guy.png');

  const tasks = [
    "Searches thousands of jobs",
    "Scores every opportunity",
    "Tailors your resume",
    "Prepares applications",
    "Auto applies where supported"
  ];

  return (
    <>
      <style>{`
        .wake-up-section {
          position: relative;
          padding: 5rem var(--section-px);
          background-color: #10192E;
          background-image: url(${guyBgUrl});
          background-repeat: no-repeat;
          background-size: contain;
          background-position: top left;
        }

        .wake-up-content {
          max-width: 900px;
          margin: 0 auto;
          position: relative;
          z-index: 1;
        }

        @media (max-width: 900px) {
          .wake-up-section {
            background-size: cover;
            background-blend-mode: luminosity;
          }
        }

        @media (min-width: 901px) {
          .wake-up-content {
            margin-right: 0px;
          }
        }

        @media (min-width: 1801px) {
          .wake-up-content {
            margin-right: auto;
          }
        }
      `}</style>
      <section className="wake-up-section">
        <div className="wake-up-content">
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
    </>
  );
}
