export default function StatsFunnel() {
  const stats = [
    { label: "Resume", value: "1", color: "var(--accent-primary)", width: "100%" },
    { label: "Jobs Found", value: "48", color: "var(--accent-secondary)", width: "85%" },
    { label: "Great Matches", value: "12", color: "#3695e3", width: "70%" },
    { label: "Applications", value: "8", color: "var(--success)", width: "55%" },
    { label: "Interviews", value: "3", color: "var(--warning)", width: "40%" },
    { label: "Offer", value: "1", color: "#f59e0b", width: "25%" }
  ];

  return (
    <div style={{ flex: 1, padding: '4rem var(--section-px)', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <h3 style={{ fontSize: '2rem', color: 'var(--text-primary)', marginBottom: '3rem', textAlign: 'center' }}>
        Statistics Funnel
      </h3>
      
      <div style={{ width: '100%', maxWidth: '400px', display: 'flex', flexDirection: 'column', gap: '0.5rem', alignItems: 'center' }}>
        {stats.map((stat, idx) => (
          <div key={idx} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
            <div style={{
              width: stat.width,
              background: stat.color,
              color: '#fff',
              padding: '0.75rem',
              textAlign: 'center',
              fontWeight: 600,
              fontSize: '1.1rem',
              borderRadius: '8px',
              boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
            }}>
              {stat.value} {stat.label}
            </div>
            {idx < stats.length - 1 && (
              <div style={{ color: 'var(--text-secondary)', opacity: 0.5, margin: '0.25rem 0' }}>↓</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
