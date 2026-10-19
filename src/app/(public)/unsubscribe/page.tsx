'use client';

import React, { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';

function UnsubscribeContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const alreadySuccess = searchParams.get('success') === 'true';

  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(alreadySuccess);
  const [error, setError] = useState<string | null>(null);

  const handleUnsubscribe = async () => {
    if (!token) {
      setError('No unsubscribe token provided.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/email/unsubscribe?token=${encodeURIComponent(token)}`, {
        method: 'POST',
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to unsubscribe');
      }
      setSuccess(true);
    } catch (err: any) {
      setError(err.message || 'Something went wrong while processing your request.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: 540, margin: '80px auto', padding: '32px 24px', textAlign: 'center' }}>
      <div style={{
        background: 'var(--bg-card, #ffffff)',
        border: '1px solid var(--border-color, #e2e8f0)',
        borderRadius: 16,
        padding: '40px 32px',
        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.05)',
      }}>
        {success ? (
          <>
            <div style={{
              width: 56,
              height: 56,
              borderRadius: '50%',
              background: '#ecfdf5',
              color: '#059669',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 20px auto',
              fontSize: 28,
            }}>
              ✓
            </div>
            <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--text-primary, #0f172a)', marginBottom: 12 }}>
              You have been unsubscribed
            </h1>
            <p style={{ color: 'var(--text-secondary, #64748b)', fontSize: 15, lineHeight: 1.6, marginBottom: 24 }}>
              You will no longer receive every-other-day Job Match email digests. You can always turn them back on in your Settings if you change your mind.
            </p>
            <Link
              href="/settings"
              style={{
                display: 'inline-block',
                padding: '10px 20px',
                borderRadius: 8,
                background: 'var(--accent-primary, #2563eb)',
                color: '#ffffff',
                textDecoration: 'none',
                fontWeight: 600,
                fontSize: 14,
              }}
            >
              Go to Account Settings
            </Link>
          </>
        ) : (
          <>
            <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--text-primary, #0f172a)', marginBottom: 12 }}>
              Unsubscribe from Job Match Emails
            </h1>
            <p style={{ color: 'var(--text-secondary, #64748b)', fontSize: 15, lineHeight: 1.6, marginBottom: 28 }}>
              Click below to stop receiving every-other-day email updates with matched job opportunities.
            </p>

            {error && (
              <div style={{
                background: '#fef2f2',
                border: '1px solid #fecaca',
                color: '#dc2626',
                padding: '12px 16px',
                borderRadius: 8,
                fontSize: 14,
                marginBottom: 20,
              }}>
                {error}
              </div>
            )}

            <button
              onClick={handleUnsubscribe}
              disabled={loading || !token}
              style={{
                padding: '12px 24px',
                borderRadius: 8,
                background: loading ? '#94a3b8' : '#ef4444',
                color: '#ffffff',
                border: 'none',
                fontWeight: 600,
                fontSize: 15,
                cursor: loading || !token ? 'not-allowed' : 'pointer',
                transition: 'background 0.2s ease',
              }}
            >
              {loading ? 'Processing...' : 'Confirm Unsubscribe'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export default function UnsubscribePage() {
  return (
    <Suspense fallback={<div style={{ padding: 60, textAlign: 'center' }}>Loading...</div>}>
      <UnsubscribeContent />
    </Suspense>
  );
}
