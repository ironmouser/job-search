'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { ShieldCheck, CheckCircle2, AlertTriangle, Key, RefreshCw, Trash2, Zap, Clock, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
  const [refreshing, setRefreshing] = useState<string | null>(null);
  const [disconnecting, setDisconnecting] = useState<string | null>(null);
  const [selectedProvider, setSelectedProvider] = useState<{ id: string; name: string; description: string } | null>(null);
  const [modalOpen, setModalOpen] = useState<boolean>(false);
  const [actionNotice, setActionNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

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

  const handleRefresh = async (provider: JobBoardAccount) => {
    try {
      setRefreshing(provider.id);
      setActionNotice(null);
      const res = await fetch(`/api/connected-accounts/${provider.id}/verify`, {
        method: 'POST',
      });
      const data = await res.json();
      if (res.ok && data.success) {
        if (data.verified) {
          setActionNotice({
            type: 'success',
            message: `${provider.name} session verified active (${data.daysRemaining || 30} days remaining).`,
          });
        } else {
          setActionNotice({
            type: 'error',
            message: `${provider.name} session expired or invalid. Please reconnect.`,
          });
        }
        await fetchAccounts();
      } else {
        setActionNotice({
          type: 'error',
          message: data.error || `Failed to verify ${provider.name} session.`,
        });
      }
    } catch (err: any) {
      console.error('[ConnectedAccounts] Refresh failed:', err);
      setActionNotice({ type: 'error', message: `Verification failed for ${provider.name}.` });
    } finally {
      setRefreshing(null);
    }
  };

  const handleDisconnect = async (providerId: string) => {
    try {
      setDisconnecting(providerId);
      setActionNotice(null);
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

  const getDaysRemaining = (expiresAt: string | null): number | null => {
    if (!expiresAt) return null;
    const diff = new Date(expiresAt).getTime() - Date.now();
    return Math.max(0, Math.round(diff / (1000 * 60 * 60 * 24)));
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Intro & Security Banner */}
      <div
        style={{
          padding: '16px 20px',
          borderRadius: '12px',
          backgroundColor: 'var(--accent-glow, rgba(99, 102, 241, 0.08))',
          border: '1px solid var(--border-glass, rgba(99, 102, 241, 0.2))',
          display: 'flex',
          alignItems: 'flex-start',
          gap: '14px',
        }}
      >
        <ShieldCheck size={24} style={{ color: 'var(--primary, #6366f1)', flexShrink: 0, marginTop: '2px' }} />
        <div>
          <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.95rem', marginBottom: '4px' }}>
            Connected Job Boards for 1-Click & Easy Apply
          </div>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            Connect your job board profiles so JAHQ can automate applications on ZipRecruiter 1-Click, Dice Easy Apply, and LinkedIn. Sessions are encrypted using AES-256-GCM and checked for validity.
          </div>
        </div>
      </div>

      {/* Action Notification Banner */}
      {actionNotice && (
        <div
          style={{
            padding: '10px 14px',
            borderRadius: '8px',
            backgroundColor: actionNotice.type === 'success' ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)',
            border: actionNotice.type === 'success' ? '1px solid rgba(34, 197, 94, 0.25)' : '1px solid rgba(239, 68, 68, 0.25)',
            color: actionNotice.type === 'success' ? '#22c55e' : '#ef4444',
            fontSize: '0.825rem',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          {actionNotice.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
          <span>{actionNotice.message}</span>
        </div>
      )}

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
          const daysRemaining = getDaysRemaining(acc.expiresAt);
          const isRefreshing = refreshing === acc.id;

          return (
            <div
              key={acc.id}
              style={{
                borderRadius: '12px',
                backgroundColor: 'var(--card, var(--card-bg, #ffffff))',
                border: isConnected
                  ? '1px solid rgba(34, 197, 94, 0.4)'
                  : isExpired
                  ? '1px solid rgba(234, 179, 8, 0.4)'
                  : '1px solid var(--border-glass, var(--border, rgba(0, 0, 0, 0.08)))',
                padding: '18px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                gap: '16px',
                transition: 'all 0.2s ease',
                boxShadow: 'var(--shadow-sm)',
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ fontSize: '1.4rem' }}>{getProviderIcon(acc.id)}</span>
                    <div>
                      <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.95rem' }}>
                        {acc.name}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
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
                        color: 'var(--text-secondary)',
                        backgroundColor: 'var(--secondary, var(--muted, rgba(0, 0, 0, 0.04)))',
                        padding: '4px 8px',
                        borderRadius: '6px',
                      }}
                    >
                      Not Connected
                    </span>
                  )}
                </div>

                {isConnected && (
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '8px', lineHeight: 1.4 }}>
                    {acc.profileName && <div>Profile: <strong style={{ color: 'var(--text-primary)' }}>{acc.profileName}</strong></div>}
                    {acc.profileEmail && <div>Email: {acc.profileEmail}</div>}
                    {daysRemaining !== null && (
                      <div
                        style={{
                          fontSize: '0.75rem',
                          color: daysRemaining <= 3 ? '#eab308' : 'var(--text-secondary)',
                          marginTop: '6px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                        }}
                      >
                        <Clock size={12} />
                        <span>Valid for ~{daysRemaining} more days</span>
                      </div>
                    )}
                  </div>
                )}

                {isExpired && (
                  <div style={{ fontSize: '0.78rem', color: '#eab308', marginTop: '6px', lineHeight: 1.4 }}>
                    Session expired or authentication cookies need renewal. Click Refresh or Reconnect.
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', gap: '8px', marginTop: 'auto' }}>
                {isConnected || isExpired ? (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={isRefreshing}
                      onClick={() => handleRefresh(acc)}
                      style={{ flex: 1, fontSize: '0.8rem' }}
                    >
                      <RefreshCw size={13} className={isRefreshing ? 'animate-spin' : ''} style={{ marginRight: '6px' }} />
                      {isRefreshing ? 'Checking...' : 'Refresh'}
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
                    className="btn-primary"
                    onClick={() => handleOpenConnect(acc)}
                    style={{
                      width: '100%',
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
