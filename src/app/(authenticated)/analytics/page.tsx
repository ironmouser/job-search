"use client";

import { useEffect, useState } from "react";
import { BarChart2, Filter, Target, Send, Users, XCircle, CheckCircle } from "lucide-react";

export default function AnalyticsDashboard() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/analytics')
      .then(res => res.json())
      .then(d => {
        setData(d);
        setLoading(false);
      })
      .catch(e => {
        console.error(e);
        setLoading(false);
      });
  }, []);

  if (loading) return <div style={{ padding: '2rem' }}>Loading analytics...</div>;

  const funnel = data?.funnel || {};
  const totalScored = funnel.scored + funnel.asset_generated + funnel.applied + funnel.interviewing + funnel.offer + funnel.rejected;
  const totalApplied = funnel.applied + funnel.interviewing + funnel.offer + funnel.rejected;
  const totalInterviews = funnel.interviewing + funnel.offer + funnel.rejected; // Assuming rejected happened after applying/interviewing. 

  // Conversion rates
  const applyRate = totalScored > 0 ? Math.round((totalApplied / totalScored) * 100) : 0;
  const interviewRate = totalApplied > 0 ? Math.round((totalInterviews / totalApplied) * 100) : 0;

  return (
    <div className="animate-fade-in" style={{ paddingBottom: '4rem' }}>
      <div style={{ marginBottom: '3rem' }}>
        <h1 className="page-title">Analytics Engine</h1>
        <p className="page-subtitle">Track your application funnel and conversion rates</p>
      </div>

      <div className="responsive-grid" style={{ marginBottom: '3rem' }} data-tour="analytics-stats">
        <StatCard title="Jobs Found" value={funnel.discovered || 0} icon={<Filter size={24} color="#a78bfa" />} />
        <StatCard title="Great Matches" value={totalScored} icon={<Target size={24} color="#60a5fa" />} />
        <StatCard title="Applications Sent" value={totalApplied} icon={<Send size={24} color="#34d399" />} />
        <StatCard title="Interviews" value={totalInterviews} icon={<Users size={24} color="#fbbf24" />} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
        <div className="glass-card" data-tour="analytics-funnel">
          <h3 style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <BarChart2 size={20} className="text-accent" /> Conversion Funnel
          </h3>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <FunnelStep 
              label="Scored to Applied" 
              percentage={applyRate} 
              subtext={`${totalApplied} applied out of ${totalScored} highly scored`}
              color="#3b82f6"
            />
            <FunnelStep 
              label="Applied to Interviewing" 
              percentage={interviewRate} 
              subtext={`${totalInterviews} interviews out of ${totalApplied} applications`}
              color="#10b981"
            />
          </div>
        </div>

        <div className="glass-card" data-tour="analytics-status">
          <h3 style={{ marginBottom: '1.5rem' }}>Pipeline Status</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <StatusRow label="Jobs Found (Unscored)" count={funnel.discovered || 0} color="var(--text-secondary)" />
            <StatusRow label="Scored (Waiting for Review)" count={funnel.scored || 0} color="#60a5fa" />
            <StatusRow label="Assets Generated (Ready to Apply)" count={funnel.asset_generated || 0} color="#a78bfa" />
            <StatusRow label="Applied (Waiting to hear back)" count={funnel.applied || 0} color="#34d399" />
            <StatusRow label="Interviewing" count={funnel.interviewing || 0} color="#fbbf24" />
            <StatusRow label="Offers" count={funnel.offer || 0} color="#10b981" />
            <StatusRow label="Rejected" count={funnel.rejected || 0} color="#ef4444" />
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ title, value, icon }: { title: string, value: number, icon: React.ReactNode }) {
  return (
    <div className="glass-card top-stat-card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '1rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {icon}
        </div>
        <h4 style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', fontWeight: 500, margin: 0 }}>{title}</h4>
      </div>
      <h2 style={{ fontSize: '2.5rem', color: 'var(--text-primary)', margin: 0, marginTop: '0.25rem' }}>{value}</h2>
    </div>
  );
}

function FunnelStep({ label, percentage, subtext, color }: { label: string, percentage: number, subtext: string, color: string }) {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
        <span style={{ fontWeight: 600 }}>{label}</span>
        <span style={{ fontWeight: 700, color }}>{percentage}%</span>
      </div>
      <div style={{ width: '100%', height: '8px', background: 'var(--bg-color)', borderRadius: '99px', overflow: 'hidden', marginBottom: '0.5rem' }}>
        <div style={{ height: '100%', width: `${percentage}%`, background: color, borderRadius: '99px' }} />
      </div>
      <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{subtext}</div>
    </div>
  );
}

function StatusRow({ label, count, color }: { label: string, count: number, color: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem', background: 'rgba(255,255,255,0.02)', borderRadius: '8px', border: '1px solid var(--border-glass)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: color }} />
        <span style={{ fontSize: '0.95rem' }}>{label}</span>
      </div>
      <span style={{ fontWeight: 600 }}>{count}</span>
    </div>
  );
}
