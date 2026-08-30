'use client';

import { SessionProvider } from 'next-auth/react';
import { ReactNode } from 'react';
import SessionTimeoutHandler from '@/components/SessionTimeoutHandler';

export default function AuthProvider({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <SessionTimeoutHandler />
      {children}
    </SessionProvider>
  );
}
