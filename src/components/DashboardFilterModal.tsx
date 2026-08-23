"use client";

import { Modal } from './ui/modal';
import { Search, SlidersHorizontal, RotateCcw, Check, Sparkles, X, Calendar } from 'lucide-react';

import { SortOptionType } from '@/components/DashboardDock';

interface DashboardFilterModalProps {
  isOpen: boolean;
  onClose: () => void;
  keywordFilter: string;
  setKeywordFilter: (val: string) => void;
  sourceFilter: 'both' | 'email' | 'scraped';
  setSourceFilter: (val: 'both' | 'email' | 'scraped') => void;
  startDate: string;
  setStartDate: (val: string) => void;
  endDate: string;
  setEndDate: (val: string) => void;
  locationFilter: string[];
  setLocationFilter: React.Dispatch<React.SetStateAction<string[]>>;
  uniqueLocations: string[];
  totalMatches: number;
  sortOption?: SortOptionType;
  setSortOption?: (val: SortOptionType) => void;
  activeFilter?: 'all' | 'scored' | 'high_fit' | 'archived';
  setActiveFilter?: (val: 'all' | 'scored' | 'high_fit' | 'archived') => void;
  minScore?: number;
  setMinScore?: (val: number) => void;
}

export default function DashboardFilterModal({
  isOpen,
  onClose,
  keywordFilter,
  setKeywordFilter,
  sourceFilter,
  setSourceFilter,
  startDate,
  setStartDate,
  endDate,
  setEndDate,
  locationFilter,
  setLocationFilter,
  uniqueLocations,
  totalMatches,
  sortOption = 'role_match',
  setSortOption,
  activeFilter = 'all',
  setActiveFilter,
  minScore = 50,
  setMinScore
}: DashboardFilterModalProps) {
  const setPresetDateRange = (preset: 'all' | 'today' | 7 | 30) => {
    if (preset === 'all') {
      setStartDate('');
      setEndDate('');
    } else if (preset === 'today') {
      const todayStr = new Date().toISOString().split('T')[0];
      setStartDate(todayStr);
      setEndDate(todayStr);
    } else {
      const d = new Date();
      d.setDate(d.getDate() - preset);
      setStartDate(d.toISOString().split('T')[0]);
      setEndDate('');
    }
  };

  const handleReset = () => {
    setKeywordFilter('');
    setSourceFilter('both');
    setStartDate('');
    setEndDate('');
    setLocationFilter([]);
    if (setSortOption) setSortOption('role_match');
    if (setActiveFilter) setActiveFilter('all');
    if (setMinScore) setMinScore(50);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <SlidersHorizontal size={20} style={{ color: 'var(--accent-primary, #0070f3)' }} />
          <span>Filter & Sort Jobs</span>
        </div>
      }
      description="Refine and search your active job feed"
      maxWidth="950px"
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        {/* Horizontal Two-Column Grid Layout on Desktop */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))', gap: '1.25rem' }}>
          {/* Left Column: Search Keyword, Status & Fit, Locations */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {/* Search Keyword */}
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--foreground)', marginBottom: '0.4rem' }}>
                Keyword Filter
              </label>
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <Search size={16} style={{ position: 'absolute', left: '0.75rem', color: '#94a3b8' }} />
                <input
                  type="text"
                  value={keywordFilter}
                  onChange={(e) => setKeywordFilter(e.target.value)}
                  placeholder="Search title, company, skills..."
                  style={{
                    width: '100%',
                    padding: '0.55rem 2.25rem 0.55rem 2.25rem',
                    fontSize: '0.875rem',
                    borderRadius: '8px',
                    border: '1px solid var(--border)',
                    background: 'var(--background)',
                    color: 'var(--foreground)',
                    outline: 'none'
                  }}
                />
                {keywordFilter && (
                  <button
                    onClick={() => setKeywordFilter('')}
                    style={{
                      position: 'absolute',
                      right: '0.75rem',
                      background: 'none',
                      border: 'none',
                      color: '#94a3b8',
                      cursor: 'pointer',
                      padding: '2px',
                      display: 'flex',
                      alignItems: 'center'
                    }}
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
            </div>

            {/* Status & Fit Filter Pills */}
            {setActiveFilter && (
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--foreground)', marginBottom: '0.4rem' }}>
                  Status & Fit Filter
                </label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                  {[
                    { id: 'all', label: 'All Jobs' },
                    { id: 'high_fit', label: 'High Fit (80%+)' },
                    { id: 'scored', label: 'Scored Jobs' },
                    { id: 'archived', label: 'Archived' }
                  ].map(opt => {
                    const isSelected = activeFilter === opt.id;
                    return (
                      <button
                        key={opt.id}
                        onClick={() => setActiveFilter(opt.id as any)}
                        style={{
                          padding: '0.4rem 0.75rem',
                          fontSize: '0.825rem',
                          borderRadius: '20px',
                          border: isSelected ? '1px solid #0070f3' : '1px solid var(--border)',
                          background: isSelected ? 'rgba(0, 112, 243, 0.1)' : 'var(--background)',
                          color: isSelected ? '#0070f3' : 'var(--foreground)',
                          fontWeight: isSelected ? 600 : 400,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.3rem',
                          transition: 'all 0.15s ease'
                        }}
                      >
                        {isSelected && <Check size={14} />}
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Minimum Match Score Filter */}
            {setMinScore && (
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--foreground)', marginBottom: '0.4rem' }}>
                  Minimum Match Score
                </label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                  {[
                    { val: 50, label: 'Hide < 50 (Default)' },
                    { val: 0, label: 'Show All (0+)' },
                    { val: 25, label: '25%+' },
                    { val: 80, label: '80%+ (High Fit)' }
                  ].map(opt => {
                    const isSelected = (minScore ?? 50) === opt.val;
                    return (
                      <button
                        key={opt.val}
                        type="button"
                        onClick={() => setMinScore(opt.val)}
                        style={{
                          padding: '0.35rem 0.7rem',
                          fontSize: '0.8rem',
                          borderRadius: '20px',
                          border: isSelected ? '1px solid #0070f3' : '1px solid var(--border)',
                          background: isSelected ? 'rgba(0, 112, 243, 0.1)' : 'var(--background)',
                          color: isSelected ? '#0070f3' : 'var(--foreground)',
                          fontWeight: isSelected ? 600 : 400,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.3rem',
                          transition: 'all 0.15s ease'
                        }}
                      >
                        {isSelected && <Check size={14} />}
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Location Filters */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
                <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--foreground)' }}>
                  Locations ({locationFilter.length > 0 ? `${locationFilter.length} selected` : 'All'})
                </label>
                {locationFilter.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setLocationFilter([])}
                    style={{ background: 'none', border: 'none', color: '#0070f3', fontSize: '0.75rem', cursor: 'pointer', fontWeight: 600 }}
                  >
                    Clear location filters
                  </button>
                )}
              </div>

              <div
                style={{
                  maxHeight: '160px',
                  overflowY: 'auto',
                  border: '1px solid var(--border)',
                  borderRadius: '10px',
                  padding: '0.5rem',
                  background: 'var(--background)',
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
                  gap: '0.35rem'
                }}
              >
                {uniqueLocations.length > 0 ? (
                  uniqueLocations.map((loc) => {
                    const isChecked = locationFilter.includes(loc);
                    return (
                      <label
                        key={loc}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.4rem',
                          padding: '0.35rem 0.5rem',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          fontSize: '0.8rem',
                          color: isChecked ? '#0070f3' : 'var(--foreground)',
                          background: isChecked ? 'rgba(0, 112, 243, 0.1)' : 'transparent',
                          userSelect: 'none'
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {
                            setLocationFilter((prev) =>
                              prev.includes(loc) ? prev.filter((l) => l !== loc) : [...prev, loc]
                            );
                          }}
                          style={{ accentColor: '#0070f3', width: '14px', height: '14px', cursor: 'pointer' }}
                        />
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{loc}</span>
                      </label>
                    );
                  })
                ) : (
                  <span style={{ fontSize: '0.8rem', color: 'var(--muted-foreground)', padding: '0.5rem' }}>No locations available</span>
                )}
              </div>
            </div>
          </div>

          {/* Right Column: Date Range, Sort Order, Job Source */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {/* Date Range Filter Section */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--foreground)' }}>
                  Date Discovered Range
                </label>
                {/* Quick Presets */}
                <div style={{ display: 'flex', gap: '0.25rem' }}>
                  {[
                    { label: 'All', action: () => setPresetDateRange('all') },
                    { label: 'Today', action: () => setPresetDateRange('today') },
                    { label: '7 Days', action: () => setPresetDateRange(7) },
                    { label: '30 Days', action: () => setPresetDateRange(30) }
                  ].map(p => (
                    <button
                      key={p.label}
                      type="button"
                      onClick={p.action}
                      style={{
                        fontSize: '0.725rem',
                        padding: '2px 8px',
                        borderRadius: '12px',
                        border: '1px solid var(--border)',
                        background: 'var(--background)',
                        color: 'var(--muted-foreground)',
                        cursor: 'pointer'
                      }}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <Calendar size={15} style={{ position: 'absolute', left: '0.65rem', color: '#94a3b8', pointerEvents: 'none' }} />
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '0.45rem 0.5rem 0.45rem 2rem',
                      fontSize: '0.825rem',
                      borderRadius: '8px',
                      border: '1px solid var(--border)',
                      background: 'var(--background)',
                      color: 'var(--foreground)',
                      outline: 'none'
                    }}
                  />
                </div>

                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <Calendar size={15} style={{ position: 'absolute', left: '0.65rem', color: '#94a3b8', pointerEvents: 'none' }} />
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '0.45rem 0.5rem 0.45rem 2rem',
                      fontSize: '0.825rem',
                      borderRadius: '8px',
                      border: '1px solid var(--border)',
                      background: 'var(--background)',
                      color: 'var(--foreground)',
                      outline: 'none'
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Sort Option & Source Filter Side-by-Side */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--foreground)', marginBottom: '0.4rem' }}>
                  Sort Order
                </label>
                <select
                  value={sortOption}
                  onChange={(e) => setSortOption && setSortOption(e.target.value as any)}
                  style={{
                    width: '100%',
                    padding: '0.55rem',
                    fontSize: '0.85rem',
                    borderRadius: '8px',
                    border: '1px solid var(--border)',
                    background: 'var(--background)',
                    color: 'var(--foreground)',
                    outline: 'none',
                    cursor: 'pointer'
                  }}
                >
                  <option value="role_match">Role Match</option>
                  <option value="newest">Newest First</option>
                  <option value="score_desc">Match Score (High-Low)</option>
                  <option value="score_asc">Match Score (Low-High)</option>
                  <option value="company">Company (A-Z)</option>
                  <option value="salary_desc">Salary (High-Low)</option>
                  <option value="remote">Remote Jobs First</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--foreground)', marginBottom: '0.4rem' }}>
                  Job Source
                </label>
                <select
                  value={sourceFilter}
                  onChange={(e) => setSourceFilter(e.target.value as any)}
                  style={{
                    width: '100%',
                    padding: '0.55rem',
                    fontSize: '0.85rem',
                    borderRadius: '8px',
                    border: '1px solid var(--border)',
                    background: 'var(--background)',
                    color: 'var(--foreground)',
                    outline: 'none',
                    cursor: 'pointer'
                  }}
                >
                  <option value="both">All Sources</option>
                  <option value="scraped">Crawled / Direct</option>
                  <option value="email">Scraped via Email</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* Matching Count Preview Banner */}
        <div style={{
          background: 'rgba(0, 112, 243, 0.06)',
          border: '1px solid rgba(0, 112, 243, 0.2)',
          borderRadius: '8px',
          padding: '0.65rem 0.9rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: '0.85rem',
          color: 'var(--foreground)'
        }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 500 }}>
            <Sparkles size={15} style={{ color: '#0070f3' }} />
            Matching jobs in feed:
          </span>
          <span style={{ fontWeight: 700, color: '#0070f3', fontSize: '0.95rem' }}>
            {totalMatches} jobs
          </span>
        </div>

        {/* Footer Actions */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingTop: '0.5rem',
          borderTop: '1px solid var(--border)',
          marginTop: '0.25rem'
        }}>
          <button
            onClick={handleReset}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--muted-foreground)',
              cursor: 'pointer',
              fontSize: '0.825rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem',
              padding: '0.4rem 0.6rem',
              borderRadius: '6px'
            }}
          >
            <RotateCcw size={14} /> Reset
          </button>

          <button
            onClick={onClose}
            className="btn-primary"
            style={{
              fontSize: '0.825rem',
              padding: '0.45rem 1.2rem',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem'
            }}
          >
            Apply Filters
          </button>
        </div>
      </div>
    </Modal>
  );
}
