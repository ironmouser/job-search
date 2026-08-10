"use client";

import { Mail, SlidersHorizontal, PlusCircle, Trash2, Loader2, Sparkles } from 'lucide-react';
import SyncButton from '@/components/SyncButton';

interface DashboardDockProps {
  onEmailSync: () => void;
  isEmailSyncing: boolean;
  isSyncing: boolean;
  onSyncStateChange?: (loading: boolean, text: string, count?: number, isRefining?: boolean) => void;
  onSyncComplete?: (count: number) => void;
  onOpenFilterModal: () => void;
  hasActiveFilters: boolean;
  onOpenAddJobModal: () => void;
  onOpenCleanupModal: () => void;
}

export default function DashboardDock({
  onEmailSync,
  isEmailSyncing,
  isSyncing,
  onSyncStateChange,
  onSyncComplete,
  onOpenFilterModal,
  hasActiveFilters,
  onOpenAddJobModal,
  onOpenCleanupModal
}: DashboardDockProps) {
  return (
    <div className="job-action-bar-desktop dashboard-dock">
      {/* 1. Scan Inbox for Jobs */}
      <button
        onClick={onEmailSync}
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
        onClick={onOpenFilterModal}
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

      {/* 4. Scrape & Add Job Button */}
      <button
        onClick={onOpenAddJobModal}
        className="job-step-btn"
        title="Paste job URL to scrape & add to pipeline"
      >
        <PlusCircle size={15} style={{ color: '#10b981' }} />
        <span>Scrape & Add Job</span>
      </button>

      {/* 5. Clean Up Button */}
      <button
        onClick={onOpenCleanupModal}
        className="job-step-btn"
        title="Open Dashboard Cleanup Tool"
        style={{ borderColor: 'rgba(239, 68, 68, 0.4)', color: 'var(--danger, #ef4444)' }}
      >
        <Trash2 size={15} style={{ color: 'var(--danger, #ef4444)' }} />
        <span>Clean Up</span>
      </button>
    </div>
  );
}
