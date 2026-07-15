'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Trash2, X, AlertCircle } from 'lucide-react';

interface DashboardCleanupProps {
  onCleanupComplete: () => void;
  checkedJobs?: string[];
}

export default function DashboardCleanup({ onCleanupComplete, checkedJobs = [] }: DashboardCleanupProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isCleaning, setIsCleaning] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);
  
  const [filters, setFilters] = useState({
    disliked: false,
    viewed: false,
    applied: false,
    archived: false,
    checked: false,
    olderThanDays: ''
  });

  const handleCleanup = async () => {
    if (!filters.disliked && !filters.viewed && !filters.applied && !filters.archived && !filters.checked && !filters.olderThanDays) {
      alert("Please select at least one criteria for cleanup.");
      return;
    }

    if (confirm("Are you sure you want to permanently delete jobs matching these criteria? This action cannot be undone.")) {
      setIsCleaning(true);
      try {
        const payload = {
          disliked: filters.disliked,
          viewed: filters.viewed,
          applied: filters.applied,
          archived: filters.archived,
          checked: filters.checked,
          checkedJobIds: filters.checked ? checkedJobs : [],
          olderThanDays: filters.olderThanDays ? parseInt(filters.olderThanDays, 10) : null
        };

        const res = await fetch('/api/jobs/cleanup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        if (res.ok) {
          const data = await res.json();
          alert(`Successfully deleted ${data.count} jobs.`);
          setIsOpen(false);
          setFilters({ disliked: false, viewed: false, applied: false, archived: false, checked: false, olderThanDays: '' });
          onCleanupComplete();
        } else {
          const error = await res.json();
          alert(`Error: ${error.error || 'Failed to clean up jobs'}`);
        }
      } catch (err) {
        console.error(err);
        alert("An error occurred while cleaning up jobs.");
      } finally {
        setIsCleaning(false);
      }
    }
  };

  return (
    <>
      <button 
        onClick={() => setIsOpen(true)}
        className="btn-outline"
        style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1rem', borderColor: 'var(--status-rejected)', color: 'var(--status-rejected)' }}
        title="Clean up dashboard"
      >
        <Trash2 size={16} />
        <span>Cleanup</span>
      </button>

      {mounted && isOpen && createPortal(
        <div className="modal-overlay" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          <div className="modal-content glass-card" style={{ backgroundColor: 'var(--bg-surface)', padding: '2rem', maxWidth: '500px', width: '90%', position: 'relative', maxHeight: '90vh', overflowY: 'auto' }}>
            <button 
              onClick={() => setIsOpen(false)}
              style={{ position: 'absolute', top: '1rem', right: '1rem', background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}
            >
              <X size={20} />
            </button>

            <h2 style={{ marginTop: 0, marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Trash2 size={24} color="var(--status-rejected)" />
              Dashboard Cleanup
            </h2>

            <div style={{ marginBottom: '1.5rem', padding: '1rem', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid var(--status-rejected)', borderRadius: '8px', display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
              <AlertCircle size={20} color="var(--status-rejected)" style={{ flexShrink: 0, marginTop: '2px' }} />
              <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-primary)' }}>
                Warning: Jobs matching the selected criteria will be hidden from your dashboard.
              </p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '2rem' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer' }}>
                <input 
                  type="checkbox" 
                  checked={filters.disliked}
                  onChange={(e) => setFilters(prev => ({ ...prev, disliked: e.target.checked }))}
                  style={{ width: '18px', height: '18px' }}
                />
                <span>Remove <strong>disliked</strong> jobs</span>
              </label>

              <label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer' }}>
                <input 
                  type="checkbox" 
                  checked={filters.viewed}
                  onChange={(e) => setFilters(prev => ({ ...prev, viewed: e.target.checked }))}
                  style={{ width: '18px', height: '18px' }}
                />
                <span>Remove <strong>viewed</strong> jobs</span>
              </label>

              <label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer' }}>
                <input 
                  type="checkbox" 
                  checked={filters.applied}
                  onChange={(e) => setFilters(prev => ({ ...prev, applied: e.target.checked }))}
                  style={{ width: '18px', height: '18px' }}
                />
                <span>Remove <strong>applied to</strong> jobs</span>
              </label>

              <label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer' }}>
                <input 
                  type="checkbox" 
                  checked={filters.archived}
                  onChange={(e) => setFilters(prev => ({ ...prev, archived: e.target.checked }))}
                  style={{ width: '18px', height: '18px' }}
                />
                <span>Remove <strong>archived</strong> jobs</span>
              </label>

              <label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer' }}>
                <input 
                  type="checkbox" 
                  checked={filters.checked}
                  onChange={(e) => setFilters(prev => ({ ...prev, checked: e.target.checked }))}
                  style={{ width: '18px', height: '18px' }}
                />
                <span>Remove <strong>checked</strong> jobs ({checkedJobs.length} selected)</span>
              </label>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Remove jobs older than</span>
                <input 
                  type="number" 
                  min="1"
                  value={filters.olderThanDays}
                  onChange={(e) => setFilters(prev => ({ ...prev, olderThanDays: e.target.value }))}
                  style={{ width: '60px', padding: '0.4rem', background: 'var(--bg-color)', border: '1px solid var(--border-glass)', borderRadius: '4px', color: 'var(--text-primary)' }}
                />
                <span style={{ color: 'var(--text-secondary)' }}>days</span>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
              <button 
                onClick={() => setIsOpen(false)}
                className="btn-outline"
                disabled={isCleaning}
              >
                Cancel
              </button>
              <button 
                onClick={handleCleanup}
                className="btn-primary"
                style={{ background: 'var(--status-rejected)', color: 'white' }}
                disabled={isCleaning || (!filters.disliked && !filters.viewed && !filters.applied && !filters.archived && !filters.checked && !filters.olderThanDays)}
              >
                {isCleaning ? 'Deleting...' : 'Delete Jobs'}
              </button>
            </div>
          </div>
        </div>
      , document.body)}
    </>
  );
}
