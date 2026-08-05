'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Briefcase, BarChart2, Settings, FileText, Menu, X, LogIn, LogOut, Shield, HelpCircle, ChevronLeft, ChevronRight, MessageSquareHeart, Users, Mail, Cpu, Activity, Zap } from 'lucide-react';
import { useSession, signIn, signOut } from 'next-auth/react';
import { useHelp } from '@/contexts/HelpContext';
import { getAssetUrl } from '@/lib/assets';
import FeedbackModal from '@/components/FeedbackModal';

import { UserAvatar } from '@/components/common/UserAvatar';

export default function Navigation() {
  const pathname = usePathname();
  const { data: session, status } = useSession();
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [isFeedbackOpen, setIsFeedbackOpen] = useState(false);
  const { openHelpPanel } = useHelp();

  useEffect(() => {
    const saved = localStorage.getItem('sidebarMinimized');
    if (saved) setIsMinimized(JSON.parse(saved));

    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        setIsMinimized(prev => {
          const next = !prev;
          localStorage.setItem('sidebarMinimized', JSON.stringify(next));
          return next;
        });
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
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

  const userRole = (session.user as any)?.role;
  const isOrgAdminOnly = userRole === 'ORGANIZATION_ADMIN';
  const planTier = (session.user as any)?.planTier;
  const trialEndsAt = (session.user as any)?.trialEndsAt as Date | null;
  const isInTrial = !!(trialEndsAt && new Date(trialEndsAt) > new Date());
  const isPro = planTier === 'PRO' || isInTrial;
  const trialDaysLeft = isInTrial
    ? Math.ceil((new Date(trialEndsAt!).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : 0;


  return (
    <>
      <aside className={`sidebar ${isMinimized ? 'minimized' : ''}`}>
        {/* Header */}
        <div className="mobile-nav-header">
          <Link
            href={isOrgAdminOnly ? "/org-admin" : "/dashboard"}
            className="sidebar-logo"
            style={{ textDecoration: 'none' }}
            onClick={closeMenu}
          >
            <div className="logo-icon">
              <img
                src={getAssetUrl('/icon-logo.png')}
                alt="Job Agent Icon"
                style={{ width: '28px', height: '28px', objectFit: 'contain', display: 'block' }}
              />
            </div>
            <div className="sidebar-logo-text">
              <img
                src={getAssetUrl('/logo.png')}
                alt="Job Agent HQ"
                style={{ height: '22px', width: 'auto', display: 'block' }}
              />
            </div>
          </Link>
          <div className="header-actions">
            <button
              onClick={toggleMinimize}
              className="minimize-btn"
              title={isMinimized ? "Expand sidebar (⌘B)" : "Collapse sidebar (⌘B)"}
            >
              {isMinimized ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
            </button>
            <button className="burger-btn" onClick={toggleMenu} aria-label="Toggle navigation">
              {isOpen ? <X size={22} /> : <Menu size={22} />}
            </button>
          </div>
        </div>

        {/* Nav Links */}
        <nav className={`nav-menu ${isOpen ? 'open' : ''}`}>
          {isOrgAdminOnly ? (
            <>
              <li className="nav-item">
                <Link href="/org-admin" className={pathname === '/org-admin' ? 'active' : ''} onClick={closeMenu} title="Dashboard">
                  <LayoutDashboard size={16} />
                  <span className="nav-text">Dashboard</span>
                </Link>
              </li>
              <li className="nav-item">
                <Link href="/org-admin/members" className={pathname === '/org-admin/members' ? 'active' : ''} onClick={closeMenu} title="Members">
                  <Users size={16} />
                  <span className="nav-text">Members</span>
                </Link>
              </li>
              <li className="nav-item">
                <Link href="/org-admin/invitations" className={pathname === '/org-admin/invitations' ? 'active' : ''} onClick={closeMenu} title="Invitations">
                  <Mail size={16} />
                  <span className="nav-text">Invitations</span>
                </Link>
              </li>
              <li className="nav-item">
                <Link href="/org-admin/seats" className={pathname === '/org-admin/seats' ? 'active' : ''} onClick={closeMenu} title="Pass Management">
                  <Cpu size={16} />
                  <span className="nav-text">Pass Management</span>
                </Link>
              </li>
              <li className="nav-item">
                <Link href="/org-admin/settings" className={pathname === '/org-admin/settings' ? 'active' : ''} onClick={closeMenu} title="Org Settings">
                  <Settings size={16} />
                  <span className="nav-text">Org Settings</span>
                </Link>
              </li>
              <li className="nav-item">
                <Link href="/org-admin/activity" className={pathname === '/org-admin/activity' ? 'active' : ''} onClick={closeMenu} title="Activity Log">
                  <Activity size={16} />
                  <span className="nav-text">Activity Log</span>
                </Link>
              </li>
            </>
          ) : (
            <>
              <li className="nav-item">
                <Link href="/dashboard" className={pathname === '/dashboard' ? 'active' : ''} onClick={closeMenu} title="Dashboard">
                  <LayoutDashboard size={16} />
                  <span className="nav-text">Dashboard</span>
                </Link>
              </li>
              <li className="nav-item">
                <Link href="/pipeline" className={pathname === '/pipeline' ? 'active' : ''} onClick={closeMenu} title="Pipeline">
                  <Briefcase size={16} />
                  <span className="nav-text">Pipeline</span>
                </Link>
              </li>
              <li className="nav-item">
                <Link href="/profile" className={pathname === '/profile' ? 'active' : ''} onClick={closeMenu} title="My Profile">
                  <FileText size={16} />
                  <span className="nav-text">My Profile</span>
                </Link>
              </li>
              <li className="nav-item">
                <Link href="/analytics" className={pathname === '/analytics' ? 'active' : ''} onClick={closeMenu} title="Analytics">
                  <BarChart2 size={16} />
                  <span className="nav-text">Analytics</span>
                </Link>
              </li>
              <li className="nav-item">
                <Link href="/settings" className={pathname === '/settings' ? 'active' : ''} onClick={closeMenu} data-tour="settings-menu" title="Settings">
                  <Settings size={16} />
                  <span className="nav-text">Settings</span>
                </Link>
              </li>
              {userRole === 'SYSTEM_ADMIN' && (
                <>
                  <li className="nav-item">
                    <Link href="/admin" className={pathname === '/admin' ? 'active' : ''} onClick={closeMenu} title="Admin Panel">
                      <Shield size={16} />
                      <span className="nav-text">Admin Panel</span>
                    </Link>
                  </li>
                  <li className="nav-item">
                    <Link href="/org-admin" className={pathname.startsWith('/org-admin') ? 'active' : ''} onClick={closeMenu} title="Org Admin">
                      <Shield size={16} />
                      <span className="nav-text">Org Admin</span>
                    </Link>
                  </li>
                </>
              )}
              <li className="nav-item">
                <button
                  onClick={() => { closeMenu(); openHelpPanel(); }}
                  className="help-btn"
                  title="Help & Tours"
                >
                  <HelpCircle size={16} />
                  <span className="nav-text">Help & Tours</span>
                </button>
              </li>
            </>
          )}

          <li className="nav-item">
            <button
              onClick={() => { closeMenu(); setIsFeedbackOpen(true); }}
              className="feedback-btn"
              title="Feedback"
            >
              <MessageSquareHeart size={16} />
              <span className="nav-text">Feedback</span>
            </button>
          </li>

          {/* User section at bottom */}
          <li className="nav-item" style={{ marginTop: 'auto', paddingTop: '0.75rem', borderTop: '1px solid var(--sidebar-border)' }}>
            {session ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', width: '100%' }} className="user-profile-container">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', minWidth: 0, overflow: 'hidden' }} className="user-profile-row">
                  <Link
                    href="/profile"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      padding: '0.375rem 0.5rem',
                      textDecoration: 'none',
                      borderRadius: 'var(--radius)',
                      flex: 1,
                      minWidth: 0,
                      transition: 'background 0.15s ease',
                    }}
                    title="Your Profile"
                    className="user-profile-link"
                  >
                    <UserAvatar
                      src={session.user?.image}
                      name={session.user?.name}
                      email={session.user?.email}
                      size={28}
                    />
                    {!isMinimized && (
                      <div className="user-profile-info" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', flex: 1, gap: '0.0625rem' }}>
                        <span style={{ fontSize: '0.8125rem', color: 'var(--foreground)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', letterSpacing: '-0.01em' }}>
                          {session.user?.name || session.user?.email}
                        </span>
                        <span style={{
                          fontSize: '0.6875rem',
                          color: isPro ? '#60a5fa' : 'var(--muted-foreground)',
                          fontWeight: isPro ? 600 : 400,
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.2rem',
                        }}>
                          {isPro && <Zap size={10} />}
                          {planTier === 'PRO' ? 'Pro' : isInTrial ? 'Pro Trial' : 'Free'}
                        </span>
                      </div>
                    )}
                  </Link>
                  {!isMinimized && isInTrial && (
                    <Link
                      href="/upgrade"
                      style={{
                        padding: '0.2rem 0.5rem',
                        fontSize: '0.6875rem',
                        fontWeight: 600,
                        color: '#a855f7',
                        background: 'rgba(168, 85, 247, 0.1)',
                        border: '1px solid rgba(168, 85, 247, 0.25)',
                        borderRadius: 'var(--radius)',
                        textDecoration: 'none',
                        whiteSpace: 'nowrap',
                        flexShrink: 0,
                        width: 'fit-content',
                        transition: 'background 0.15s ease',
                        marginLeft: '0.375rem',
                      }}
                      className="upgrade-btn"
                    >
                      {trialDaysLeft}d left
                    </Link>
                  )}
                  {!isMinimized && !isPro && !isInTrial && (
                    <Link
                      href="/upgrade"
                      style={{
                        padding: '0.2rem 0.5rem',
                        fontSize: '0.6875rem',
                        fontWeight: 600,
                        color: 'var(--primary)',
                        background: 'rgba(0, 112, 243, 0.1)',
                        border: '1px solid rgba(0, 112, 243, 0.2)',
                        borderRadius: 'var(--radius)',
                        textDecoration: 'none',
                        whiteSpace: 'nowrap',
                        flexShrink: 0,
                        width: 'fit-content',
                        transition: 'background 0.15s ease',
                        marginLeft: '0.375rem',
                      }}
                      className="upgrade-btn"
                    >
                      Upgrade
                    </Link>
                  )}
                </div>
                <button onClick={() => signOut()} className="logout-btn" title="Logout">
                  <LogOut size={14} style={{ flexShrink: 0 }} />
                  <span className="nav-text" style={{ fontSize: '0.8125rem' }}>Log out</span>
                </button>
              </div>
            ) : (
              <button onClick={() => signIn('google')} className="login-btn" title="Login">
                <LogIn size={16} style={{ flexShrink: 0 }} />
                <span className="nav-text">Log in</span>
              </button>
            )}
          </li>
        </nav>
      </aside>
      <FeedbackModal isOpen={isFeedbackOpen} onClose={() => setIsFeedbackOpen(false)} />
    </>
  );
}
