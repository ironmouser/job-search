"use client";

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Filter, SlidersHorizontal, X, Search, Calendar, MapPin, Check, RotateCcw } from 'lucide-react';

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
  sortOption = 'newest',
  setSortOption
}: DashboardFilterModalProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!isOpen || !mounted) return null;

  const hasActiveFilters = Boolean(
    keywordFilter ||
    sourceFilter !== 'both' ||
    startDate ||
    endDate ||
    locationFilter.length > 0 ||
    sortOption !== 'newest'
  );

  const handleClearAll = () => {
    setKeywordFilter('');
    setSourceFilter('both');
    setStartDate('');
    setEndDate('');
    setLocationFilter([]);
    if (setSortOption) setSortOption('newest');
  };

  const modalContent = (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem'
      }}
      onClick={onClose}
    >
      <div
        className="glass-card"
        style={{
          backgroundColor: 'var(--bg-surface, #0f172a)',
          border: '1px solid var(--border-glass, rgba(255, 255, 255, 0.12))',
          borderRadius: '16px',
          padding: '1.75rem',
          maxWidth: '600px',
          width: '100%',
          maxHeight: '90vh',
          overflowY: 'auto',
          position: 'relative',
          boxShadow: '0 20px 40px rgba(0, 0, 0, 0.5)',
          color: 'var(--text-primary, #f8fafc)'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <SlidersHorizontal size={22} style={{ color: 'var(--accent-primary, #3b82f6)' }} />
            <h2 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 700 }}>Filter & Search Jobs</h2>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-secondary, #94a3b8)',
              cursor: 'pointer',
              padding: '4px'
            }}
            title="Close filter modal"
          >
            <X size={20} />
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* Keyword Search */}
          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.4rem', color: 'var(--text-secondary, #94a3b8)' }}>
              Keyword or Description
            </label>
            <div style={{ position: 'relative' }}>
              <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
              <input
                type="text"
                placeholder="Filter title, company, or description words..."
                value={keywordFilter}
                onChange={(e) => setKeywordFilter(e.target.value)}
                style={{
                  width: '100%',
                  height: '42px',
                  padding: '0 2.5rem 0 2.4rem',
                  borderRadius: '10px',
                  border: '1px solid var(--border-glass, rgba(255, 255, 255, 0.15))',
                  background: 'rgba(255, 255, 255, 0.05)',
                  color: 'var(--text-primary)',
                  fontSize: '0.9rem',
                  outline: 'none'
                }}
              />
              {keywordFilter && (
                <button
                  onClick={() => setKeywordFilter('')}
                  style={{
                    position: 'absolute',
                    right: '10px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-secondary)',
                    cursor: 'pointer',
                    padding: '2px'
                  }}
                  title="Clear keyword"
                >
                  <X size={16} />
                </button>
              )}
            </div>
          </div>

          {/* Job Source */}
          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.4rem', color: 'var(--text-secondary, #94a3b8)' }}>
              Job Source
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem' }}>
              {[
                { id: 'both', label: 'All Sources' },
                { id: 'email', label: 'Email Only' },
                { id: 'scraped', label: 'Scraped Only' }
              ].map((src) => (
                <button
                  key={src.id}
                  type="button"
                  onClick={() => setSourceFilter(src.id as any)}
                  style={{
                    padding: '0.6rem 0.8rem',
                    borderRadius: '8px',
                    border: sourceFilter === src.id ? '1px solid var(--accent-primary, #3b82f6)' : '1px solid var(--border-glass, rgba(255,255,255,0.12))',
                    background: sourceFilter === src.id ? 'rgba(59, 130, 246, 0.15)' : 'rgba(255, 255, 255, 0.03)',
                    color: sourceFilter === src.id ? 'var(--accent-primary, #3b82f6)' : 'var(--text-primary)',
                    fontSize: '0.85rem',
                    fontWeight: sourceFilter === src.id ? 600 : 400,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                >
                  {src.label}
                </button>
              ))}
            </div>
          </div>

          {/* Sort Option */}
          {setSortOption && (
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.4rem', color: 'var(--text-secondary, #94a3b8)' }}>
                Sort Jobs By
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: '0.5rem' }}>
                {[
                  { id: 'newest', label: 'Newest First' },
                  { id: 'score', label: 'Match Score' },
                  { id: 'salary', label: 'Highest Salary' },
                  { id: 'remote', label: 'Remote First' }
                ].map((sort) => (
                  <button
                    key={sort.id}
                    type="button"
                    onClick={() => setSortOption(sort.id as any)}
                    style={{
                      padding: '0.6rem 0.6rem',
                      borderRadius: '8px',
                      border: sortOption === sort.id ? '1px solid var(--accent-primary, #3b82f6)' : '1px solid var(--border-glass, rgba(255,255,255,0.12))',
                      background: sortOption === sort.id ? 'rgba(59, 130, 246, 0.15)' : 'rgba(255, 255, 255, 0.03)',
                      color: sortOption === sort.id ? 'var(--accent-primary, #3b82f6)' : 'var(--text-primary)',
                      fontSize: '0.85rem',
                      fontWeight: sortOption === sort.id ? 600 : 400,
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                      textAlign: 'center'
                    }}
                  >
                    {sort.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Date Range */}
          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.4rem', color: 'var(--text-secondary, #94a3b8)' }}>
              Discovery Date Range
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <div>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.2rem' }}>From</span>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  style={{
                    width: '100%',
                    height: '38px',
                    padding: '0 0.75rem',
                    borderRadius: '8px',
                    border: '1px solid var(--border-glass, rgba(255,255,255,0.15))',
                    background: 'rgba(255, 255, 255, 0.05)',
                    color: 'var(--text-primary)',
                    fontSize: '0.85rem'
                  }}
                />
              </div>
              <div>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.2rem' }}>To</span>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  style={{
                    width: '100%',
                    height: '38px',
                    padding: '0 0.75rem',
                    borderRadius: '8px',
                    border: '1px solid var(--border-glass, rgba(255,255,255,0.15))',
                    background: 'rgba(255, 255, 255, 0.05)',
                    color: 'var(--text-primary)',
                    fontSize: '0.85rem'
                  }}
                />
              </div>
            </div>
          </div>

          {/* Location Filters */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
              <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary, #94a3b8)' }}>
                Locations ({locationFilter.length > 0 ? `${locationFilter.length} selected` : 'All'})
              </label>
              {locationFilter.length > 0 && (
                <button
                  type="button"
                  onClick={() => setLocationFilter([])}
                  style={{ background: 'none', border: 'none', color: 'var(--accent-primary)', fontSize: '0.75rem', cursor: 'pointer', fontWeight: 600 }}
                >
                  Clear location filters
                </button>
              )}
            </div>

            <div
              style={{
                maxHeight: '160px',
                overflowY: 'auto',
                border: '1px solid var(--border-glass, rgba(255,255,255,0.15))',
                borderRadius: '10px',
                padding: '0.5rem',
                background: 'rgba(255, 255, 255, 0.02)',
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
                gap: '0.35rem'
              }}
            >
              {uniqueLocations.map((loc) => {
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
                      color: isChecked ? 'var(--accent-primary)' : 'var(--text-primary)',
                      background: isChecked ? 'rgba(59, 130, 246, 0.12)' : 'transparent',
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
                      style={{ accentColor: 'var(--accent-primary)', width: '14px', height: '14px', cursor: 'pointer' }}
                    />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{loc}</span>
                  </label>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '1.5rem', paddingTop: '1rem', borderTop: '1px solid var(--border-glass, rgba(255,255,255,0.1))' }}>
          <div>
            {hasActiveFilters && (
              <button
                type="button"
                onClick={handleClearAll}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--danger, #ef4444)',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.35rem'
                }}
              >
                <RotateCcw size={14} /> Reset All
              </button>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              <strong>{totalMatches}</strong> matching jobs
            </span>
            <button
              type="button"
              onClick={onClose}
              className="btn-primary"
              style={{
                padding: '0.55rem 1.4rem',
                borderRadius: '10px',
                fontSize: '0.9rem',
                fontWeight: 600
              }}
            >
              Apply Filters
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
