"use client";

import { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import { ExternalLink, Filter, Archive, Mail, LayoutGrid, List, Calendar } from 'lucide-react';
import SyncButton from '@/components/SyncButton';
import DashboardCleanup from '@/components/DashboardCleanup';
import { useRouter } from 'next/navigation';

export default function DashboardClient({ jobs }: { jobs: any[] }) {
  const router = useRouter();
  const [activeFilter, setActiveFilter] = useState<'all' | 'scored' | 'high_fit' | 'archived'>('all');
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
  const [isEmailSyncing, setIsEmailSyncing] = useState(false);
  const [sortOption, setSortOption] = useState<'newest' | 'score' | 'salary' | 'remote'>('newest');
  const [locationFilter, setLocationFilter] = useState<string>('all');
  const [sourceFilter, setSourceFilter] = useState<'both' | 'email' | 'scraped'>('both');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [fetchStatuses, setFetchStatuses] = useState<Record<string, 'fetching' | 'success' | 'error'>>({});
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState('');

  useEffect(() => {
    if (isSyncing) {
      const script = document.createElement('script');
      script.src = "https://tenor.com/embed.js";
      script.async = true;
      script.id = "tenor-embed-script";
      document.body.appendChild(script);

      document.body.style.overflow = 'hidden';

      return () => {
        const existingScript = document.getElementById("tenor-embed-script");
        if (existingScript) {
          existingScript.remove();
        }
        document.body.style.overflow = '';
      };
    }
  }, [isSyncing]);

  useEffect(() => {
    const saved = localStorage.getItem('jobAgentDashboardState');
    if (saved) {
      try {
        const state = JSON.parse(saved);
        if (state.activeFilter) setActiveFilter(state.activeFilter);
        if (state.viewMode) setViewMode(state.viewMode);
        if (state.sortOption) setSortOption(state.sortOption);
        if (state.locationFilter) setLocationFilter(state.locationFilter);
        if (state.sourceFilter) setSourceFilter(state.sourceFilter);
        if (state.startDate !== undefined) setStartDate(state.startDate);
        if (state.endDate !== undefined) setEndDate(state.endDate);
      } catch (e) {
        console.error('Failed to parse dashboard state from local storage', e);
      }
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('jobAgentDashboardState', JSON.stringify({
      activeFilter,
      viewMode,
      sortOption,
      locationFilter,
      sourceFilter,
      startDate,
      endDate
    }));
  }, [activeFilter, viewMode, sortOption, locationFilter, sourceFilter, startDate, endDate]);

  const handleFetchDetails = async (id: string) => {
    setFetchStatuses(prev => ({ ...prev, [id]: 'fetching' }));
    try {
      const res = await fetch(`/api/jobs/${id}/fetch-details`, { method: 'POST' });
      if (res.ok) {
        // Automatically rescore and regenerate after fetching new description
        await fetch('/api/score', { method: 'POST', body: JSON.stringify({}) });
        await fetch('/api/generate', { method: 'POST', body: JSON.stringify({}) });
        setFetchStatuses(prev => ({ ...prev, [id]: 'success' }));
        router.refresh();
      } else {
        console.error('Failed to fetch details');
        setFetchStatuses(prev => ({ ...prev, [id]: 'error' }));
      }
    } catch (e) {
      console.error(e);
      setFetchStatuses(prev => ({ ...prev, [id]: 'error' }));
    }
  };

  const unarchivedJobs = jobs?.filter(j => !j.is_archived) || [];
  const totalDiscovered = unarchivedJobs.length;
  const totalScored = unarchivedJobs.filter(j => j.status !== 'discovered').length;
  const highlyScored = unarchivedJobs.filter(j => j.opportunity_scores?.[0]?.total_score >= 80).length;
  const totalArchived = jobs?.filter(j => j.is_archived).length || 0;

  const handleEmailSync = async () => {
    setIsEmailSyncing(true);
    setIsSyncing(true);
    setSyncMessage('Syncing Emails...');
    try {
      const res = await fetch('/api/sync/email', { method: 'POST' });
      if (res.ok) {
        // Also score the new jobs
        setSyncMessage('Scoring Opportunities...');
        await fetch('/api/score', { method: 'POST', body: JSON.stringify({}) });
        // And generate assets
        setSyncMessage('Generating Assets...');
        await fetch('/api/generate', { method: 'POST', body: JSON.stringify({}) });
        router.refresh();
      } else {
        console.error('Failed to sync emails');
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsEmailSyncing(false);
      setIsSyncing(false);
      setSyncMessage('');
    }
  };

  const toggleArchive = async (id: string) => {
    try {
      const res = await fetch(`/api/jobs/${id}/archive`, { method: 'POST' });
      if (res.ok) {
        router.refresh();
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Extract unique locations for the filter dropdown
  const uniqueLocations = useMemo(() => {
    const locs = new Set<string>();
    jobs?.forEach(j => {
      if (!j.location) return;
      const locLower = j.location.toLowerCase();
      if (locLower.includes('remote')) {
        locs.add('Remote');
      } else {
        // Try to extract state (e.g. "Los Angeles, CA 90034" -> "CA")
        const match = j.location.match(/,\s*([A-Z]{2})\b/);
        if (match) locs.add(match[1]);
        else if (locLower.includes('united states') || locLower.includes('us')) locs.add('United States');
      }
    });
    return Array.from(locs).sort();
  }, [jobs]);

  // Helper to extract max salary for sorting
  const extractMaxSalary = (salaryStr: string | null) => {
    if (!salaryStr) return 0;
    const matches = salaryStr.match(/\$(\d{1,3}(?:,\d{3})*)/g);
    if (!matches) return 0;
    const numbers = matches.map(m => parseInt(m.replace(/[^\d]/g, ''), 10));
    return Math.max(...numbers);
  };

  const filteredAndSortedJobs = useMemo(() => {
    let result = [...(jobs || [])];

    // 0. Apply Source Filter (Email vs Scraped)
    if (sourceFilter === 'email') {
      result = result.filter(j => j.company?.includes('(Scraped via Email)'));
    } else if (sourceFilter === 'scraped') {
      result = result.filter(j => !j.company?.includes('(Scraped via Email)'));
    }

    // Apply Date Range Filter
    if (startDate) {
      result = result.filter(j => new Date(j.created_at) >= new Date(startDate));
    }
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      result = result.filter(j => new Date(j.created_at) <= end);
    }

    // 1. Apply Status Filter
    if (activeFilter === 'archived') {
      result = result.filter(j => j.is_archived);
    } else {
      result = result.filter(j => !j.is_archived);
      
      if (activeFilter === 'scored') {
        result = result.filter(j => j.status !== 'discovered');
      } else if (activeFilter === 'high_fit') {
        result = result.filter(j => j.opportunity_scores?.[0]?.total_score >= 80);
      }
    }

    // 2. Apply Location Filter
    if (locationFilter !== 'all') {
      result = result.filter(j => {
        if (!j.location) return false;
        if (locationFilter === 'Remote') return j.location.toLowerCase().includes('remote');
        if (locationFilter === 'United States') return j.location.toLowerCase().includes('united states') || j.location.toLowerCase().includes('us');
        return j.location.includes(locationFilter);
      });
    }

    // 3. Apply Sorting
    result.sort((a, b) => {
      if (sortOption === 'score') {
        const scoreA = a.opportunity_scores?.[0]?.total_score || 0;
        const scoreB = b.opportunity_scores?.[0]?.total_score || 0;
        return scoreB - scoreA;
      }
      if (sortOption === 'salary') {
        return extractMaxSalary(b.salary_range) - extractMaxSalary(a.salary_range);
      }
      if (sortOption === 'remote') {
        const isRemoteA = (a.location || '').toLowerCase().includes('remote') ? 1 : 0;
        const isRemoteB = (b.location || '').toLowerCase().includes('remote') ? 1 : 0;
        return isRemoteB - isRemoteA;
      }
      // default 'newest' (relying on initial order from server or created_at)
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

    return result;
  }, [jobs, activeFilter, locationFilter, sortOption, sourceFilter, startDate, endDate]);

  return (
    <div className="animate-fade-in">
      <div className="flex-stack-mobile" style={{ marginBottom: '2rem' }}>
        <div>
          <h1 className="page-title">Mission Control</h1>
          <p className="page-subtitle">Your central hub for opportunity management</p>
        </div>
        <div className="header-actions" style={{ display: 'flex', gap: '1rem' }}>
          <button 
            onClick={handleEmailSync} 
            disabled={isEmailSyncing || isSyncing}
            className="btn-outline" 
            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
          >
            <Mail size={16} />
            {isEmailSyncing ? 'Syncing...' : 'Sync Emails'}
          </button>
          <SyncButton onSyncStateChange={(loading, text) => {
            setIsSyncing(loading);
            setSyncMessage(text);
          }} />
        </div>
      </div>

      <div className="responsive-grid" style={{ marginBottom: '1.5rem' }}>
        <div 
          className={`glass-card filter-card top-stat-card ${activeFilter === 'all' ? 'active' : ''}`}
          onClick={() => setActiveFilter('all')}
          style={{ cursor: 'pointer', border: activeFilter === 'all' ? '1px solid var(--accent-primary)' : '' }}
        >
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Discovered (All)</p>
          <h2 style={{ fontSize: '2.5rem', color: 'var(--text-primary)' }}>{totalDiscovered}</h2>
        </div>
        <div 
          className={`glass-card filter-card top-stat-card ${activeFilter === 'scored' ? 'active' : ''}`}
          onClick={() => setActiveFilter('scored')}
          style={{ cursor: 'pointer', border: activeFilter === 'scored' ? '1px solid var(--accent-primary)' : '' }}
        >
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Scored</p>
          <h2 style={{ fontSize: '2.5rem', color: 'var(--text-primary)' }}>{totalScored}</h2>
        </div>
        <div 
          className={`glass-card filter-card top-stat-card ${activeFilter === 'high_fit' ? 'active' : ''}`}
          onClick={() => setActiveFilter('high_fit')}
          style={{ cursor: 'pointer', border: activeFilter === 'high_fit' ? '1px solid var(--accent-primary)' : '' }}
        >
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>High Fit (&gt;80)</p>
          <h2 style={{ fontSize: '2.5rem', color: 'var(--accent-primary)' }}>{highlyScored}</h2>
        </div>
        <div 
          className={`glass-card filter-card top-stat-card ${activeFilter === 'archived' ? 'active' : ''}`}
          onClick={() => setActiveFilter('archived')}
          style={{ cursor: 'pointer', border: activeFilter === 'archived' ? '1px solid var(--accent-primary)' : '' }}
        >
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Archived</p>
          <h2 style={{ fontSize: '2.5rem', color: 'var(--text-primary)' }}>{totalArchived}</h2>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem', background: 'rgba(255, 255, 255, 0.03)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--border-glass)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <h3 style={{ margin: 0, fontSize: '1.2rem' }}>Matches ({filteredAndSortedJobs.length})</h3>
          <DashboardCleanup onCleanupComplete={() => router.refresh()} />
        </div>
        
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Source:</span>
            <select 
              value={sourceFilter} 
              onChange={(e) => setSourceFilter(e.target.value as any)}
              style={{ background: 'var(--bg-color)', color: 'var(--text-primary)', border: '1px solid var(--border-glass)', padding: '0.4rem', borderRadius: '4px' }}
            >
              <option value="both">Both</option>
              <option value="email">Email Only</option>
              <option value="scraped">Scraped Only</option>
            </select>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Date:</span>
            <div className="date-picker-custom" title="Start Date">
              <Calendar size={14} color={startDate ? 'var(--accent-primary)' : 'var(--text-secondary)'} />
              {startDate && <span>{new Date(startDate).toLocaleDateString()}</span>}
              <input 
                type="date" 
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            
            <span style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>to</span>
            
            <div className="date-picker-custom" title="End Date">
              <Calendar size={14} color={endDate ? 'var(--accent-primary)' : 'var(--text-secondary)'} />
              {endDate && <span>{new Date(endDate).toLocaleDateString()}</span>}
              <input 
                type="date" 
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </div>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Filter size={16} color="var(--text-secondary)" />
            <select 
              value={locationFilter} 
              onChange={(e) => setLocationFilter(e.target.value)}
              style={{ background: 'var(--bg-color)', color: 'var(--text-primary)', border: '1px solid var(--border-glass)', padding: '0.4rem', borderRadius: '4px' }}
            >
              <option value="all">All Locations</option>
              {uniqueLocations.map(loc => (
                <option key={loc} value={loc}>{loc}</option>
              ))}
            </select>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Sort by:</span>
            <select 
              value={sortOption} 
              onChange={(e) => setSortOption(e.target.value as any)}
              style={{ background: 'var(--bg-color)', color: 'var(--text-primary)', border: '1px solid var(--border-glass)', padding: '0.4rem', borderRadius: '4px' }}
            >
              <option value="newest">Newest First</option>
              <option value="score">Score (High to Low)</option>
              <option value="salary">Salary (High to Low)</option>
              <option value="remote">Remote First</option>
            </select>
          </div>
          
          <div style={{ display: 'flex', border: '1px solid var(--border-glass)', borderRadius: '4px', overflow: 'hidden' }}>
            <button 
              onClick={() => setViewMode('grid')}
              style={{ background: viewMode === 'grid' ? 'rgba(255,255,255,0.1)' : 'transparent', color: viewMode === 'grid' ? 'var(--accent-primary)' : 'var(--text-secondary)', border: 'none', padding: '0.4rem 0.6rem', cursor: 'pointer' }}
              title="Grid View"
            >
              <LayoutGrid size={16} />
            </button>
            <button 
              onClick={() => setViewMode('table')}
              style={{ background: viewMode === 'table' ? 'rgba(255,255,255,0.1)' : 'transparent', color: viewMode === 'table' ? 'var(--accent-primary)' : 'var(--text-secondary)', border: 'none', padding: '0.4rem 0.6rem', cursor: 'pointer', borderLeft: '1px solid var(--border-glass)' }}
              title="Table View"
            >
              <List size={16} />
            </button>
          </div>
        </div>
      </div>
      
      {viewMode === 'table' ? (
        <div style={{ overflowX: 'auto', background: 'var(--bg-glass)', borderRadius: '12px', border: '1px solid var(--border-glass)', marginBottom: '2rem' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-glass)', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                <th style={{ padding: '1rem' }}>Company</th>
                <th style={{ padding: '1rem' }}>Role</th>
                <th style={{ padding: '1rem' }}>Location</th>
                <th style={{ padding: '1rem' }}>Score</th>
                <th style={{ padding: '1rem' }}>Status</th>
                <th style={{ padding: '1rem' }}>Date</th>
                <th style={{ padding: '1rem' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredAndSortedJobs.map(job => {
                  const score = job.opportunity_scores?.[0]?.total_score;
                  const scoreClass = !score ? '' : score >= 80 ? 'score-high' : 'score-med';
                  const isEmailJob = job.company?.includes('(Scraped via Email)');
                  
                  // job_feedback is a 1-to-1 relation, so it's an object or null, not an array.
                  // Sometimes Supabase might return it as an array if queried dynamically, so we handle both just in case.
                  const feedbackObj = Array.isArray(job.job_feedback) ? job.job_feedback[0] : job.job_feedback;
                  const isDisliked = feedbackObj?.feedback_type === 'dislike';
                  
                  const rowStyle: any = {
                    borderBottom: '1px solid rgba(255,255,255,0.05)',
                    opacity: isDisliked ? 0.5 : 1,
                    ...(isEmailJob ? { '--accent-primary': '#9041c3', '--accent-glow': 'rgba(144, 65, 195, 0.15)' } : {})
                  };
                  
                  return (
                    <tr key={job.id} style={rowStyle}>
                      <td style={{ padding: '1rem', fontWeight: 600, color: 'var(--accent-primary)', textTransform: 'uppercase', fontSize: '0.85rem' }}>{job.company}</td>
                      <td style={{ padding: '1rem' }}>
                        <Link href={`/job/${job.id}`} style={{ textDecoration: 'none', color: 'var(--text-primary)', fontWeight: 600, fontSize: '1.1rem' }}>
                          {job.title}
                        </Link>
                      </td>
                      <td style={{ padding: '1rem', color: 'var(--text-secondary)' }}>{job.location || 'Remote'}</td>
                      <td style={{ padding: '1rem' }}>{score ? <span className={`score-badge ${scoreClass}`} style={{ padding: '0.2rem 0.5rem', fontSize: '0.9rem', borderRadius: '4px' }}>{score}</span> : '-'}</td>
                      <td style={{ padding: '1rem', textTransform: 'capitalize' }}>
                        {job.status === 'applied' || job.applied_at ? (
                          <span className="badge badge-applied" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                            ✓ Applied {job.applied_at ? new Date(job.applied_at).toLocaleDateString() : ''}
                          </span>
                        ) : (
                          job.status.replace('_', ' ')
                        )}
                      </td>
                      <td style={{ padding: '1rem', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>{new Date(job.created_at).toLocaleDateString()}</td>
                      <td style={{ padding: '1rem' }}>
                        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'nowrap', alignItems: 'center' }}>
                          {isEmailJob && (!job.description || job.description.length < 500) && (
                             <button 
                               onClick={() => handleFetchDetails(job.id)} 
                               disabled={fetchStatuses[job.id] === 'fetching' || fetchStatuses[job.id] === 'success'} 
                               className={`btn-outline ${fetchStatuses[job.id] === 'error' ? 'error' : ''}`} 
                               style={{ 
                                 padding: '0.3rem 0.6rem', 
                                 fontSize: '0.75rem',
                                 borderColor: fetchStatuses[job.id] === 'error' ? 'var(--status-rejected)' : fetchStatuses[job.id] === 'success' ? 'var(--status-interview)' : '',
                                 color: fetchStatuses[job.id] === 'error' ? 'var(--status-rejected)' : fetchStatuses[job.id] === 'success' ? 'var(--status-interview)' : ''
                               }}
                             >
                               {fetchStatuses[job.id] === 'fetching' ? 'Fetching...' : 
                                fetchStatuses[job.id] === 'success' ? '✓ Fetched' : 
                                fetchStatuses[job.id] === 'error' ? 'Retry' : 'Fetch'}
                             </button>
                          )}
                          <button onClick={() => toggleArchive(job.id)} className="btn-outline" style={{ padding: '0.3rem 0.5rem', fontSize: '0.8rem' }} title={job.is_archived ? "Unarchive" : "Archive"}>
                            <Archive size={14} />
                          </button>
                          <Link href={`/job/${job.id}`} className="btn-primary" style={{ padding: '0.3rem 0.6rem', fontSize: '0.8rem' }}>
                            Details
                          </Link>
                          <a href={job.url} target="_blank" rel="noreferrer" className="btn-outline" style={{ padding: '0.3rem 0.6rem', fontSize: '0.8rem' }} title="Original">
                            <ExternalLink size={14} />
                          </a>
                        </div>
                      </td>
                    </tr>
                  );
              })}
              {filteredAndSortedJobs.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ padding: '3rem 1rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                    No jobs match your current filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="job-card-grid">
          {filteredAndSortedJobs.map((job) => {
            const score = job.opportunity_scores?.[0]?.total_score;
            const scoreClass = !score ? '' : score >= 80 ? 'score-high' : 'score-med';
            const isEmailJob = job.company?.includes('(Scraped via Email)');
            
            const feedbackObj = Array.isArray(job.job_feedback) ? job.job_feedback[0] : job.job_feedback;
            const isDisliked = feedbackObj?.feedback_type === 'dislike';
            
            const cardStyle: any = {
              opacity: isDisliked ? 0.5 : 1,
              boxShadow: isDisliked ? 'none' : undefined,
              ...(isEmailJob ? { '--accent-primary': '#9041c3', '--accent-glow': 'rgba(144, 65, 195, 0.15)' } : {})
            };
            
            return (
              <div key={job.id} className="glass-card job-card" style={cardStyle}>
                <div className="job-header">
                  <div>
                    <div className="job-company">
                      {job.company}
                    </div>
                    <Link href={`/job/${job.id}`} style={{ textDecoration: 'none' }} className="job-title">
                      <h3 style={{ cursor: 'pointer', margin: 0 }}>{job.title}</h3>
                    </Link>
                  </div>
                  {score && (
                    <div className={`score-badge ${scoreClass}`}>
                      {score}
                    </div>
                  )}
                </div>
                
                <div className="job-meta">
                  <span className="job-meta-item">📍 {job.location || 'Remote'}</span>
                  <span className="job-meta-item">💰 {job.salary_range || 'Unlisted'}</span>
                  <span className="job-meta-item" style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                    🕒 {new Date(job.created_at).toLocaleDateString()}
                  </span>
                </div>
                
                <div style={{ marginTop: 'auto', marginBottom: '1rem' }}>
                  {job.status === 'applied' || job.applied_at ? (
                    <span className="badge badge-applied" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                      ✓ Applied {job.applied_at ? new Date(job.applied_at).toLocaleDateString() : ''}
                    </span>
                  ) : (
                    <span className={`badge badge-${job.status}`}>{job.status.replace('_', ' ')}</span>
                  )}
                </div>
                
                <div style={{ paddingTop: '1rem', borderTop: '1px solid var(--border-glass)', display: 'flex', justifyContent: 'flex-start', alignItems: 'center' }}>
                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', justifyContent: 'flex-start' }}>
                    {job.company?.includes('(Scraped via Email)') && (!job.description || job.description.length < 500) && (
                       <button 
                         onClick={() => handleFetchDetails(job.id)} 
                         disabled={fetchStatuses[job.id] === 'fetching' || fetchStatuses[job.id] === 'success'} 
                         className={`btn-outline ${fetchStatuses[job.id] === 'error' ? 'error' : ''}`} 
                         style={{ 
                           padding: '0.4rem 0.8rem', 
                           fontSize: '0.85rem',
                           borderColor: fetchStatuses[job.id] === 'error' ? 'var(--status-rejected)' : fetchStatuses[job.id] === 'success' ? 'var(--status-interview)' : '',
                           color: fetchStatuses[job.id] === 'error' ? 'var(--status-rejected)' : fetchStatuses[job.id] === 'success' ? 'var(--status-interview)' : ''
                         }}
                       >
                         {fetchStatuses[job.id] === 'fetching' ? 'Fetching...' : 
                          fetchStatuses[job.id] === 'success' ? '✓ Fetched' : 
                          fetchStatuses[job.id] === 'error' ? 'Failed - Retry' : 'Fetch Details'}
                       </button>
                    )}
                    <button onClick={() => toggleArchive(job.id)} className="btn-outline" style={{ padding: '0.4rem 0.6rem', fontSize: '0.85rem' }} title={job.is_archived ? "Unarchive" : "Archive"}>
                      <Archive size={14} />
                    </button>
                    <Link href={`/job/${job.id}`} className="btn-primary" style={{ padding: '0.4rem 0.8rem', fontSize: '0.85rem' }}>
                      Details
                    </Link>
                    <a href={job.url} target="_blank" rel="noreferrer" className="btn-outline" style={{ padding: '0.4rem 0.8rem', fontSize: '0.85rem' }}>
                      Original <ExternalLink size={14} />
                    </a>
                  </div>
                </div>
              </div>
            );
          })}
  
          {filteredAndSortedJobs.length === 0 && (
            <div className="glass-card" style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '4rem 2rem' }}>
              <p style={{ color: 'var(--text-secondary)', fontSize: '1.1rem' }}>No jobs match your current filters.</p>
              {jobs.length === 0 && (
                <p style={{ marginTop: '0.5rem', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Run the scraping pipeline to populate your dashboard.</p>
              )}
            </div>
          )}
        </div>
      )}

      {isSyncing && (
        <div className="sync-overlay-backdrop">
          <div className="sync-overlay-content">
            <h2>Syncing in Progress</h2>
            <p className="sync-overlay-text">{syncMessage}</p>
            <p className="sync-overlay-subtext">
              This could take up to a minute to complete.<br />
              Please do not close or refresh this page.
            </p>
            <div className="tenor-gif-container">
              <div 
                className="tenor-gif-embed" 
                data-postid="18485855" 
                data-share-method="host" 
                data-aspect-ratio="1" 
                data-width="100%"
              >
                <a href="https://tenor.com/view/o2-o2robot-o2ad-bubl-o2bubl-gif-18485855">O2 O2robot GIF</a>
                from <a href="https://tenor.com/search/o2-gifs">O2 GIFs</a>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
