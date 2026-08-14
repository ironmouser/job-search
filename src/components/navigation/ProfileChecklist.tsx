"use client";

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useSession } from 'next-auth/react';
import {
  CheckCircle2,
  Circle,
  ChevronDown,
  ChevronUp,
  FileText,
  Target,
  ShieldCheck,
  User,
  Image as ImageIcon,
  ListTodo,
  ChevronRight
} from 'lucide-react';

interface ProfileChecklistProps {
  isMinimized?: boolean;
  onItemClick?: () => void;
}

interface ChecklistItem {
  id: string;
  title: string;
  shortDesc: string;
  icon: React.ComponentType<{ size?: number; className?: string; style?: React.CSSProperties }>;
  isComplete: (settings: any, session: any) => boolean;
}

const CHECKLIST_ITEMS: ChecklistItem[] = [
  {
    id: 'base-resume',
    title: 'Base Resume',
    shortDesc: 'Paste or upload base resume',
    icon: FileText,
    isComplete: (settings) => Boolean(settings?.resumeMarkdown && settings.resumeMarkdown.trim().length > 30),
  },
  {
    id: 'target-profile',
    title: 'Target Role & Rubric',
    shortDesc: 'Set scoring criteria & ideal role',
    icon: Target,
    isComplete: (settings) => Boolean(settings?.profile && settings.profile.trim().length > 10),
  },
  {
    id: 'work-auth',
    title: 'Work Authorization',
    shortDesc: 'Citizenship & sponsorship answers',
    icon: ShieldCheck,
    isComplete: (settings) => Boolean(
      settings?.usWorkAuthorization || 
      settings?.country || 
      settings?.skipSelfId || 
      (settings?.visaSponsorship && settings.visaSponsorship !== '')
    ),
  },
  {
    id: 'personal-info',
    title: 'Contact & Links',
    shortDesc: 'Phone, location & social links',
    icon: User,
    isComplete: (settings, session) => Boolean(
      settings?.phone || 
      settings?.location || 
      settings?.streetAddress || 
      settings?.linkedinUrl || 
      settings?.githubUrl || 
      settings?.websiteUrl || 
      Boolean(session?.user?.name && session?.user?.name.trim().length > 0)
    ),
  },
  {
    id: 'avatar-settings',
    title: 'Profile Photo',
    shortDesc: 'Upload a custom avatar',
    icon: ImageIcon,
    isComplete: (_settings, session) => {
      const img = session?.user?.image;
      return Boolean(img && !img.includes('default-avatar') && !img.includes('placeholder'));
    },
  },
];

export default function ProfileChecklist({ isMinimized = false, onItemClick }: ProfileChecklistProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { data: session } = useSession();

  const [settings, setSettings] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isOpen, setIsOpen] = useState(false);
  const [isMounted, setIsMounted] = useState(false);

  // Fetch settings to evaluate completeness
  const fetchSettings = useCallback(async () => {
    try {
      const res = await fetch('/api/settings', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        setSettings(data);
      }
    } catch (err) {
      console.warn('Failed to load settings for profile checklist', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setIsMounted(true);
    fetchSettings();

    // Restore accordion state from localStorage if available
    try {
      const storedState = localStorage.getItem('sidebar_profile_checklist_open');
      if (storedState !== null) {
        setIsOpen(storedState === 'true');
      } else {
        setIsOpen(true);
      }
    } catch (e) {
      setIsOpen(true);
    }

    // Listen for settings or profile updates across the app
    const handleUpdate = (e: any) => {
      if (e.detail?.settings) {
        setSettings(e.detail.settings);
      } else {
        fetchSettings();
      }
    };

    window.addEventListener('settings-updated', handleUpdate);
    window.addEventListener('profile-updated', handleUpdate);

    return () => {
      window.removeEventListener('settings-updated', handleUpdate);
      window.removeEventListener('profile-updated', handleUpdate);
    };
  }, [fetchSettings]);

  const toggleOpen = () => {
    const next = !isOpen;
    setIsOpen(next);
    try {
      localStorage.setItem('sidebar_profile_checklist_open', String(next));
    } catch (e) {}
  };

  // Evaluate items
  const evaluatedItems = useMemo(() => {
    return CHECKLIST_ITEMS.map((item) => ({
      ...item,
      completed: item.isComplete(settings, session),
    }));
  }, [settings, session]);

  const completedCount = useMemo(() => {
    return evaluatedItems.filter((i) => i.completed).length;
  }, [evaluatedItems]);

  const totalCount = evaluatedItems.length;
  const percentage = Math.round((completedCount / totalCount) * 100);
  const isAllComplete = completedCount === totalCount;

  const handleNavigateToSection = (sectionId: string) => {
    if (onItemClick) {
      onItemClick();
    }

    if (pathname === '/profile') {
      window.location.hash = sectionId;
      window.dispatchEvent(
        new CustomEvent('open-profile-section', {
          detail: { sectionId },
        })
      );
    } else {
      router.push(`/profile#${sectionId}`);
    }
  };

  if (!isMounted || !session) return null;

  // Minimized Sidebar View
  if (isMinimized) {
    return (
      <div className="profile-checklist-minimized" title={`Profile Setup: ${completedCount}/${totalCount} completed (${percentage}%)`}>
        <button
          onClick={() => handleNavigateToSection('personal-info')}
          className="checklist-min-btn"
          aria-label="Profile Setup"
        >
          {isAllComplete ? (
            <CheckCircle2 size={16} style={{ color: '#22c55e' }} />
          ) : (
            <div className="mini-progress-wrapper">
              <ListTodo size={14} style={{ color: 'var(--accent-primary, #38bdf8)' }} />
              <span className="mini-badge-count">{completedCount}/{totalCount}</span>
            </div>
          )}
        </button>
      </div>
    );
  }

  return (
    <div className="profile-checklist-card">
      {/* Header Button */}
      <button
        onClick={toggleOpen}
        className="profile-checklist-header"
        aria-expanded={isOpen}
        title="Toggle profile setup tasks"
      >
        <div className="checklist-header-left">
          <div className="checklist-header-text">
            <span className="checklist-title">
              {isAllComplete ? 'Profile Complete' : 'Profile Setup'}
            </span>
            <span className="checklist-fraction">
              {completedCount} of {totalCount} completed
            </span>
          </div>
        </div>

        <div className="checklist-header-right">
          <span className={`checklist-pct-badge ${isAllComplete ? 'all-done' : ''}`}>
            {percentage}%
          </span>
          {isOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </div>
      </button>

      {/* Mini Progress Bar */}
      <div className="checklist-progress-track">
        <div
          className={`checklist-progress-bar ${isAllComplete ? 'all-done' : ''}`}
          style={{ width: `${percentage}%` }}
        />
      </div>

      {/* Expanded Accordion Body */}
      {isOpen && (
        <div className="checklist-items-container">
          {evaluatedItems.map((item) => {
            return (
              <button
                key={item.id}
                onClick={() => handleNavigateToSection(item.id)}
                className={`checklist-item-row ${item.completed ? 'is-complete' : 'is-pending'}`}
                title={`Go to ${item.title}`}
              >
                <div className="checklist-item-status">
                  {item.completed ? (
                    <CheckCircle2 size={14} className="status-icon-done" />
                  ) : (
                    <Circle size={14} className="status-icon-pending" />
                  )}
                </div>

                <div className="checklist-item-content">
                  <span className="item-title">{item.title}</span>
                  <span className="item-desc">{item.shortDesc}</span>
                </div>

                <div className="checklist-item-action">
                  <ChevronRight size={13} className="item-arrow" />
                </div>
              </button>
            );
          })}

          {isAllComplete && (
            <div className="checklist-complete-note">
              <CheckCircle2 size={13} style={{ color: '#22c55e', flexShrink: 0 }} />
              <span>Great job! Your profile is fully optimized for AI job applications.</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
