"use client";

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { Mail, SlidersHorizontal, PlusCircle, Trash2, Loader2, Sparkles, ArrowUpDown, X } from 'lucide-react';
import SyncButton from '@/components/SyncButton';

export type SortOptionType = 'newest' | 'score' | 'salary' | 'remote' | 'auto_apply';

export interface SectionShortcut {
  id: string;
  label: string;
  onClick: () => void;
  active?: boolean;
}

interface DashboardDockProps {
  onEmailSync?: () => void;
  isEmailSyncing?: boolean;
  isSyncing?: boolean;
  onSyncStateChange?: (loading: boolean, text: string, count?: number, isRefining?: boolean) => void;
  onSyncComplete?: (count: number) => void;
  onOpenFilterModal?: () => void;
  hasActiveFilters?: boolean;
  onOpenAddJobModal?: () => void;
  onOpenCleanupModal?: () => void;
  sortOption?: SortOptionType;
  setSortOption?: (val: SortOptionType) => void;
  sectionShortcuts?: SectionShortcut[];
}

export default function DashboardDock({
  onEmailSync,
  isEmailSyncing = false,
  isSyncing = false,
  onSyncStateChange,
  onSyncComplete,
  onOpenFilterModal,
  hasActiveFilters = false,
  onOpenAddJobModal,
  onOpenCleanupModal,
  sortOption = 'newest',
  setSortOption,
  sectionShortcuts
}: DashboardDockProps) {
  const router = useRouter();
  const [isFabOpen, setIsFabOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleEmailSyncClick = () => {
    if (onEmailSync) {
      onEmailSync();
    } else {
      router.push('/dashboard?scanEmail=true');
    }
  };

  const handleFilterClick = () => {
    if (onOpenFilterModal) {
      onOpenFilterModal();
    } else {
      router.push('/dashboard?openFilter=true');
    }
  };

  const handleAddJobClick = () => {
    if (onOpenAddJobModal) {
      onOpenAddJobModal();
    } else {
      router.push('/dashboard?openAddJob=true');
    }
  };

  const handleCleanupClick = () => {
    if (onOpenCleanupModal) {
      onOpenCleanupModal();
    } else {
      router.push('/dashboard?openCleanup=true');
    }
  };

  return (
    <>
      {/* Desktop Dock (Visible >= 1025px) */}
      <div className="job-action-bar-desktop dashboard-dock dashboard-dock-desktop">
        {/* 1. Scan Inbox for Jobs */}
        <button
          onClick={handleEmailSyncClick}
          disabled={isEmailSyncing || isSyncing}
          className="job-step-btn"
          title="Scan email inbox for job alert notifications"
        >
          {isEmailSyncing ? (
            <Loader2 size={15} className="animate-spin" style={{ color: '#38bdf8' }} />
          ) : (
            <Mail size={15} style={{ color: '#38bdf8' }} />
          )}
          <span>{isEmailSyncing ? 'Scanning Inbox...' : 'Scan Inbox'}</span>
        </button>

        {/* 2. Search for Jobs (SyncButton) */}
        <div data-tour="dashboard-sync-jobs" style={{ display: 'flex', alignItems: 'center' }}>
          <SyncButton
            compact={true}
            onSyncStateChange={onSyncStateChange}
            onSyncComplete={onSyncComplete}
          />
        </div>

        {/* Divider */}
        <div className="job-action-bar-divider" />

        {/* 3. Filter Button */}
        <button
          onClick={handleFilterClick}
          className="job-step-btn"
          title="Filter & Sort Job Feed"
          style={{ position: 'relative' }}
        >
          <SlidersHorizontal size={15} />
          <span>Filter</span>
          {hasActiveFilters && (
            <span
              style={{
                position: 'absolute',
                top: '4px',
                right: '4px',
                width: '7px',
                height: '7px',
                borderRadius: '50%',
                background: '#0070f3',
                boxShadow: '0 0 6px #0070f3'
              }}
            />
          )}
        </button>

        {/* 4. Sort Selector Button */}
        {sortOption !== undefined && setSortOption && (
          <div
            className="job-step-btn"
            title="Sort Job Feed"
            style={{ paddingRight: '0.4rem', cursor: 'pointer' }}
          >
            <ArrowUpDown size={15} style={{ color: 'var(--accent-primary, #3b82f6)' }} />
            <select
              value={sortOption}
              onChange={(e) => setSortOption(e.target.value as SortOptionType)}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'inherit',
                fontSize: 'inherit',
                fontWeight: 'inherit',
                cursor: 'pointer',
                outline: 'none',
                paddingRight: '0.2rem',
                fontFamily: 'inherit',
                appearance: 'none',
                WebkitAppearance: 'none',
                MozAppearance: 'none',
              }}
            >
              <option value="newest" style={{ background: '#0f172a', color: '#f8fafc' }}>Sort: Newest</option>
              <option value="score" style={{ background: '#0f172a', color: '#f8fafc' }}>Sort: Match Score</option>
              <option value="salary" style={{ background: '#0f172a', color: '#f8fafc' }}>Sort: Salary</option>
              <option value="remote" style={{ background: '#0f172a', color: '#f8fafc' }}>Sort: Remote</option>
              <option value="auto_apply" style={{ background: '#0f172a', color: '#f8fafc' }}>Sort: Auto Apply</option>
            </select>
          </div>
        )}

        {/* 5. Scrape & Add Job Button */}
        <button
          onClick={handleAddJobClick}
          className="job-step-btn"
          title="Paste job URL to scrape & add to pipeline"
        >
          <PlusCircle size={15} style={{ color: '#10b981' }} />
          <span>Scrape & Add Job</span>
        </button>

        {/* 6. Clean Up Button */}
        <button
          onClick={handleCleanupClick}
          className="job-step-btn"
          title="Open Dashboard Cleanup Tool"
          style={{ borderColor: 'rgba(239, 68, 68, 0.4)', color: 'var(--danger, #ef4444)' }}
        >
          <Trash2 size={15} style={{ color: 'var(--danger, #ef4444)' }} />
          <span>Clean Up</span>
        </button>
      </div>

      {/* Mobile & Tablet Multi-Action FAB (Visible <= 1024px) */}
      {mounted && createPortal(
        <div className="dashboard-dock-mobile">
          {isFabOpen && (
            <>
              {/* Overlay Backdrop */}
              <div
                onClick={() => setIsFabOpen(false)}
                style={{
                  position: 'fixed',
                  inset: 0,
                  zIndex: 9998,
                  background: 'rgba(0, 0, 0, 0.4)',
                }}
              />

              {/* Speed Dial Menu Card */}
              <div className="job-fab-menu dashboard-fab-menu" style={{ zIndex: 9999 }}>
                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', borderBottom: '1px solid var(--border-glass, #e2e8f0)', paddingBottom: '0.5rem', marginBottom: '0.25rem' }}>
                  <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary, #0f172a)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <Sparkles size={15} style={{ color: 'var(--accent-primary, #0070f3)' }} /> Quick Actions
                  </span>
                  <button onClick={() => setIsFabOpen(false)} style={{ background: 'none', border: 'none', color: 'var(--text-secondary, #64748b)', cursor: 'pointer', padding: '2px' }}>
                    <X size={16} />
                  </button>
                </div>

                {/* Section Shortcuts if provided (for Settings & Profile) */}
                {sectionShortcuts && sectionShortcuts.length > 0 && (
                  <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '0.35rem', paddingBottom: '0.5rem', borderBottom: '1px solid var(--border-glass, #e2e8f0)' }}>
                    <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary, #64748b)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Page Sections
                    </span>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                      {sectionShortcuts.map(sec => (
                        <button
                          key={sec.id}
                          onClick={() => {
                            sec.onClick();
                            setIsFabOpen(false);
                          }}
                          className={`btn-outline ${sec.active ? 'active' : ''}`}
                          style={{
                            fontSize: '0.78rem',
                            padding: '0.3rem 0.6rem',
                            borderRadius: '8px',
                            background: sec.active ? 'var(--accent-primary, #0070f3)' : undefined,
                            color: sec.active ? '#ffffff' : undefined,
                            borderColor: sec.active ? 'var(--accent-primary, #0070f3)' : undefined,
                          }}
                        >
                          {sec.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* 1. Search / Sync Jobs */}
                <div style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.2rem 0' }}>
                  <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary, #0f172a)' }}>Search & Sync</span>
                  <SyncButton
                    compact={true}
                    onSyncStateChange={onSyncStateChange}
                    onSyncComplete={(count) => {
                      setIsFabOpen(false);
                      if (onSyncComplete) onSyncComplete(count);
                    }}
                  />
                </div>

                {/* 2. Scan Inbox */}
                <button
                  onClick={() => { setIsFabOpen(false); handleEmailSyncClick(); }}
                  disabled={isEmailSyncing || isSyncing}
                  className="btn-outline"
                  style={{ width: '100%', justifyContent: 'flex-start', padding: '0.5rem 0.75rem', fontSize: '0.85rem', gap: '0.5rem' }}
                >
                  {isEmailSyncing ? (
                    <Loader2 size={16} className="animate-spin" style={{ color: '#38bdf8' }} />
                  ) : (
                    <Mail size={16} style={{ color: '#38bdf8' }} />
                  )}
                  <span>{isEmailSyncing ? 'Scanning Inbox...' : 'Scan Inbox'}</span>
                </button>

                {/* 3. Filter Feed */}
                <button
                  onClick={() => { setIsFabOpen(false); handleFilterClick(); }}
                  className="btn-outline"
                  style={{ width: '100%', justifyContent: 'space-between', padding: '0.5rem 0.75rem', fontSize: '0.85rem', position: 'relative' }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <SlidersHorizontal size={16} style={{ color: '#3b82f6' }} /> Filter Feed
                  </span>
                  {hasActiveFilters && (
                    <span
                      style={{
                        width: '8px',
                        height: '8px',
                        borderRadius: '50%',
                        background: '#0070f3',
                        boxShadow: '0 0 6px #0070f3'
                      }}
                    />
                  )}
                </button>

                {/* 4. Sort Feed */}
                {sortOption !== undefined && setSortOption && (
                  <div
                    className="btn-outline"
                    style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.4rem 0.75rem', fontSize: '0.85rem' }}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <ArrowUpDown size={16} style={{ color: '#ec4899' }} /> Sort
                    </span>
                    <select
                      value={sortOption}
                      onChange={(e) => {
                        setSortOption(e.target.value as SortOptionType);
                        setIsFabOpen(false);
                      }}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: 'inherit',
                        fontSize: '0.85rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                        outline: 'none',
                        fontFamily: 'inherit',
                      }}
                    >
                      <option value="newest" style={{ background: '#0f172a', color: '#f8fafc' }}>Newest</option>
                      <option value="score" style={{ background: '#0f172a', color: '#f8fafc' }}>Match Score</option>
                      <option value="salary" style={{ background: '#0f172a', color: '#f8fafc' }}>Salary</option>
                      <option value="remote" style={{ background: '#0f172a', color: '#f8fafc' }}>Remote</option>
                      <option value="auto_apply" style={{ background: '#0f172a', color: '#f8fafc' }}>Auto Apply</option>
                    </select>
                  </div>
                )}

                {/* 5. Scrape & Add Job */}
                <button
                  onClick={() => { setIsFabOpen(false); handleAddJobClick(); }}
                  className="btn-outline"
                  style={{ width: '100%', justifyContent: 'flex-start', padding: '0.5rem 0.75rem', fontSize: '0.85rem', gap: '0.5rem' }}
                >
                  <PlusCircle size={16} style={{ color: '#10b981' }} />
                  <span>Scrape & Add Job</span>
                </button>

                {/* 6. Clean Up */}
                <button
                  onClick={() => { setIsFabOpen(false); handleCleanupClick(); }}
                  className="btn-outline"
                  style={{ width: '100%', justifyContent: 'flex-start', padding: '0.5rem 0.75rem', fontSize: '0.85rem', gap: '0.5rem', borderColor: 'rgba(239, 68, 68, 0.4)', color: '#ef4444' }}
                >
                  <Trash2 size={16} style={{ color: '#ef4444' }} />
                  <span>Clean Up</span>
                </button>
              </div>
            </>
          )}

          {/* Trigger FAB Button */}
          <button
            onClick={() => setIsFabOpen(prev => !prev)}
            aria-label="Toggle Dashboard Quick Actions"
            style={{
              position: 'fixed',
              bottom: '1.5rem',
              right: '1.5rem',
              zIndex: 10000,
              width: '56px',
              height: '56px',
              borderRadius: '50%',
              background: 'var(--accent-primary, #0070f3)',
              color: '#ffffff',
              border: 'none',
              boxShadow: '0 8px 24px rgba(0, 112, 243, 0.4), 0 4px 12px rgba(0,0,0,0.2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              transition: 'transform 0.2s ease',
            }}
          >
            {isFabOpen ? (
              <X size={26} />
            ) : (
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Sparkles size={26} />
                {hasActiveFilters && (
                  <span
                    style={{
                      position: 'absolute',
                      top: '-2px',
                      right: '-2px',
                      width: '10px',
                      height: '10px',
                      borderRadius: '50%',
                      background: '#38bdf8',
                      border: '2px solid #0070f3'
                    }}
                  />
                )}
              </div>
            )}
          </button>
        </div>,
        document.body
      )}
    </>
  );
}
