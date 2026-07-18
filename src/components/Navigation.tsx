'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Briefcase, BarChart2, Settings, FileText, Menu, X, LogIn, LogOut, Shield, HelpCircle } from 'lucide-react';
import { useSession, signIn, signOut } from 'next-auth/react';
import { useHelp } from '@/contexts/HelpContext';

export default function Navigation() {
  const pathname = usePathname();
  const { data: session, status } = useSession();
  const [isOpen, setIsOpen] = useState(false);
  const { openHelpPanel } = useHelp();

  const toggleMenu = () => setIsOpen(!isOpen);
  const closeMenu = () => setIsOpen(false);

  if (status === 'loading' || !session) {
    return null;
  }

  return (
    <aside className="sidebar">
      <div className="mobile-nav-header">
        <div>
          <h2 className="page-title" style={{ fontSize: '1.5rem', marginBottom: 0 }}>Job Agent HQ</h2>
          <p className="page-subtitle" style={{ fontSize: '0.85rem', marginBottom: 0 }}>Autonomous Career Search</p>
        </div>
        <button className="burger-btn" onClick={toggleMenu} aria-label="Toggle navigation">
          {isOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>
      
      <nav className={`nav-menu ${isOpen ? 'open' : ''}`}>
        <li className="nav-item">
          <Link href="/dashboard" className={pathname === '/dashboard' ? 'active' : ''} onClick={closeMenu}>
            <LayoutDashboard size={20} />
            Dashboard
          </Link>
        </li>
        <li className="nav-item">
          <Link href="/pipeline" className={pathname === '/pipeline' ? 'active' : ''} onClick={closeMenu}>
            <Briefcase size={20} />
            Pipeline
          </Link>
        </li>
        <li className="nav-item">
          <Link href="/assets" className={pathname === '/assets' ? 'active' : ''} onClick={closeMenu}>
            <FileText size={20} />
            Assets
          </Link>
        </li>
        <li className="nav-item">
          <Link href="/analytics" className={pathname === '/analytics' ? 'active' : ''} onClick={closeMenu}>
            <BarChart2 size={20} />
            Analytics
          </Link>
        </li>
        <li className="nav-item">
          <Link href="/settings" className={pathname === '/settings' ? 'active' : ''} onClick={closeMenu} data-tour="settings-menu">
            <Settings size={20} />
            Settings
          </Link>
        </li>
        {(session.user as any)?.role === 'ADMIN' && (
          <li className="nav-item">
            <Link href="/admin" className={pathname === '/admin' ? 'active' : ''} onClick={closeMenu}>
              <Shield size={20} />
              Admin Panel
            </Link>
          </li>
        )}
        <li className="nav-item">
          <button 
            onClick={() => { closeMenu(); openHelpPanel(); }} 
            style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '1rem', 
              padding: '0.8rem 1rem', 
              color: 'var(--text-secondary)', 
              background: 'transparent',
              border: 'none',
              width: '100%',
              textAlign: 'left',
              cursor: 'pointer',
              fontWeight: 500,
              fontSize: '1rem'
            }}
          >
            <HelpCircle size={20} />
            Help & Tours
          </button>
        </li>
        <li className="nav-item" style={{ marginTop: 'auto', paddingTop: '1rem', borderTop: '1px solid var(--border-glass)' }}>
          {session ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', width: '100%' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                <Link href="/profile" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem', textDecoration: 'none', borderRadius: '8px', flex: 1, minWidth: 0 }}>
                  {session.user?.image ? (
                    <img src={session.user.image} alt="Avatar" style={{ width: '32px', height: '32px', borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
                  ) : null}
                  <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', flex: 1 }}>
                    <span style={{ fontSize: '0.9rem', color: 'var(--text-primary)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {session.user?.name || session.user?.email}
                    </span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                      {(session.user as any)?.planTier === "PRO" ? "Pro Plan" : "Free Plan"}
                    </span>
                  </div>
                </Link>
                {(session.user as any)?.planTier !== "PRO" && (
                  <Link href="/upgrade" className="btn-outline" style={{ padding: '0.25rem 0.6rem', fontSize: '0.75rem', marginLeft: '0.5rem', textDecoration: 'none' }}>
                    Upgrade
                  </Link>
                )}
              </div>
              <button onClick={() => signOut()} style={{ background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', width: '100%', color: 'var(--text-secondary)', padding: '0.5rem', borderRadius: '8px' }}>
                <LogOut size={16} />
                <span style={{ fontSize: '0.85rem' }}>Logout</span>
              </button>
            </div>
          ) : (
            <button onClick={() => signIn('google')} style={{ background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', width: '100%', color: 'inherit', padding: '0.5rem', borderRadius: '8px' }}>
              <LogIn size={20} />
              Login
            </button>
          )}
        </li>
      </nav>
    </aside>
  );
}
