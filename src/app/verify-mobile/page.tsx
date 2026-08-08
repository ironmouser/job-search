'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';

function VerifyMobileContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');


  const [cookieConsent, setCookieConsent] = useState<boolean>(true);
  const [loading, setLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [isCollision, setIsCollision] = useState<boolean>(false);

  // Generate lightweight client device fingerprint
  const getDeviceFingerprint = (): string => {
    if (typeof window === 'undefined') return 'unknown';
    const screenInfo = `${window.screen.width}x${window.screen.height}x${window.screen.colorDepth}`;
    const userAgent = navigator.userAgent;
    const lang = navigator.language;
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const raw = `${screenInfo}-${userAgent}-${lang}-${timeZone}`;
    
    // Simple hash function for client fingerprinting
    let hash = 0;
    for (let i = 0; i < raw.length; i++) {
      const char = raw.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash |= 0;
    }
    return `fp_${Math.abs(hash).toString(36)}`;
  };

  const handleVerify = async () => {
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!token) {
      setErrorMsg('Invalid or missing verification session token.');
      return;
    }

    if (!cookieConsent) {
      setErrorMsg('Authentication could not be completed. Device verification requires enabling cookies on your browser.');
      return;
    }

    setLoading(true);

    try {
      const fingerprint = getDeviceFingerprint();

      // Store a verification cookie locally
      document.cookie = `jahq_device_fp=${fingerprint}; path=/; max-age=31536000; SameSite=Lax`;

      const res = await fetch('/api/anti-abuse/verify-mobile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          deviceFingerprint: fingerprint,
          cookieConsent: true,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setErrorMsg(data.message || 'Verification failed. Please try scanning the QR code again.');
      } else {
        setIsCollision(data.isCollision);
        setSuccessMsg(data.message);
      }
    } catch (err: any) {
      console.error('Error during mobile verification:', err);
      setErrorMsg('A network error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 text-white flex flex-col items-center justify-center p-4">
      <div className="max-w-md w-full bg-slate-800 border border-slate-700 rounded-xl p-6 shadow-2xl text-center space-y-6">
        <div className="w-16 h-16 bg-blue-600/20 text-blue-400 rounded-full flex items-center justify-center mx-auto text-2xl font-bold">
          📱
        </div>

        <h1 className="text-xl font-bold text-slate-100">
          Device Verification & Security
        </h1>

        <p className="text-sm text-slate-300">
          To ensure everyone receives appropriate trial access and protect community resources, please complete this quick 1-tap verification.
        </p>

        {successMsg ? (
          <div className={`p-4 rounded-lg text-sm text-left ${isCollision ? 'bg-amber-900/40 border border-amber-500 text-amber-200' : 'bg-emerald-900/40 border border-emerald-500 text-emerald-200'}`}>
            <p className="font-semibold mb-1">
              {isCollision ? 'Primary Account Recognized' : 'Verification Complete!'}
            </p>
            <p>{successMsg}</p>
            <p className="mt-3 text-xs opacity-80">
              You may now return to your desktop browser session. It will update automatically.
            </p>
          </div>
        ) : (
          <div className="space-y-4 text-left">
            {errorMsg && (
              <div className="p-3 bg-red-900/40 border border-red-500/50 rounded text-red-200 text-xs">
                {errorMsg}
              </div>
            )}

            <label className="flex items-start gap-3 text-xs text-slate-300 cursor-pointer bg-slate-900/50 p-3 rounded border border-slate-700">
              <input
                type="checkbox"
                checked={cookieConsent}
                onChange={(e) => setCookieConsent(e.target.checked)}
                className="mt-0.5 rounded border-slate-600 bg-slate-800 text-blue-600 focus:ring-blue-500"
              />
              <span>
                I consent to essential security cookies for device verification and account authentication.
              </span>
            </label>

            <button
              onClick={handleVerify}
              disabled={loading || !cookieConsent}
              className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-lg shadow-lg transition-colors text-sm"
            >
              {loading ? 'Verifying Device...' : 'Confirm Verification'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function VerifyMobilePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-slate-900 text-white flex items-center justify-center p-4 text-sm text-slate-400">
        Loading verification page...
      </div>
    }>
      <VerifyMobileContent />
    </Suspense>
  );
}

