"use client";

import { useEffect, useState } from "react";
import { BarChart2, Filter, Target, Send, Users } from "lucide-react";
import { PageHeader, PageHeaderHeading, PageHeaderDescription } from "@/components/ui/page-header";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

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

  if (loading) return <div style={{ padding: '2rem', color: 'var(--muted-foreground)' }}>Loading analytics...</div>;

  const funnel = data?.funnel || {};
  const totalScored = (funnel.scored || 0) + (funnel.asset_generated || 0) + (funnel.applied || 0) + (funnel.interviewing || 0) + (funnel.offer || 0) + (funnel.rejected || 0);
  const totalApplied = (funnel.applied || 0) + (funnel.interviewing || 0) + (funnel.offer || 0) + (funnel.rejected || 0);
  const totalInterviews = (funnel.interviewing || 0) + (funnel.offer || 0) + (funnel.rejected || 0);

  const applyRate = totalScored > 0 ? Math.round((totalApplied / totalScored) * 100) : 0;
  const interviewRate = totalApplied > 0 ? Math.round((totalInterviews / totalApplied) * 100) : 0;

  return (
    <div className="animate-fade-in" style={{ paddingBottom: '4rem' }}>
      <PageHeader>
        <div>
          <PageHeaderHeading>Analytics Engine</PageHeaderHeading>
          <PageHeaderDescription>Track your opportunity funnel, application conversion rates, and response metrics</PageHeaderDescription>
        </div>
      </PageHeader>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', marginBottom: '2rem' }} data-tour="analytics-stats">
        <StatCard title="Jobs Found" value={funnel.discovered || 0} icon={<Filter size={20} style={{ color: '#a78bfa' }} />} />
        <StatCard title="Great Matches" value={totalScored} icon={<Target size={20} style={{ color: '#60a5fa' }} />} />
        <StatCard title="Applications Sent" value={totalApplied} icon={<Send size={20} style={{ color: '#34d399' }} />} />
        <StatCard title="Interviews" value={totalInterviews} icon={<Users size={20} style={{ color: '#fbbf24' }} />} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem' }}>
        <Card data-tour="analytics-funnel">
          <CardHeader variant="stripe">
            <CardTitle style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1rem' }}>
              <BarChart2 size={18} style={{ color: 'var(--primary)' }} /> Conversion Funnel
            </CardTitle>
          </CardHeader>
          <CardContent style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', paddingTop: '1.5rem' }}>
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
          </CardContent>
        </Card>

        <Card data-tour="analytics-status">
          <CardHeader variant="stripe">
            <CardTitle style={{ fontSize: '1rem' }}>Pipeline Breakdown</CardTitle>
          </CardHeader>
          <CardContent style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', paddingTop: '1.5rem' }}>
            <StatusRow label="Jobs Found (Unscored)" count={funnel.discovered || 0} color="var(--muted-foreground)" />
            <StatusRow label="Scored (Under Review)" count={funnel.scored || 0} color="#60a5fa" />
            <StatusRow label="Assets Generated (Ready)" count={funnel.asset_generated || 0} color="#a78bfa" />
            <StatusRow label="Applied (Awaiting Response)" count={funnel.applied || 0} color="#34d399" />
            <StatusRow label="Interviewing" count={funnel.interviewing || 0} color="#fbbf24" />
            <StatusRow label="Offers Received" count={funnel.offer || 0} color="#10b981" />
            <StatusRow label="Rejected" count={funnel.rejected || 0} color="#ef4444" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StatCard({ title, value, icon }: { title: string; value: number; icon: React.ReactNode }) {
  return (
    <Card style={{ padding: '1.25rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
        <span style={{ fontSize: '0.85rem', color: 'var(--muted-foreground)', fontWeight: 500 }}>{title}</span>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {icon}
        </div>
      </div>
      <div style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--foreground)', fontFamily: 'var(--font-display)' }}>{value}</div>
    </Card>
  );
}

function FunnelStep({ label, percentage, subtext, color }: { label: string; percentage: number; subtext: string; color: string }) {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
        <span style={{ fontWeight: 600, fontSize: '0.875rem' }}>{label}</span>
        <span style={{ fontWeight: 700, color, fontSize: '0.875rem' }}>{percentage}%</span>
      </div>
      <div style={{ width: '100%', height: '8px', background: 'var(--muted)', borderRadius: '99px', overflow: 'hidden', marginBottom: '0.375rem' }}>
        <div style={{ height: '100%', width: `${percentage}%`, background: color, borderRadius: '99px', transition: 'width 0.3s ease' }} />
      </div>
      <div style={{ fontSize: '0.8125rem', color: 'var(--muted-foreground)' }}>{subtext}</div>
    </div>
  );
}

function StatusRow({ label, count, color }: { label: string; count: number; color: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.625rem 0.875rem', background: 'var(--background)', borderRadius: 'var(--radius, 6px)', border: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
        <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: color }} />
        <span style={{ fontSize: '0.875rem', color: 'var(--foreground)' }}>{label}</span>
      </div>
      <span style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--foreground)' }}>{count}</span>
    </div>
  );
}
