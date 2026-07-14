'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Briefcase, BarChart2, Settings, FileText, Menu, X } from 'lucide-react';

export default function Navigation() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);

  const toggleMenu = () => setIsOpen(!isOpen);
  const closeMenu = () => setIsOpen(false);

  return (
    <aside className="sidebar">
      <div className="mobile-nav-header">
        <div>
          <h2 className="page-title" style={{ fontSize: '1.5rem', marginBottom: 0 }}>Job Agent</h2>
          <p className="page-subtitle" style={{ fontSize: '0.85rem', marginBottom: 0 }}>Autonomous Career Search</p>
        </div>
        <button className="burger-btn" onClick={toggleMenu} aria-label="Toggle navigation">
          {isOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>
      
      <nav className={`nav-menu ${isOpen ? 'open' : ''}`}>
        <li className="nav-item">
          <Link href="/" className={pathname === '/' ? 'active' : ''} onClick={closeMenu}>
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
          <Link href="/settings" className={pathname === '/settings' ? 'active' : ''} onClick={closeMenu}>
            <Settings size={20} />
            Settings
          </Link>
        </li>
      </nav>
    </aside>
  );
}
