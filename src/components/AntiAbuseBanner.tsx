'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useSession } from 'next-auth/react';

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

  // Generate QR session token
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

  // Poll for QR status on desktop when modal is open
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
      <div className="bg-amber-900/30 border border-amber-500/40 rounded-xl p-4 mb-6 text-amber-200 text-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-sm">
        <div className="flex items-start gap-3">
          <span className="text-xl">⚠️</span>
          <div>
            <p className="font-semibold text-amber-100">Account Verification Notice</p>
            <p className="text-amber-200/90 text-xs mt-0.5">
              We noticed an existing account that may be associated with this profile. To make sure everyone receives appropriate trial access, let's make sure we have the correct account.
            </p>
          </div>
        </div>

        <button
          onClick={handleOpenModal}
          disabled={loadingToken}
          className="whitespace-nowrap px-4 py-2 bg-amber-600 hover:bg-amber-500 text-slate-950 font-bold text-xs rounded-lg shadow transition-colors"
        >
          {loadingToken ? 'Generating QR...' : 'Verify Account via Mobile'}
        </button>
      </div>

      {isOpen && typeof document !== 'undefined' &&
        createPortal(
          <div
            style={{
              position: 'fixed',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: 'rgba(0, 0, 0, 0.75)',
              zIndex: 9999,
            }}
          >
            <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 max-w-sm w-full mx-4 shadow-2xl text-center space-y-5 text-white relative">
              <button
                onClick={() => setIsOpen(false)}
                className="absolute top-3 right-3 text-slate-400 hover:text-white text-lg font-bold p-1"
              >
                ✕
              </button>

              <h3 className="text-lg font-bold text-slate-100">
                Mobile Verification Scan
              </h3>

              <p className="text-xs text-slate-300">
                Scan this QR code with your smartphone camera to confirm your mobile device and verify your trial status.
              </p>

              {verifyUrl && (
                <div className="bg-white p-4 rounded-xl inline-block shadow-inner mx-auto">
                  <img
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(verifyUrl)}`}
                    alt="Mobile Verification QR Code"
                    className="w-44 h-44 mx-auto"
                  />
                </div>
              )}

              {toastMsg ? (
                <div className="p-3 bg-emerald-900/50 border border-emerald-500 text-emerald-200 text-xs rounded-lg font-medium">
                  {toastMsg}
                </div>
              ) : (
                <div className="flex items-center justify-center gap-2 text-xs text-blue-400">
                  <span className="animate-spin text-sm">⏳</span>
                  <span>Waiting for mobile scan...</span>
                </div>
              )}
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
