'use client';

import { useState, useEffect } from 'react';
import { ShieldAlert, AlertTriangle, RefreshCw } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';

export function AntiAbuseTab() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/anti-abuse');
      const json = await res.json();
      if (res.ok) {
        setData(json);
      }
    } catch (e) {
      console.error('Failed to fetch anti-abuse logs:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  if (loading) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '3rem',
          color: 'var(--muted-foreground)',
          fontSize: '0.875rem',
          gap: '0.5rem',
        }}
      >
        <RefreshCw size={18} className="animate-spin" aria-hidden="true" />
        <span>Loading Anti-Abuse &amp; Multi-Account Incidents...</span>
      </div>
    );
  }

  const multiFlagged = data?.multiFlaggedAccounts || [];
  const incidents = data?.recentIncidents || [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Metric Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1rem' }}>
        <Card>
          <CardHeader style={{ paddingBottom: '0.5rem' }}>
            <CardTitle style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--muted-foreground)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <ShieldAlert size={16} style={{ color: '#f59e0b' }} aria-hidden="true" /> Total Collision Incidents
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--foreground)' }}>{data?.totalIncidents || 0}</div>
            <p style={{ fontSize: '0.8125rem', color: 'var(--muted-foreground)', marginTop: '0.25rem' }}>Logged multi-account detection triggers</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader style={{ paddingBottom: '0.5rem' }}>
            <CardTitle style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--muted-foreground)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <AlertTriangle size={16} style={{ color: '#ef4444' }} aria-hidden="true" /> Multi-Flagged Accounts (&gt;1)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div style={{ fontSize: '1.75rem', fontWeight: 700, color: '#ef4444' }}>{data?.multiFlaggedCount || 0}</div>
            <p style={{ fontSize: '0.8125rem', color: 'var(--muted-foreground)', marginTop: '0.25rem' }}>Accounts flagged multiple times across signals</p>
          </CardContent>
        </Card>
      </div>

      {/* Multi-Flagged Accounts Section */}
      {multiFlagged.length > 0 && (
        <Card style={{ borderColor: 'rgba(239, 68, 68, 0.35)' }}>
          <CardHeader>
            <CardTitle style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#ef4444' }}>
              <AlertTriangle size={16} aria-hidden="true" /> Multi-Flagged User Summary (&gt;1 Trigger)
            </CardTitle>
            <CardDescription>
              Users with multiple identity collisions sharing a unified quota group
            </CardDescription>
          </CardHeader>
          <CardContent style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
            {multiFlagged.map((u: any) => (
              <div
                key={u.id}
                style={{
                  padding: '1rem',
                  background: 'var(--muted)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-md, 8px)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.5rem',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
                  <span style={{ fontWeight: 600, color: 'var(--foreground)', fontSize: '0.875rem' }}>
                    {u.name || 'Unnamed'} ({u.email})
                  </span>
                  <Badge variant="destructive">
                    {u.collisionLogsTarget?.length || 0} Incidences
                  </Badge>
                </div>

                <div
                  style={{
                    fontSize: '0.8125rem',
                    color: 'var(--muted-foreground)',
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                    gap: '0.5rem',
                  }}
                >
                  <div><strong style={{ color: 'var(--foreground)' }}>Normalized Email:</strong> {u.normalizedEmail || 'N/A'}</div>
                  <div><strong style={{ color: 'var(--foreground)' }}>Unified Quota Group:</strong> {u.unifiedQuotaGroupId || u.id}</div>
                  <div><strong style={{ color: 'var(--foreground)' }}>Deferral Reason:</strong> {u.trialDeferralReason || 'None'}</div>
                  <div><strong style={{ color: 'var(--foreground)' }}>Created:</strong> {new Date(u.createdAt).toLocaleDateString()}</div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Recent Incidents Table */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Identity Collision Logs</CardTitle>
          <CardDescription>
            Real-time feed of email normalization, disposable domain, mobile device, and profile collisions
          </CardDescription>
        </CardHeader>
        <CardContent>
          {incidents.length === 0 ? (
            <div style={{ fontSize: '0.875rem', color: 'var(--muted-foreground)', padding: '1.5rem 0', textAlign: 'center' }}>
              No collision incidents logged yet.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">Target User</TableHead>
                  <TableHead scope="col">Signal Type</TableHead>
                  <TableHead scope="col">Matched Primary User</TableHead>
                  <TableHead scope="col">IP Address</TableHead>
                  <TableHead scope="col">Timestamp</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {incidents.map((log: any) => (
                  <TableRow key={log.id}>
                    <TableCell style={{ fontWeight: 500 }}>
                      {log.targetUser?.email || log.targetUserId}
                    </TableCell>
                    <TableCell>
                      <Badge variant="warning">{log.signalType}</Badge>
                    </TableCell>
                    <TableCell style={{ color: 'var(--muted-foreground)' }}>
                      {log.primaryUser ? `${log.primaryUser.email} (${log.primaryUser.id.substring(0, 8)}...)` : 'None / N/A'}
                    </TableCell>
                    <TableCell style={{ color: 'var(--muted-foreground)', fontFamily: 'monospace', fontSize: '0.8125rem' }}>
                      {log.ipAddress || 'Unknown'}
                    </TableCell>
                    <TableCell style={{ color: 'var(--muted-foreground)' }}>
                      {new Date(log.createdAt).toLocaleString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
