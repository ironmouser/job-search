'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Key,
  ExternalLink,
  HelpCircle,
  ChevronDown,
  ChevronUp,
  FileCode,
  Radio,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PROVIDER_CONFIGS, verifySessionState, SessionVerificationResult } from '@/lib/session-verifier';

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
  const [activeTab, setActiveTab] = useState<'token' | 'json'>('token');
  const [inputValue, setInputValue] = useState('');
  const [profileName, setProfileName] = useState('');
  const [profileEmail, setProfileEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showGuide, setShowGuide] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (isOpen) {
      setInputValue('');
      setError(null);
      setShowGuide(false);
    }
  }, [isOpen, provider?.id]);

  const providerConfig = useMemo(() => {
    if (!provider) return null;
    return PROVIDER_CONFIGS[provider.id.toLowerCase()] || null;
  }, [provider]);

  // Real-time Option C client evaluation
  const localVerification = useMemo<SessionVerificationResult | null>(() => {
    if (!provider || !inputValue.trim()) return null;
    return verifySessionState(inputValue.trim(), provider.id);
  }, [inputValue, provider]);

  if (!isOpen || !provider || !mounted) return null;

  const providerUrls: Record<string, string> = {
    linkedin: 'https://www.linkedin.com/login',
    indeed: 'https://secure.indeed.com/account/login',
    ziprecruiter: 'https://www.ziprecruiter.com/login',
    dice: 'https://www.dice.com/dashboard/login',
  };

  const handleConnect = async () => {
    if (!inputValue.trim()) {
      setError(`Please enter your ${providerConfig?.helpLabel || 'session credentials'}.`);
      return;
    }

    if (localVerification && !localVerification.valid) {
      setError(localVerification.error || 'Invalid session format.');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch('/api/connected-accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: provider.id,
          authToken: activeTab === 'token' ? inputValue.trim() : undefined,
          storageState: activeTab === 'json' ? inputValue.trim() : undefined,
          profileName: profileName.trim() || undefined,
          profileEmail: profileEmail.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Live verification failed. Please check your credentials.');
      }

      onConnected();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Connection failed.');
    } finally {
      setSubmitting(false);
    }
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
        if (e.target === e.currentTarget && !submitting) onClose();
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
            padding: '18px 24px',
            borderBottom: '1px solid var(--border-glass, var(--border, rgba(0, 0, 0, 0.08)))',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '10px',
                backgroundColor: 'var(--accent-glow, rgba(99, 102, 241, 0.1))',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--primary, #6366f1)',
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
            disabled={submitting}
            aria-label="Close"
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
        <div style={{ padding: '22px 24px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
          {/* Security Banner */}
          <div
            style={{
              padding: '12px 16px',
              borderRadius: '10px',
              backgroundColor: 'rgba(34, 197, 94, 0.08)',
              border: '1px solid rgba(34, 197, 94, 0.2)',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '12px',
            }}
          >
            <ShieldCheck size={18} style={{ color: '#22c55e', flexShrink: 0, marginTop: '2px' }} />
            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary, #a1a1aa)', lineHeight: 1.45 }}>
              <strong style={{ color: '#22c55e' }}>Zero Password Storage:</strong> Authentication uses encrypted, temporary session tokens tested live through residential proxies and protected with AES-256-GCM.
            </div>
          </div>

          {/* Navigation Segmented Tabs */}
          <div
            className="app-segmented-tabs"
            role="tablist"
            aria-label="Input Method"
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '6px',
            }}
          >
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'token'}
              onClick={() => {
                setActiveTab('token');
                setError(null);
              }}
              className={`app-tab-btn ${activeTab === 'token' ? 'active' : ''}`}
              style={{
                padding: '0.65rem 1rem',
                fontSize: '0.875rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
              }}
            >
              <Key size={15} />
              <span>Single Cookie Token</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'json'}
              onClick={() => {
                setActiveTab('json');
                setError(null);
              }}
              className={`app-tab-btn ${activeTab === 'json' ? 'active' : ''}`}
              style={{
                padding: '0.65rem 1rem',
                fontSize: '0.875rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
              }}
            >
              <FileCode size={15} />
              <span>Session State (JSON)</span>
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <label style={{ fontSize: '0.825rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                {activeTab === 'token'
                  ? `Paste ${providerConfig?.helpLabel || 'Session Cookie'}`
                  : 'Paste Cookie JSON / Playwright StorageState'}
              </label>
              <button
                type="button"
                onClick={() => setShowGuide(!showGuide)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--primary, #6366f1)',
                  fontSize: '0.75rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  fontWeight: 500,
                }}
              >
                <HelpCircle size={13} />
                <span>{showGuide ? 'Hide Guide' : 'How to find this? (10s)'}</span>
                {showGuide ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
              </button>
            </div>

            {/* Expandable 4-Step Instructions */}
            {showGuide && providerConfig && (
              <div
                style={{
                  padding: '12px 16px',
                  borderRadius: '8px',
                  backgroundColor: 'var(--secondary, var(--muted, rgba(0, 0, 0, 0.04)))',
                  border: '1px solid var(--border-glass, var(--border, rgba(0, 0, 0, 0.08)))',
                  fontSize: '0.78rem',
                  color: 'var(--text-secondary)',
                  lineHeight: 1.5,
                }}
              >
                <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px' }}>
                  Quick 4-Step Instructions:
                </div>
                <ol style={{ margin: 0, paddingLeft: '18px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {providerConfig.guideSteps.map((step, idx) => (
                    <li key={idx}>{step}</li>
                  ))}
                </ol>
                <div style={{ marginTop: '8px' }}>
                  <a
                    href={providerUrls[provider.id] || '#'}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      color: 'var(--primary, #6366f1)',
                      textDecoration: 'none',
                      fontWeight: 500,
                    }}
                  >
                    <span>Open {provider.name} in browser</span>
                    <ExternalLink size={12} />
                  </a>
                </div>
              </div>
            )}

            {/* Input textarea */}
            <div style={{ position: 'relative' }}>
              <textarea
                rows={activeTab === 'token' ? 3 : 5}
                value={inputValue}
                onChange={(e) => {
                  setInputValue(e.target.value);
                  setError(null);
                }}
                placeholder={
                  activeTab === 'token'
                    ? providerConfig?.placeholder || 'Paste cookie value here...'
                    : '[ { "name": "li_at", "value": "...", "domain": ".linkedin.com" } ]'
                }
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: '8px',
                  backgroundColor: 'var(--input, var(--background))',
                  border: localVerification
                    ? localVerification.valid
                      ? '1px solid #22c55e'
                      : '1px solid #ef4444'
                    : '1px solid var(--border-glass, var(--border, rgba(0, 0, 0, 0.1)))',
                  color: 'var(--text-primary)',
                  fontSize: '0.8rem',
                  fontFamily: 'monospace',
                }}
              />
            </div>

            {/* Option C preview */}
            {localVerification && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  fontSize: '0.78rem',
                  padding: '6px 10px',
                  borderRadius: '6px',
                  backgroundColor: localVerification.valid ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                  color: localVerification.valid ? '#22c55e' : '#ef4444',
                }}
              >
                {localVerification.valid ? (
                  <>
                    <CheckCircle2 size={14} />
                    <span>
                      Valid token format detected • Valid for ~{localVerification.daysRemaining} days
                    </span>
                  </>
                ) : (
                  <>
                    <AlertCircle size={14} />
                    <span>{localVerification.error}</span>
                  </>
                )}
              </div>
            )}

            {/* Optional profile overrides */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
                  Profile Name (Auto-detected if empty)
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
              onClick={handleConnect}
              disabled={submitting || !inputValue.trim()}
              className="btn-primary"
              style={{
                width: '100%',
                marginTop: '4px',
                padding: '10px',
                fontWeight: 600,
                fontSize: '0.9rem',
              }}
            >
              {submitting ? <Loader2 size={16} className="animate-spin" /> : <Radio size={16} />}
              <span>
                {submitting
                  ? `Testing ${provider.name} via Residential Proxy...`
                  : `Verify & Connect ${provider.name}`}
              </span>
            </Button>
          </div>

          {/* Global Error Banner */}
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
              <AlertCircle size={16} style={{ flexShrink: 0 }} />
              <span>{error}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
