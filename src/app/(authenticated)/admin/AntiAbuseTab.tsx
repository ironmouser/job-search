'use client';

import { useState, useEffect } from 'react';
import { ShieldAlert, AlertTriangle, UserCheck, RefreshCw } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';

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
      <div className="flex items-center justify-center p-12 text-slate-400 text-sm">
        <RefreshCw className="w-5 h-5 animate-spin mr-2" /> Loading Anti-Abuse & Multi-Account Incidents...
      </div>
    );
  }

  const multiFlagged = data?.multiFlaggedAccounts || [];
  const incidents = data?.recentIncidents || [];

  return (
    <div className="space-y-6">
      {/* Metric Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="bg-slate-900/60 border-slate-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-amber-500" /> Total Collision Incidents
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-100">{data?.totalIncidents || 0}</div>
            <p className="text-xs text-slate-400 mt-1">Logged multi-account detection triggers</p>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/60 border-slate-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-500" /> Multi-Flagged Accounts (&gt;1)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-400">{data?.multiFlaggedCount || 0}</div>
            <p className="text-xs text-slate-400 mt-1">Accounts flagged multiple times across signals</p>
          </CardContent>
        </Card>
      </div>

      {/* Multi-Flagged Accounts Section */}
      {multiFlagged.length > 0 && (
        <Card className="bg-slate-900/80 border-red-500/40">
          <CardHeader>
            <CardTitle className="text-sm font-bold text-red-400 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" /> Multi-Flagged User Summary (&gt;1 Trigger)
            </CardTitle>
            <CardDescription className="text-xs text-slate-400">
              Users with multiple identity collisions sharing a unified quota group
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {multiFlagged.map((u: any) => (
              <div key={u.id} className="p-4 bg-slate-950/60 border border-slate-800 rounded-lg space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-200 text-sm">{u.name || 'Unnamed'} ({u.email})</span>
                  <span className="px-2 py-0.5 text-[10px] font-bold rounded bg-red-900/60 text-red-300 border border-red-500/50">
                    {u.collisionLogsTarget?.length || 0} Incidences
                  </span>
                </div>

                <div className="text-xs text-slate-400 grid grid-cols-1 md:grid-cols-2 gap-2 mt-2">
                  <div><strong className="text-slate-300">Normalized Email:</strong> {u.normalizedEmail || 'N/A'}</div>
                  <div><strong className="text-slate-300">Unified Quota Group:</strong> {u.unifiedQuotaGroupId || u.id}</div>
                  <div><strong className="text-slate-300">Deferral Reason:</strong> {u.trialDeferralReason || 'None'}</div>
                  <div><strong className="text-slate-300">Created:</strong> {new Date(u.createdAt).toLocaleDateString()}</div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Recent Incidents Table */}
      <Card className="bg-slate-900/60 border-slate-800">
        <CardHeader>
          <CardTitle className="text-sm font-bold text-slate-200">
            Recent Identity Collision Logs
          </CardTitle>
          <CardDescription className="text-xs text-slate-400">
            Real-time feed of email normalization, disposable domain, mobile device, and profile collisions
          </CardDescription>
        </CardHeader>
        <CardContent>
          {incidents.length === 0 ? (
            <div className="text-xs text-slate-500 py-6 text-center">No collision incidents logged yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left text-slate-300">
                <thead className="bg-slate-950 text-slate-400 font-semibold border-b border-slate-800">
                  <tr>
                    <th className="p-3">Target User</th>
                    <th className="p-3">Signal Type</th>
                    <th className="p-3">Matched Primary User</th>
                    <th className="p-3">IP Address</th>
                    <th className="p-3">Timestamp</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {incidents.map((log: any) => (
                    <tr key={log.id} className="hover:bg-slate-800/40">
                      <td className="p-3 font-medium text-slate-200">
                        {log.targetUser?.email || log.targetUserId}
                      </td>
                      <td className="p-3">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-900/40 text-amber-300 border border-amber-500/30">
                          {log.signalType}
                        </span>
                      </td>
                      <td className="p-3 text-slate-400">
                        {log.primaryUser ? `${log.primaryUser.email} (${log.primaryUser.id.substring(0, 8)}...)` : 'None / N/A'}
                      </td>
                      <td className="p-3 text-slate-400 font-mono text-[11px]">
                        {log.ipAddress || 'Unknown'}
                      </td>
                      <td className="p-3 text-slate-400">
                        {new Date(log.createdAt).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
