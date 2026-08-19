'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { ShieldCheck, CheckCircle2, AlertTriangle, Key, ExternalLink, RefreshCw, Trash2, Zap } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ConnectJobBoardModal } from '@/components/ConnectJobBoardModal';

export interface JobBoardAccount {
  id: string;
  name: string;
  description: string;
  connected: boolean;
  status: 'connected' | 'expired' | 'disconnected';
  profileName: string | null;
  profileEmail: string | null;
  lastUsedAt: string | null;
  expiresAt: string | null;
  updatedAt: string | null;
}

export default function ConnectedAccountsSection() {
  const [accounts, setAccounts] = useState<JobBoardAccount[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [disconnecting, setDisconnecting] = useState<string | null>(null);
  const [selectedProvider, setSelectedProvider] = useState<{ id: string; name: string; description: string } | null>(null);
  const [modalOpen, setModalOpen] = useState<boolean>(false);

  const fetchAccounts = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/connected-accounts');
      if (res.ok) {
        const data = await res.json();
        if (data.accounts) {
          setAccounts(data.accounts);
        }
      }
    } catch (err) {
      console.error('[ConnectedAccounts] Failed to fetch:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);

  const handleDisconnect = async (providerId: string) => {
    try {
      setDisconnecting(providerId);
      const res = await fetch(`/api/connected-accounts/${providerId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        await fetchAccounts();
      }
    } catch (err) {
      console.error('[ConnectedAccounts] Disconnect failed:', err);
    } finally {
      setDisconnecting(null);
    }
  };

  const handleOpenConnect = (provider: JobBoardAccount) => {
    setSelectedProvider({
      id: provider.id,
      name: provider.name,
      description: provider.description,
    });
    setModalOpen(true);
  };

  const getProviderIcon = (id: string) => {
    switch (id) {
      case 'linkedin':
        return '💼';
      case 'indeed':
        return '🔍';
      case 'ziprecruiter':
        return '⚡';
      case 'dice':
        return '🎲';
      default:
        return '🌐';
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Intro & Security Banner */}
      <div
        style={{
          padding: '16px 20px',
          borderRadius: '12px',
          backgroundColor: 'rgba(99, 102, 241, 0.08)',
          border: '1px solid rgba(99, 102, 241, 0.2)',
          display: 'flex',
          alignItems: 'flex-start',
          gap: '14px',
        }}
      >
        <ShieldCheck size={24} style={{ color: 'var(--primary, #6366f1)', flexShrink: 0, marginTop: '2px' }} />
        <div>
          <div style={{ fontWeight: 600, color: 'var(--text-primary, #f4f4f5)', fontSize: '0.95rem', marginBottom: '4px' }}>
            Connected Job Boards for 1-Click & Easy Apply
          </div>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary, #a1a1aa)', lineHeight: 1.5 }}>
            Connect your job board profiles so Jahq can automate applications on ZipRecruiter 1-Click, Dice Easy Apply, and LinkedIn. Sessions are encrypted using AES-256-GCM and refreshed automatically.
          </div>
        </div>
      </div>

      {/* Grid of Accounts */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
          gap: '16px',
        }}
      >
        {accounts.map((acc) => {
          const isConnected = acc.status === 'connected';
          const isExpired = acc.status === 'expired';

          return (
            <div
              key={acc.id}
              style={{
                borderRadius: '12px',
                backgroundColor: 'var(--bg-card, #18181b)',
                border: isConnected
                  ? '1px solid rgba(34, 197, 94, 0.3)'
                  : isExpired
                  ? '1px solid rgba(234, 179, 8, 0.3)'
                  : '1px solid var(--border-color, #27272a)',
                padding: '18px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                gap: '16px',
                transition: 'all 0.2s ease',
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ fontSize: '1.4rem' }}>{getProviderIcon(acc.id)}</span>
                    <div>
                      <div style={{ fontWeight: 600, color: 'var(--text-primary, #f4f4f5)', fontSize: '0.95rem' }}>
                        {acc.name}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary, #a1a1aa)' }}>
                        {acc.description}
                      </div>
                    </div>
                  </div>

                  {isConnected ? (
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        color: '#22c55e',
                        backgroundColor: 'rgba(34, 197, 94, 0.1)',
                        padding: '4px 8px',
                        borderRadius: '6px',
                      }}
                    >
                      <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#22c55e' }} />
                      Connected
                    </span>
                  ) : isExpired ? (
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        color: '#eab308',
                        backgroundColor: 'rgba(234, 179, 8, 0.1)',
                        padding: '4px 8px',
                        borderRadius: '6px',
                      }}
                    >
                      <AlertTriangle size={12} />
                      Action Needed
                    </span>
                  ) : (
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        fontSize: '0.75rem',
                        fontWeight: 500,
                        color: 'var(--text-muted, #71717a)',
                        backgroundColor: 'var(--bg-muted, #27272a)',
                        padding: '4px 8px',
                        borderRadius: '6px',
                      }}
                    >
                      Not Connected
                    </span>
                  )}
                </div>

                {isConnected && (
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary, #a1a1aa)', marginTop: '8px', lineHeight: 1.4 }}>
                    {acc.profileName && <div>Profile: <strong style={{ color: 'var(--text-primary)' }}>{acc.profileName}</strong></div>}
                    {acc.profileEmail && <div>Email: {acc.profileEmail}</div>}
                    {acc.lastUsedAt && (
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                        Last used: {new Date(acc.lastUsedAt).toLocaleDateString()}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', gap: '8px', marginTop: 'auto' }}>
                {isConnected ? (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleOpenConnect(acc)}
                      style={{ flex: 1, fontSize: '0.8rem' }}
                    >
                      <RefreshCw size={13} style={{ marginRight: '6px' }} />
                      Refresh
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={disconnecting === acc.id}
                      onClick={() => handleDisconnect(acc.id)}
                      style={{ color: '#ef4444', fontSize: '0.8rem' }}
                    >
                      <Trash2 size={13} style={{ marginRight: '4px' }} />
                      Disconnect
                    </Button>
                  </>
                ) : (
                  <Button
                    size="sm"
                    onClick={() => handleOpenConnect(acc)}
                    style={{
                      width: '100%',
                      backgroundColor: 'var(--primary, #6366f1)',
                      color: '#ffffff',
                      fontSize: '0.825rem',
                      fontWeight: 500,
                    }}
                  >
                    <Zap size={14} style={{ marginRight: '6px' }} />
                    Connect {acc.name}
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <ConnectJobBoardModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        provider={selectedProvider}
        onConnected={fetchAccounts}
      />
    </div>
  );
}
