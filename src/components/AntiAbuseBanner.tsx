'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { AlertTriangle, Smartphone, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';

export function AntiAbuseBanner() {
  const { data: session, update } = useSession();
  const user = session?.user as any;

  const [isOpen, setIsOpen] = useState(false);
  const [qrToken, setQrToken] = useState<string | null>(null);
  const [verifyUrl, setVerifyUrl] = useState<string | null>(null);
  const [loadingToken, setLoadingToken] = useState(false);
  const [status, setStatus] = useState<string>('pending');
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const isDeferred = user?.isTrialDeferred && !user?.trialEndsAt && user?.planTier === 'FREE';

  const handleOpenModal = async () => {
    setLoadingToken(true);
    try {
      const res = await fetch('/api/anti-abuse/qr-session', { method: 'POST' });
      const data = await res.json();
      if (res.ok && data.token) {
        setQrToken(data.token);
        setVerifyUrl(data.verifyUrl);
        setStatus('pending');
        setIsOpen(true);
      }
    } catch (e) {
      console.error('Failed to generate QR token:', e);
    } finally {
      setLoadingToken(false);
    }
  };

  useEffect(() => {
    if (!isOpen || !qrToken || status === 'verified' || status === 'expired') return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/anti-abuse/qr-session/${qrToken}/status`);
        const data = await res.json();
        if (res.ok && data.status) {
          setStatus(data.status);

          if (data.status === 'verified') {
            clearInterval(interval);
            await update();
            if (data.isTrialDeferred) {
              setToastMsg('Account verified. Standard Free tier remains active.');
            } else {
              setToastMsg('Success! Your 7-Day Pro Trial has been unlocked!');
            }
            setTimeout(() => {
              setIsOpen(false);
              window.location.reload();
            }, 2500);
          }
        }
      } catch (e) {
        console.error('Error polling QR status:', e);
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [isOpen, qrToken, status, update]);

  if (!isDeferred) return null;

  return (
    <>
      <div
        role="region"
        aria-label="Account verification notice"
        style={{
          background: 'rgba(245, 158, 11, 0.1)',
          border: '1px solid rgba(245, 158, 11, 0.3)',
          borderRadius: 'var(--radius-lg, 10px)',
          padding: '1rem 1.25rem',
          marginBottom: 0,
          width: '100%',
          boxSizing: 'border-box',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '1rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', flex: '1 1 280px' }}>
          <AlertTriangle size={20} style={{ color: '#f59e0b', flexShrink: 0, marginTop: '2px' }} aria-hidden="true" />
          <div>
            <p style={{ fontWeight: 600, fontSize: '0.9375rem', color: 'var(--foreground)', margin: 0 }}>
              Verify Your Account to Unlock Trial Access
            </p>
            <p style={{ fontSize: '0.875rem', color: 'var(--muted-foreground)', margin: '0.25rem 0 0 0', lineHeight: 1.5 }}>
              Confirm your account with a quick mobile scan to activate your Pro trial benefits.
            </p>
          </div>
        </div>

        <Button
          variant="primary"
          size="default"
          onClick={handleOpenModal}
          disabled={loadingToken}
        >
          <Smartphone size={16} aria-hidden="true" />
          {loadingToken ? 'Generating QR...' : 'Verify via Mobile'}
        </Button>
      </div>

      <Modal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        title="Mobile Verification Scan"
        description="Scan this QR code with your smartphone camera to confirm your device."
        maxWidth="420px"
      >
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.25rem', textAlign: 'center' }}>
          {verifyUrl && (
            <div
              style={{
                background: '#ffffff',
                padding: '1rem',
                borderRadius: '12px',
                border: '1px solid var(--border)',
                display: 'inline-block',
              }}
            >
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(verifyUrl)}`}
                alt="Mobile Verification QR Code"
                width={180}
                height={180}
                style={{ display: 'block' }}
              />
            </div>
          )}

          {toastMsg ? (
            <div
              role="status"
              style={{
                padding: '0.75rem 1rem',
                background: 'rgba(16, 185, 129, 0.12)',
                border: '1px solid rgba(16, 185, 129, 0.3)',
                color: '#10b981',
                fontSize: '0.875rem',
                borderRadius: '8px',
                fontWeight: 500,
                width: '100%',
              }}
            >
              {toastMsg}
            </div>
          ) : (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem',
                fontSize: '0.875rem',
                color: 'var(--primary)',
                fontWeight: 500,
              }}
            >
              <Loader2 size={16} className="animate-spin" aria-hidden="true" />
              <span>Waiting for mobile scan...</span>
            </div>
          )}
        </div>
      </Modal>
    </>
  );
}
