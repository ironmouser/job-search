'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { UserPlus, Clock, Loader2, ShieldCheck } from 'lucide-react';
import { useSession } from 'next-auth/react';
import RecruiterDock from '@/components/recruiter/RecruiterDock';

export default function RecruiterLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session, status } = useSession();
  const [profile, setProfile] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (status === 'loading') return;
    if (!session) {
      router.push('/login');
      return;
    }

    const checkProfile = async () => {
      try {
        const res = await fetch('/api/recruiter/profile');
        if (res.ok) {
          const data = await res.json();
          setProfile(data.hasProfile ? data.profile : null);
        }
      } catch (err) {
        console.error('Failed to check recruiter profile:', err);
      } finally {
        setLoading(false);
      }
    };

    checkProfile();
  }, [session, status, router]);

  if (loading || status === 'loading') {
    return (
      <div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}>
        <Loader2 size={32} className="animate-spin" />
      </div>
    );
  }

  // If on the register page, render directly with dock space
  if (pathname === '/recruiter/register') {
    return (
      <div style={{ minHeight: '100vh', padding: '1.5rem 0 5.5rem 0' }}>
        {children}
        <RecruiterDock />
      </div>
    );
  }

  // If user has no recruiter profile, prompt them to register
  if (!profile) {
    return (
      <div style={{ minHeight: '100vh', padding: '1.5rem 0 5.5rem 0' }}>
        <div
          className="glass-card"
          style={{
            maxWidth: '640px',
            margin: '4rem auto',
            padding: '3rem 2rem',
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '1.25rem',
          }}
        >
          <div
            style={{
              width: '64px',
              height: '64px',
              borderRadius: '16px',
              backgroundColor: 'rgba(54, 149, 227, 0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#3695e3',
            }}
          >
            <UserPlus size={32} />
          </div>
          <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary)' }}>
            Join the Jahq Recruiter Network
          </h2>
          <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.925rem', lineHeight: 1.6, maxWidth: '480px' }}>
            Discover qualified candidates who have explicitly opted into discovery. Post your job openings, evaluate AI-scored matches, and request direct candidate introductions.
          </p>
          <Link
            href="/recruiter/register"
            style={{
              marginTop: '0.5rem',
              padding: '0.75rem 1.75rem',
              backgroundColor: '#3695e3',
              color: '#ffffff',
              borderRadius: '8px',
              textDecoration: 'none',
              fontWeight: 600,
              fontSize: '0.95rem',
              boxShadow: '0 4px 6px -1px rgba(54, 149, 227, 0.3)',
            }}
          >
            Register Recruiter Profile
          </Link>
        </div>
        <RecruiterDock />
      </div>
    );
  }

  // If recruiter profile or org is pending verification
  const isPending = profile.verificationStatus === 'PENDING' || profile.organization?.verificationStatus === 'PENDING';

  return (
    <div style={{ minHeight: '100vh', padding: '1.5rem 0 5.5rem 0' }}>
      {/* Pending verification notice banner if applicable */}
      {isPending && (
        <div
          className="glass-card"
          style={{
            padding: '1rem 1.25rem',
            marginBottom: '1.5rem',
            backgroundColor: 'rgba(234, 179, 8, 0.08)',
            borderColor: 'rgba(234, 179, 8, 0.25)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            color: '#fde047',
            fontSize: '0.875rem',
          }}
        >
          <Clock size={20} style={{ flexShrink: 0, color: '#f59e0b' }} />
          <div>
            <strong style={{ color: '#fcd34d' }}>Account Verification Pending:</strong> Your organization and recruiter profile are under review by our administration team. You can explore the portal, create draft job openings, and preview candidate discovery. Full introduction requests will be unlocked upon verification.
          </div>
        </div>
      )}

      {/* Main Page Content */}
      <main>{children}</main>
      <RecruiterDock />
    </div>
  );
}
