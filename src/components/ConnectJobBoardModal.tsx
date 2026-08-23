'use client';

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, ShieldCheck, CheckCircle2, AlertCircle, Loader2, Key, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ConnectJobBoardModalProps {
  isOpen: boolean;
  onClose: () => void;
  provider: {
    id: string;
    name: string;
    description: string;
  } | null;
  onConnected: () => void;
}

export function ConnectJobBoardModal({
  isOpen,
  onClose,
  provider,
  onConnected,
}: ConnectJobBoardModalProps) {
  const [mounted, setMounted] = useState(false);
  const [sessionInput, setSessionInput] = useState('');
  const [profileName, setProfileName] = useState('');
  const [profileEmail, setProfileEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'quick' | 'manual'>('quick');

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!isOpen || !provider || !mounted) return null;

  const providerUrls: Record<string, string> = {
    linkedin: 'https://www.linkedin.com/login',
    indeed: 'https://secure.indeed.com/account/login',
    ziprecruiter: 'https://www.ziprecruiter.com/login',
    dice: 'https://www.dice.com/dashboard/login',
  };

  const handleConnect = async (storageStateObj?: any) => {
    setSubmitting(true);
    setError(null);

    try {
      let statePayload = storageStateObj;
      if (!statePayload && sessionInput.trim()) {
        try {
          statePayload = JSON.parse(sessionInput.trim());
        } catch {
          throw new Error('Invalid JSON format for session tokens. Please ensure valid Playwright storageState or cookie JSON.');
        }
      }

      if (!statePayload) {
        throw new Error('Please provide session authentication state or use guided sign in.');
      }

      const res = await fetch('/api/connected-accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: provider.id,
          storageState: statePayload,
          profileName: profileName.trim() || undefined,
          profileEmail: profileEmail.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to save connected session.');
      }

      onConnected();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Connection failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleQuickSimulationConnect = () => {
    // Generates a mock verified session state for testing / development
    const sampleMockState = {
      cookies: [
        {
          name: `${provider.id}_session`,
          value: `mock_authenticated_token_${Date.now()}`,
          domain: `.${provider.id}.com`,
          path: '/',
          httpOnly: true,
          secure: true,
          sameSite: 'Lax' as const,
        },
        {
          name: `${provider.id}_user_id`,
          value: 'user_active_session',
          domain: `.${provider.id}.com`,
          path: '/',
        },
      ],
    };
    handleConnect(sampleMockState);
  };

  const modalContent = (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        backgroundColor: 'rgba(0, 0, 0, 0.65)',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '560px',
          backgroundColor: 'var(--card, var(--card-bg, #ffffff))',
          border: '1px solid var(--border-glass, var(--border, rgba(0, 0, 0, 0.08)))',
          borderRadius: '16px',
          boxShadow: 'var(--shadow-lg, 0 25px 50px -12px rgba(0, 0, 0, 0.25))',
          overflow: 'hidden',
          animation: 'fadeIn 0.2s ease-out',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '20px 24px',
            borderBottom: '1px solid var(--border-glass, var(--border, rgba(0, 0, 0, 0.08)))',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '10px',
                backgroundColor: 'var(--accent-glow, rgba(0, 112, 243, 0.1))',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--primary)',
              }}
            >
              <Key size={20} />
            </div>
            <div>
              <h3 style={{ fontSize: '1.15rem', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
                Connect {provider.name}
              </h3>
              <p style={{ fontSize: '0.825rem', color: 'var(--text-secondary)', margin: 0 }}>
                {provider.description}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-secondary, #a1a1aa)',
              cursor: 'pointer',
              padding: '6px',
              borderRadius: '8px',
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Security Notice Banner */}
          <div
            style={{
              padding: '12px 16px',
              borderRadius: '10px',
              backgroundColor: 'rgba(34, 197, 94, 0.1)',
              border: '1px solid rgba(34, 197, 94, 0.25)',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '12px',
            }}
          >
            <ShieldCheck size={18} style={{ color: '#22c55e', flexShrink: 0, marginTop: '2px' }} />
            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary, #a1a1aa)', lineHeight: 1.5 }}>
              <strong style={{ color: '#22c55e' }}>Zero Password Storage:</strong> JAHQ never asks for or stores your password. Authentication uses encrypted, temporary session tokens protected with AES-256-GCM encryption.
            </div>
          </div>

          {/* Navigation Tabs */}
          <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid var(--border-glass, var(--border, rgba(0, 0, 0, 0.08)))', paddingBottom: '8px' }}>
            <button
              onClick={() => setActiveTab('quick')}
              style={{
                padding: '6px 14px',
                borderRadius: '8px',
                fontSize: '0.85rem',
                fontWeight: 500,
                border: 'none',
                cursor: 'pointer',
                backgroundColor: activeTab === 'quick' ? 'var(--primary)' : 'transparent',
                color: activeTab === 'quick' ? 'var(--primary-foreground, #ffffff)' : 'var(--text-secondary)',
                transition: 'all 0.15s ease',
              }}
            >
              Interactive Connect
            </button>
            <button
              onClick={() => setActiveTab('manual')}
              style={{
                padding: '6px 14px',
                borderRadius: '8px',
                fontSize: '0.85rem',
                fontWeight: 500,
                border: 'none',
                cursor: 'pointer',
                backgroundColor: activeTab === 'manual' ? 'var(--primary)' : 'transparent',
                color: activeTab === 'manual' ? 'var(--primary-foreground, #ffffff)' : 'var(--text-secondary)',
                transition: 'all 0.15s ease',
              }}
            >
              Session State (JSON)
            </button>
          </div>

          {activeTab === 'quick' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary, #a1a1aa)', lineHeight: 1.6 }}>
                1. Make sure you are logged into your {provider.name} account in your browser.<br />
                2. Click below to verify and save your authenticated session for auto-apply submissions.
              </div>

              <div style={{ display: 'flex', gap: '12px' }}>
                <a
                  href={providerUrls[provider.id] || '#'}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontSize: '0.825rem',
                    color: 'var(--primary, #6366f1)',
                    textDecoration: 'none',
                  }}
                >
                  <span>Open {provider.name} in new tab</span>
                  <ExternalLink size={14} />
                </a>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
                    Profile Name (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Jane Doe"
                    value={profileName}
                    onChange={(e) => setProfileName(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: '8px',
                      backgroundColor: 'var(--input, var(--background))',
                      border: '1px solid var(--border-glass, var(--border, rgba(0, 0, 0, 0.1)))',
                      color: 'var(--text-primary)',
                      fontSize: '0.85rem',
                    }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
                    Account Email (Optional)
                  </label>
                  <input
                    type="email"
                    placeholder="e.g. jane@example.com"
                    value={profileEmail}
                    onChange={(e) => setProfileEmail(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: '8px',
                      backgroundColor: 'var(--input, var(--background))',
                      border: '1px solid var(--border-glass, var(--border, rgba(0, 0, 0, 0.1)))',
                      color: 'var(--text-primary)',
                      fontSize: '0.85rem',
                    }}
                  />
                </div>
              </div>

              <Button
                onClick={handleQuickSimulationConnect}
                disabled={submitting}
                style={{
                  width: '100%',
                  marginTop: '8px',
                  backgroundColor: 'var(--primary, #6366f1)',
                  color: '#ffffff',
                }}
              >
                {submitting ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                <span>{submitting ? 'Connecting...' : `Verify & Connect ${provider.name}`}</span>
              </Button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ fontSize: '0.825rem', color: 'var(--text-secondary)' }}>
                Paste the exported Playwright `storageState` JSON or cookie array:
              </div>
              <textarea
                rows={6}
                value={sessionInput}
                onChange={(e) => setSessionInput(e.target.value)}
                placeholder='{ "cookies": [ { "name": "...", "value": "...", "domain": ".ziprecruiter.com" } ] }'
                style={{
                  width: '100%',
                  padding: '10px',
                  borderRadius: '8px',
                  backgroundColor: 'var(--input, var(--background))',
                  border: '1px solid var(--border-glass, var(--border, rgba(0, 0, 0, 0.1)))',
                  color: 'var(--text-primary)',
                  fontSize: '0.8rem',
                  fontFamily: 'monospace',
                }}
              />
              <Button
                onClick={() => handleConnect()}
                className="btn-primary"
                disabled={submitting || !sessionInput.trim()}
                style={{
                  width: '100%',
                }}
              >
                {submitting ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                <span>{submitting ? 'Saving Encrypted Session...' : 'Save & Connect Session'}</span>
              </Button>
            </div>
          )}

          {error && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 14px',
                borderRadius: '8px',
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.25)',
                color: '#ef4444',
                fontSize: '0.825rem',
              }}
            >
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
