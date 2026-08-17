'use client';

import { useEffect } from 'react';
import { useSession } from 'next-auth/react';

export default function DeviceTracker() {
  const { data: session, status } = useSession();

  useEffect(() => {
    if (status !== 'authenticated' || !session?.user) return;

    try {
      const alreadyTracked = sessionStorage.getItem('jahq_device_tracked');
      if (alreadyTracked) return;

      const payload = {
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
        maxTouchPoints: typeof navigator !== 'undefined' ? navigator.maxTouchPoints || 0 : 0,
        screenWidth: typeof window !== 'undefined' ? window.innerWidth : 0,
        isMobile:
          typeof navigator !== 'undefined'
            ? /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
              ((navigator as any).userAgentData?.mobile ?? false)
            : false,
      };

      fetch('/api/user/device', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
        .then((res) => {
          if (res.ok) {
            sessionStorage.setItem('jahq_device_tracked', 'true');
          }
        })
        .catch((err) => {
          console.debug('Device tracking ping failed silently:', err);
        });
    } catch {
      // Ignore client environment errors
    }
  }, [status, session]);

  return null;
}
