'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Briefcase, BarChart2, Settings, FileText, Menu, X, LogIn, LogOut, Shield, HelpCircle, ChevronLeft, ChevronRight } from 'lucide-react';
import { useSession, signIn, signOut } from 'next-auth/react';
import { useHelp } from '@/contexts/HelpContext';

export default function Navigation() {
  const pathname = usePathname();
  const { data: session, status } = useSession();
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const { openHelpPanel } = useHelp();

  useEffect(() => {
    const saved = localStorage.getItem('sidebarMinimized');
    if (saved) setIsMinimized(JSON.parse(saved));
  }, []);

  const toggleMenu = () => setIsOpen(!isOpen);
  const closeMenu = () => setIsOpen(false);
  const toggleMinimize = () => {
    setIsMinimized(!isMinimized);
    localStorage.setItem('sidebarMinimized', JSON.stringify(!isMinimized));
  };

  if (status === 'loading' || !session) {
    return null;
  }

  return (
    <aside className={`sidebar ${isMinimized ? 'minimized' : ''}`}>
      <div className="mobile-nav-header">
        <div className="sidebar-logo">
          <div className="logo-icon" style={{ background: 'transparent', padding: 0 }}>
            <img 
              src="/icon-logo.png" 
              alt="Job Agent Icon" 
              style={{ width: '32px', height: '32px', objectFit: 'contain', display: 'block' }} 
            />
          </div>
          <div className="sidebar-logo-text">
            <img 
              src="/logo.png" 
              alt="Job Agent HQ" 
              style={{ height: '28px', width: 'auto', display: 'block' }} 
            />
          </div>
        </div>
        <div className="header-actions">
          <button 
            onClick={toggleMinimize} 
            className="minimize-btn"
            title={isMinimized ? "Expand Menu" : "Minimize Menu"}
          >
            {isMinimized ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          </button>
          <button className="burger-btn" onClick={toggleMenu} aria-label="Toggle navigation">
            {isOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>
      </div>
      
      <nav className={`nav-menu ${isOpen ? 'open' : ''}`}>
        <li className="nav-item">
          <Link href="/dashboard" className={pathname === '/dashboard' ? 'active' : ''} onClick={closeMenu} title="Dashboard">
            <LayoutDashboard size={20} />
            <span className="nav-text">Dashboard</span>
          </Link>
        </li>
        <li className="nav-item">
          <Link href="/pipeline" className={pathname === '/pipeline' ? 'active' : ''} onClick={closeMenu} title="Pipeline">
            <Briefcase size={20} />
            <span className="nav-text">Pipeline</span>
          </Link>
        </li>
        <li className="nav-item">
          <Link href="/assets" className={pathname === '/assets' ? 'active' : ''} onClick={closeMenu} title="Assets">
            <FileText size={20} />
            <span className="nav-text">Assets</span>
          </Link>
        </li>
        <li className="nav-item">
          <Link href="/analytics" className={pathname === '/analytics' ? 'active' : ''} onClick={closeMenu} title="Analytics">
            <BarChart2 size={20} />
            <span className="nav-text">Analytics</span>
          </Link>
        </li>
        <li className="nav-item">
          <Link href="/settings" className={pathname === '/settings' ? 'active' : ''} onClick={closeMenu} data-tour="settings-menu" title="Settings">
            <Settings size={20} />
            <span className="nav-text">Settings</span>
          </Link>
        </li>
        {(session.user as any)?.role === 'ADMIN' && (
          <li className="nav-item">
            <Link href="/admin" className={pathname === '/admin' ? 'active' : ''} onClick={closeMenu} title="Admin Panel">
              <Shield size={20} />
              <span className="nav-text">Admin Panel</span>
            </Link>
          </li>
        )}
        <li className="nav-item">
          <button 
            onClick={() => { closeMenu(); openHelpPanel(); }} 
            className="help-btn"
            title="Help & Tours"
          >
            <HelpCircle size={20} />
            <span className="nav-text">Help & Tours</span>
          </button>
        </li>
        <li className="nav-item" style={{ marginTop: 'auto', paddingTop: '1rem', borderTop: '1px solid var(--border-glass)' }}>
          {session ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', width: '100%' }} className="user-profile-container">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }} className="user-profile-row">
                <Link href="/profile" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem', textDecoration: 'none', borderRadius: '8px', flex: 1, minWidth: 0 }} title="Profile" className="user-profile-link">
                  {session.user?.image ? (
                    <img src={session.user.image} alt="Avatar" style={{ width: '32px', height: '32px', borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
                  ) : (
                    <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'var(--accent-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', flexShrink: 0 }}>
                      {(session.user?.name || session.user?.email || 'U')[0].toUpperCase()}
                    </div>
                  )}
                  <div className="user-profile-info" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', flex: 1 }}>
                    <span style={{ fontSize: '0.9rem', color: 'var(--text-primary)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {session.user?.name || session.user?.email}
                    </span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                      {(session.user as any)?.planTier === "PRO" ? "Pro Plan" : "Free Plan"}
                    </span>
                  </div>
                </Link>
                {(session.user as any)?.planTier !== "PRO" && (
                  <Link href="/upgrade" className="btn-outline upgrade-btn" style={{ padding: '0.25rem 0.6rem', fontSize: '0.75rem', marginLeft: '0.5rem', textDecoration: 'none' }}>
                    Upgrade
                  </Link>
                )}
              </div>
              <button onClick={() => signOut()} className="logout-btn" title="Logout">
                <LogOut size={16} style={{ flexShrink: 0 }} />
                <span className="nav-text" style={{ fontSize: '0.85rem' }}>Logout</span>
              </button>
            </div>
          ) : (
            <button onClick={() => signIn('google')} className="login-btn" title="Login">
              <LogIn size={20} style={{ flexShrink: 0 }} />
              <span className="nav-text">Login</span>
            </button>
          )}
        </li>
      </nav>
    </aside>
  );
}
