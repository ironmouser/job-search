'use client';

import { useState, useEffect, useRef, useCallback, useSyncExternalStore } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { createPortal } from 'react-dom';
import { ShieldAlert, Clock, LogOut, RefreshCw } from 'lucide-react';

const INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
const WARNING_DURATION_MS = 60 * 1000; // 60 seconds
const STORAGE_KEY = 'jobagent_last_activity_timestamp';
const THROTTLE_INTERVAL_MS = 5 * 1000; // 5 seconds throttle for recording activity

const subscribe = () => () => {};

export default function SessionTimeoutHandler() {
  const { status, update } = useSession();
  const [showWarning, setShowWarning] = useState(false);
  const [secondsRemaining, setSecondsRemaining] = useState(60);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const mounted = useSyncExternalStore(
    subscribe,
    () => true,
    () => false
  );

  const lastRecordedRef = useRef<number>(0);
  const isWarningOpenRef = useRef<boolean>(false);

  // Sync ref with state
  useEffect(() => {
    isWarningOpenRef.current = showWarning;
  }, [showWarning]);

  const handleSignOut = useCallback(async () => {
    if (isLoggingOut) return;
    setIsLoggingOut(true);
    try {
      if (typeof window !== 'undefined') {
        localStorage.removeItem(STORAGE_KEY);
      }
      await signOut({ callbackUrl: '/login?reason=timeout' });
    } catch (e) {
      console.error('Session timeout sign out error:', e);
      if (typeof window !== 'undefined') {
        window.location.href = '/login?reason=timeout';
      }
    }
  }, [isLoggingOut]);

  // Record user activity
  const recordActivity = useCallback(() => {
    if (status !== 'authenticated') return;
    const now = Date.now();

    // If warning modal is open, user activity via button click will explicitly reset
    if (isWarningOpenRef.current) return;

    if (now - (lastRecordedRef.current || 0) > THROTTLE_INTERVAL_MS) {
      lastRecordedRef.current = now;
      try {
        localStorage.setItem(STORAGE_KEY, now.toString());
      } catch {
        // LocalStorage may fail in private browsing / sandboxes
      }
    }
  }, [status]);

  const handleStayLoggedIn = useCallback(async () => {
    const now = Date.now();
    lastRecordedRef.current = now;
    try {
      localStorage.setItem(STORAGE_KEY, now.toString());
    } catch {
      // Ignore localStorage errors
    }
    setShowWarning(false);
    setSecondsRemaining(60);

    // Refresh NextAuth session token
    try {
      await update();
    } catch (e) {
      console.warn('Failed to refresh session on activity heartbeat:', e);
    }
  }, [update]);

  // Main inactivity polling effect
  useEffect(() => {
    if (status !== 'authenticated') return;

    // Initialize timestamp on login/load
    const now = Date.now();
    lastRecordedRef.current = now;
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) {
        localStorage.setItem(STORAGE_KEY, now.toString());
      }
    } catch {}

    const intervalId = setInterval(() => {
      let lastActive = lastRecordedRef.current;
      try {
        const storedStr = localStorage.getItem(STORAGE_KEY);
        if (storedStr) {
          const storedNum = parseInt(storedStr, 10);
          if (!isNaN(storedNum)) {
            lastActive = Math.max(lastActive, storedNum);
            lastRecordedRef.current = lastActive;
          }
        }
      } catch {}

      const currentTime = Date.now();
      const elapsed = currentTime - lastActive;
      const timeLeft = INACTIVITY_TIMEOUT_MS - elapsed;

      if (timeLeft <= 0) {
        clearInterval(intervalId);
        setShowWarning(false);
        handleSignOut();
      } else if (timeLeft <= WARNING_DURATION_MS) {
        setShowWarning(true);
        setSecondsRemaining(Math.max(1, Math.ceil(timeLeft / 1000)));
      } else {
        if (showWarning) {
          setShowWarning(false);
        }
      }
    }, 1000);

    return () => clearInterval(intervalId);
  }, [status, showWarning, handleSignOut]);

  // Cross-tab synchronization via storage event
  useEffect(() => {
    if (status !== 'authenticated') return;

    const handleStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY && e.newValue) {
        const newTimestamp = parseInt(e.newValue, 10);
        if (!isNaN(newTimestamp)) {
          lastRecordedRef.current = newTimestamp;
          const elapsed = Date.now() - newTimestamp;
          if (elapsed < INACTIVITY_TIMEOUT_MS - WARNING_DURATION_MS) {
            setShowWarning(false);
          }
        }
      }
    };

    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, [status]);

  // User input activity listeners
  useEffect(() => {
    if (status !== 'authenticated') return;

    const events = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'wheel', 'click'];
    const handleEvent = () => recordActivity();

    events.forEach(evt => window.addEventListener(evt, handleEvent, { passive: true }));

    return () => {
      events.forEach(evt => window.removeEventListener(evt, handleEvent));
    };
  }, [status, recordActivity]);

  if (!mounted || status !== 'authenticated' || !showWarning) {
    return null;
  }

  const modalContent = (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        padding: '1.25rem',
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="timeout-modal-title"
    >
      <div
        style={{
          width: '100%',
          maxWidth: '460px',
          background: 'var(--bg-card, #131b2e)',
          border: '1px solid var(--border-color, rgba(255, 255, 255, 0.12))',
          borderRadius: '16px',
          padding: '1.75rem',
          boxShadow: '0 20px 40px rgba(0, 0, 0, 0.5)',
          color: 'var(--text-primary, #ffffff)',
          textAlign: 'center',
          animation: 'fadeIn 0.2s ease-out',
        }}
      >
        <div
          style={{
            width: '56px',
            height: '56px',
            borderRadius: '50%',
            background: 'rgba(234, 179, 8, 0.15)',
            border: '1px solid rgba(234, 179, 8, 0.3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 1.25rem',
            color: '#eab308',
          }}
        >
          <ShieldAlert size={28} />
        </div>

        <h3
          id="timeout-modal-title"
          style={{
            fontSize: '1.35rem',
            fontWeight: 700,
            marginBottom: '0.5rem',
            color: 'var(--text-primary, #ffffff)',
          }}
        >
          Are you still there?
        </h3>

        <p
          style={{
            fontSize: '0.925rem',
            color: 'var(--text-secondary, #94a3b8)',
            lineHeight: 1.5,
            marginBottom: '1.5rem',
          }}
        >
          Your session will automatically expire due to 30 minutes of inactivity to protect your account.
        </p>

        {/* Countdown Badge */}
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.5rem',
            background: 'rgba(239, 68, 68, 0.12)',
            border: '1px solid rgba(239, 68, 68, 0.25)',
            padding: '0.6rem 1.2rem',
            borderRadius: '9999px',
            marginBottom: '1.75rem',
            color: '#f87171',
            fontWeight: 600,
            fontSize: '0.95rem',
          }}
        >
          <Clock size={16} />
          <span>
            Logging out in {secondsRemaining} second{secondsRemaining !== 1 ? 's' : ''}
          </span>
        </div>

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '0.75rem',
          }}
        >
          <button
            type="button"
            onClick={handleStayLoggedIn}
            disabled={isLoggingOut}
            style={{
              width: '100%',
              padding: '0.85rem 1.25rem',
              backgroundColor: '#3b82f6',
              color: '#ffffff',
              border: 'none',
              borderRadius: '10px',
              fontSize: '0.95rem',
              fontWeight: 600,
              cursor: isLoggingOut ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem',
              transition: 'background-color 0.15s ease',
            }}
          >
            <RefreshCw size={16} />
            Stay Logged In
          </button>

          <button
            type="button"
            onClick={handleSignOut}
            disabled={isLoggingOut}
            style={{
              width: '100%',
              padding: '0.75rem 1.25rem',
              backgroundColor: 'transparent',
              color: 'var(--text-secondary, #94a3b8)',
              border: '1px solid var(--border-color, rgba(255, 255, 255, 0.15))',
              borderRadius: '10px',
              fontSize: '0.9rem',
              fontWeight: 500,
              cursor: isLoggingOut ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem',
              transition: 'all 0.15s ease',
            }}
          >
            <LogOut size={15} />
            {isLoggingOut ? 'Logging out...' : 'Log Out Now'}
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
