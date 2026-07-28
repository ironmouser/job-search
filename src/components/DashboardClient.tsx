"use client";

import { useState, useMemo, useEffect, useRef } from 'react';
import Link from 'next/link';
import { ExternalLink, Filter, Archive, Mail, LayoutGrid, List, Calendar, MapPin, DollarSign, Clock, CheckCircle2, Check, Trash2, Lock, Sparkles, Zap, ArrowRight, Search, X } from 'lucide-react';
import { cleanCompanyName } from '@/lib/cleaners';
import FeedbackButtons from '@/components/FeedbackButtons';
import SyncButton from '@/components/SyncButton';
import DashboardCleanup from '@/components/DashboardCleanup';
import { useRouter, useSearchParams } from 'next/navigation';
import OnboardingWidget from '@/components/common/OnboardingWidget';
import AddJobUrlBar from '@/components/AddJobUrlBar';
import { useDashboardFeedbackNudge } from '@/hooks/useDashboardFeedbackNudge';

import SyncOverlay from './SyncOverlay';

const safeFormatDate = (dateVal: any) => {
  if (!dateVal) return '';
  const d = new Date(dateVal);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { timeZone: 'UTC', year: 'numeric', month: 'numeric', day: 'numeric' });
};

const getConfidenceBadge = (score?: number) => {
    if (score === undefined) return null;
    if (score >= 70) return <span title="High Automation Confidence" style={{ color: '#10b981', background: 'rgba(16, 185, 129, 0.1)', padding: '2px 6px', borderRadius: '12px', fontSize: '0.7rem', fontWeight: 600 }}>High Auto</span>;
    if (score >= 40) return <span title="Medium Automation Confidence" style={{ color: '#fbbf24', background: 'rgba(251, 191, 36, 0.1)', padding: '2px 6px', borderRadius: '12px', fontSize: '0.7rem', fontWeight: 600 }}>Med Auto</span>;
    return null;
};

export default function DashboardClient({ jobs, userPlanTier = 'FREE', hasEmailCredentials = false, initialScoresExhausted = false }: { jobs: any[], userPlanTier?: string, hasEmailCredentials?: boolean, initialScoresExhausted?: boolean }) {
  const router = useRouter();
  const [jobList, setJobList] = useState<any[]>(jobs || []);
  const [scoresExhausted, setScoresExhausted] = useState(initialScoresExhausted);

  useEffect(() => {
    setJobList(jobs || []);
  }, [jobs]);

  const [activeFilter, setActiveFilter] = useState<'all' | 'scored' | 'high_fit' | 'archived'>('all');
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
  const [isEmailSyncing, setIsEmailSyncing] = useState(false);
  const [sortOption, setSortOption] = useState<'newest' | 'score' | 'salary' | 'remote' | 'auto_apply'>('newest');
  const [locationFilter, setLocationFilter] = useState<string>('all');
  const [sourceFilter, setSourceFilter] = useState<'both' | 'email' | 'scraped'>('both');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [keywordFilter, setKeywordFilter] = useState<string>('');
  const [fetchStatuses, setFetchStatuses] = useState<Record<string, 'fetching' | 'success' | 'error' | 'queued'>>({});
  const [fetchQueue, setFetchQueue] = useState<{id: string, title: string, company: string}[]>([]);
  const [activeFetches, setActiveFetches] = useState<{id: string, title: string, company: string}[]>([]);
  const [showQueueOverlay, setShowQueueOverlay] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState('');
  const [checkedJobs, setCheckedJobs] = useState<Set<string>>(new Set());
  const [activeAnimIndex, setActiveAnimIndex] = useState(0);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [confettiJobId, setConfettiJobId] = useState<string | null>(null);

  const searchParams = useSearchParams();
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState<number>(20);
  const scoringInProgress = useRef(new Set<string>());
  const isPageInitialized = useRef(false);

  // Trigger confetti on the card of the job the user just applied to
  useEffect(() => {
    const sessionId = typeof window !== 'undefined' ? sessionStorage.getItem('just_applied_job_id') : null;
    const urlId = searchParams?.get('justApplied');
    const targetId = urlId || sessionId;
    if (!targetId) return;

    setConfettiJobId(targetId);

    // Clean up storage and URL param so confetti only fires once
    if (sessionId) sessionStorage.removeItem('just_applied_job_id');
    if (urlId && typeof window !== 'undefined') {
      const next = new URL(window.location.href);
      next.searchParams.delete('justApplied');
      window.history.replaceState({}, '', next.toString());
    }

    // Remove the class after 3 seconds
    const timer = setTimeout(() => setConfettiJobId(null), 3000);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Restore page number and items per page from URL, localStorage, or sessionStorage on mount
  useEffect(() => {
    const urlPage = searchParams?.get('page');
    const urlLimit = searchParams?.get('limit') || searchParams?.get('perPage');

    const saved = localStorage.getItem('jobAgentDashboardState');
    let stateFromStorage: any = {};
    if (saved) {
      try {
        stateFromStorage = JSON.parse(saved);
        if (stateFromStorage.activeFilter) setActiveFilter(stateFromStorage.activeFilter);
        if (stateFromStorage.viewMode) setViewMode(stateFromStorage.viewMode);
        if (stateFromStorage.sortOption) setSortOption(stateFromStorage.sortOption);
        if (stateFromStorage.locationFilter) setLocationFilter(stateFromStorage.locationFilter);
        if (stateFromStorage.sourceFilter) setSourceFilter(stateFromStorage.sourceFilter);
        if (stateFromStorage.startDate !== undefined) setStartDate(stateFromStorage.startDate);
        if (stateFromStorage.endDate !== undefined) setEndDate(stateFromStorage.endDate);
        if (stateFromStorage.keywordFilter !== undefined) setKeywordFilter(stateFromStorage.keywordFilter);
      } catch (e) {
        console.error('Failed to parse dashboard state from local storage', e);
      }
    }

    // Determine initial page number
    const savedPageStr = urlPage || stateFromStorage.currentPage || (typeof window !== 'undefined' ? (localStorage.getItem('dashboard_page') || sessionStorage.getItem('dashboard_page')) : null);
    if (savedPageStr) {
      const pageNum = parseInt(savedPageStr.toString(), 10);
      if (!isNaN(pageNum) && pageNum > 0) {
        setCurrentPage(pageNum);
      }
    }

    // Determine initial items per page limit
    const savedLimitStr = urlLimit || stateFromStorage.itemsPerPage || (typeof window !== 'undefined' ? (localStorage.getItem('dashboard_items_per_page') || sessionStorage.getItem('dashboard_items_per_page')) : null);
    if (savedLimitStr) {
      const limitNum = parseInt(savedLimitStr.toString(), 10);
      if (!isNaN(limitNum) && limitNum > 0) {
        setItemsPerPage(limitNum);
      }
    }

    setIsLoaded(true);
    isPageInitialized.current = true;
  }, [searchParams]);

  const changePage = (newPage: number) => {
    setCurrentPage(newPage);
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('dashboard_page', newPage.toString());
      localStorage.setItem('dashboard_page', newPage.toString());
      try {
        const saved = localStorage.getItem('jobAgentDashboardState');
        const stateObj = saved ? JSON.parse(saved) : {};
        stateObj.currentPage = newPage;
        localStorage.setItem('jobAgentDashboardState', JSON.stringify(stateObj));
      } catch (e) {}

      const params = new URLSearchParams(window.location.search);
      params.set('page', newPage.toString());
      params.set('limit', itemsPerPage.toString());
      window.history.replaceState(null, '', `?${params.toString()}`);
    }
  };

  const changeItemsPerPage = (newLimit: number) => {
    setItemsPerPage(newLimit);
    setCurrentPage(1);
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('dashboard_page', '1');
      localStorage.setItem('dashboard_page', '1');
      sessionStorage.setItem('dashboard_items_per_page', newLimit.toString());
      localStorage.setItem('dashboard_items_per_page', newLimit.toString());

      try {
        const saved = localStorage.getItem('jobAgentDashboardState');
        const stateObj = saved ? JSON.parse(saved) : {};
        stateObj.itemsPerPage = newLimit;
        stateObj.currentPage = 1;
        localStorage.setItem('jobAgentDashboardState', JSON.stringify(stateObj));
      } catch (e) {}

      const params = new URLSearchParams(window.location.search);
      params.set('page', '1');
      params.set('limit', newLimit.toString());
      window.history.replaceState(null, '', `?${params.toString()}`);
    }
  };

  const handleMarkViewed = (jobId: string) => {
    fetch(`/api/jobs/${jobId}/viewed`, { method: 'POST' }).catch(() => {});
    setJobList(prev => prev.map(j => j.id === jobId ? { ...j, is_viewed: true, isViewed: true } : j));
  };

  const toggleJobCheck = (id: string) => {
    setCheckedJobs(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAllChecks = () => {
    if (checkedJobs.size === filteredAndSortedJobs.length && filteredAndSortedJobs.length > 0) {
      setCheckedJobs(new Set());
    } else {
      setCheckedJobs(new Set(filteredAndSortedJobs.map(j => j.id)));
    }
  };

  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    if (!isLoaded) return;
    localStorage.setItem('jobAgentDashboardState', JSON.stringify({
      activeFilter,
      viewMode,
      sortOption,
      locationFilter,
      sourceFilter,
      startDate,
      endDate,
      keywordFilter,
      itemsPerPage,
      currentPage
    }));
    localStorage.setItem('dashboard_page', currentPage.toString());
    localStorage.setItem('dashboard_items_per_page', itemsPerPage.toString());
    sessionStorage.setItem('dashboard_page', currentPage.toString());
    sessionStorage.setItem('dashboard_items_per_page', itemsPerPage.toString());

    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      params.set('page', currentPage.toString());
      params.set('limit', itemsPerPage.toString());
      window.history.replaceState(null, '', `?${params.toString()}`);
    }
  }, [activeFilter, viewMode, sortOption, locationFilter, sourceFilter, startDate, endDate, keywordFilter, itemsPerPage, currentPage, isLoaded]);

  const handleQueueFetch = (job: { id: string, title: string, company: string }) => {
    if (fetchStatuses[job.id] === 'fetching' || fetchStatuses[job.id] === 'queued' || fetchStatuses[job.id] === 'success') return;
    setFetchStatuses(prev => ({ ...prev, [job.id]: 'queued' }));
    setFetchQueue(prev => [...prev, job]);
    setShowQueueOverlay(true);
  };

  const processFetchDetails = async (jobItem: {id: string, title: string, company: string}) => {
    setFetchStatuses(prev => ({ ...prev, [jobItem.id]: 'fetching' }));
    try {
      const res = await fetch(`/api/jobs/${jobItem.id}/fetch-details`, { method: 'POST' });
      if (res.ok) {
        if (userPlanTier === 'PRO') {
          await fetch('/api/score', { method: 'POST', body: JSON.stringify({}) }).catch(() => {});
        }
        setFetchStatuses(prev => ({ ...prev, [jobItem.id]: 'success' }));
        router.refresh();
      } else {
        setFetchStatuses(prev => ({ ...prev, [jobItem.id]: 'error' }));
      }
    } catch (e) {
      setFetchStatuses(prev => ({ ...prev, [jobItem.id]: 'error' }));
    } finally {
      setActiveFetches(prev => prev.filter(f => f.id !== jobItem.id));
    }
  };

  useEffect(() => {
    if (activeFetches.length < 3 && fetchQueue.length > 0) {
      const slotsAvailable = 3 - activeFetches.length;
      const nextItems = fetchQueue.slice(0, slotsAvailable);
      
      setFetchQueue(prev => prev.slice(slotsAvailable));
      setActiveFetches(prev => [...prev, ...nextItems]);
      
      nextItems.forEach(item => {
        processFetchDetails(item);
      });
    }
  }, [fetchQueue, activeFetches]);

  useEffect(() => {
    if (activeFetches.length === 0 && fetchQueue.length === 0 && showQueueOverlay) {
      const timeout = setTimeout(() => setShowQueueOverlay(false), 3000);
      return () => clearTimeout(timeout);
    }
  }, [activeFetches, fetchQueue, showQueueOverlay]);

  const removeQueuedItem = (id: string) => {
    setFetchQueue(prev => prev.filter(item => item.id !== id));
    setFetchStatuses(prev => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  const hasJobScore = (j: any) => {
    const scoreVal = j.opportunity_scores?.[0]?.total_score;
    return j.status === 'scored' || (scoreVal !== undefined && scoreVal !== null);
  };

  const getEffectiveStatus = (job: any) => {
    if (job.status === 'applied' || job.applied_at) return 'applied';
    if (job.status === 'interviewing') return 'interviewing';
    if (job.is_archived) return 'archived';
    if (hasJobScore(job)) return 'scored';
    return job.status || 'discovered';
  };

  const unarchivedJobs = jobList?.filter(j => !j.is_archived) || [];
  const totalDiscovered = unarchivedJobs.length;
  const totalScored = unarchivedJobs.filter(j => hasJobScore(j)).length;
  const highlyScored = unarchivedJobs.filter(j => j.opportunity_scores?.[0]?.total_score >= 80).length;
  const totalArchived = jobList?.filter(j => j.is_archived).length || 0;

  const handleEmailSync = async () => {
    if (userPlanTier !== 'PRO') {
      setShowUpgradeModal(true);
      return;
    }
    if (!hasEmailCredentials) {
      setShowConfigModal(true);
      return;
    }

    setIsEmailSyncing(true);
    setIsSyncing(true);
    setSyncMessage('Syncing Emails...');
    try {
      const res = await fetch('/api/sync/email', { method: 'POST' });
      const data = await res.json().catch(() => ({ error: 'Failed to parse response' }));

      if (res.ok && data.success) {
        if (data.count === 0) {
          alert('Email sync complete! We scanned your inbox and found 0 new job opportunities since your last sync.');
        } else {
          setSyncMessage(`Found ${data.count} new opportunit${data.count === 1 ? 'y' : 'ies'}! Scoring...`);
          await fetch('/api/score', { method: 'POST', body: JSON.stringify({}) });
          router.refresh();
        }
      } else {
        const errorMsg = data.error || 'Failed to sync emails';
        console.error('Failed to sync emails:', errorMsg);
        alert(errorMsg);
        if (errorMsg.toLowerCase().includes('credential') || 
            errorMsg.toLowerCase().includes('password') || 
            errorMsg.toLowerCase().includes('setting') ||
            errorMsg.toLowerCase().includes('authentication')) {
          setShowConfigModal(true);
        }
      }
    } catch (e) {
      console.error(e);
      alert('An unexpected error occurred while syncing emails.');
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

  const deleteJob = async (id: string) => {
    if (!confirm('Are you sure you want to delete this job?')) return;
    setJobList(prev => prev ? prev.filter(j => j.id !== id) : []);
    try {
      const res = await fetch(`/api/jobs/${id}`, { method: 'DELETE' });
      if (res.ok) {
        router.refresh();
      } else {
        throw new Error('Failed to delete job');
      }
    } catch (e) {
      console.error(e);
      alert('Failed to delete job.');
      router.refresh();
    }
  };

  // Extract unique locations for the filter dropdown
  const uniqueLocations = useMemo(() => {
    const locs = new Set<string>();
    jobList?.forEach(j => {
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
  }, [jobList]);

  // Helper to extract max salary for sorting
  const extractMaxSalary = (salaryStr: string | null) => {
    if (!salaryStr) return 0;
    const matches = salaryStr.match(/\$(\d{1,3}(?:,\d{3})*)/g);
    if (!matches) return 0;
    const numbers = matches.map(m => parseInt(m.replace(/[^\d]/g, ''), 10));
    return Math.max(...numbers);
  };

  const filteredAndSortedJobs = useMemo(() => {
    let result = [...(jobList || [])];

    // Keyword / Description / Title Filter
    if (keywordFilter.trim()) {
      const terms = keywordFilter.toLowerCase().trim().split(/\s+/).filter(Boolean);
      result = result.filter(j => {
        const fullText = `${j.title || ''} ${j.company || ''} ${j.location || ''} ${j.description || ''}`.toLowerCase();
        return terms.every(term => fullText.includes(term));
      });
    }

    // 0. Apply Source Filter (Email vs Scraped)
    if (sourceFilter === 'email') {
      result = result.filter(j => j.company?.includes('(Scraped via Email)') || j.source?.toLowerCase().includes('email'));
    } else if (sourceFilter === 'scraped') {
      result = result.filter(j => !j.company?.includes('(Scraped via Email)') && !j.source?.toLowerCase().includes('email'));
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
        result = result.filter(j => hasJobScore(j));
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
      if (sortOption === 'auto_apply') {
        const confA = a.automation_confidence || 0;
        const confB = b.automation_confidence || 0;
        // If confidence is the same, fallback to score or newest
        if (confB !== confA) return confB - confA;
      }
      // default 'newest' (relying on initial order from server or created_at)
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

    return result;
  }, [jobList, activeFilter, locationFilter, sortOption, sourceFilter, startDate, endDate, keywordFilter]);

  const isInitialMount = useRef(true);

  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    changePage(1);
  }, [activeFilter, sortOption, locationFilter, sourceFilter, startDate, endDate, keywordFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredAndSortedJobs.length / itemsPerPage));
  
  useEffect(() => {
    if (isLoaded && currentPage > totalPages && totalPages > 0) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages, isLoaded]);

  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = Math.min(startIndex + itemsPerPage, filteredAndSortedJobs.length);
  const currentJobs = filteredAndSortedJobs.slice(startIndex, endIndex);

  const { nudgeJobId, handleDismiss: handleNudgeDismiss, handleFeedbackGiven: handleNudgeFeedbackGiven } = useDashboardFeedbackNudge(currentJobs);

  useEffect(() => {
    if (userPlanTier !== 'PRO' && scoresExhausted) return;

    const isUnscored = (j: any) => (!j.opportunity_scores || j.opportunity_scores.length === 0);
    const hasDescription = (j: any) => !!(j.description && j.description.trim().length > 50);

    const unscoredCurrentJobs = currentJobs.filter(j => isUnscored(j) && hasDescription(j) && !scoringInProgress.current.has(j.id));
    const otherUnscoredJobs = filteredAndSortedJobs.filter(j => isUnscored(j) && hasDescription(j) && !currentJobs.find(cj => cj.id === j.id) && !scoringInProgress.current.has(j.id));

    if (unscoredCurrentJobs.length === 0 && otherUnscoredJobs.length === 0) return;

    // Debounce: wait 500ms before firing to avoid overlapping calls on rapid re-renders
    const timer = setTimeout(() => {
      if (unscoredCurrentJobs.length > 0) {
        const chunk = unscoredCurrentJobs.slice(0, 10);
        chunk.forEach(j => scoringInProgress.current.add(j.id));
        
        const scoreCurrent = async () => {
          try {
            const res = await fetch('/api/score', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ jobIds: chunk.map(j => j.id) })
            });
            if (!res.ok) {
              if (res.status === 403) {
                setScoresExhausted(true);
                return;
              }
              const errorData = await res.json().catch(() => ({}));
              throw new Error(`Status ${res.status}: ${JSON.stringify(errorData)}`);
            }
            router.refresh();
          } catch (e) {
            console.error('Failed to score current jobs:', e);
          } finally {
            chunk.forEach(j => scoringInProgress.current.delete(j.id));
          }
        };
        scoreCurrent();
      } else if (otherUnscoredJobs.length > 0) {
        const chunk = otherUnscoredJobs.slice(0, 10);
        chunk.forEach(j => scoringInProgress.current.add(j.id));

        const scoreBackground = async () => {
          try {
            const res = await fetch('/api/score', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ jobIds: chunk.map(j => j.id) })
            });
            if (!res.ok) {
              if (res.status === 403) {
                setScoresExhausted(true);
                return;
              }
              const errorData = await res.json().catch(() => ({}));
              throw new Error(`Status ${res.status}: ${errorData.message || JSON.stringify(errorData)}`);
            }
            router.refresh();
          } catch (e) {
            console.error('Failed to background score jobs:', e);
          } finally {
            chunk.forEach(j => scoringInProgress.current.delete(j.id));
          }
        };
        scoreBackground();
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [currentJobs, filteredAndSortedJobs, router, userPlanTier, scoresExhausted]);

  return (
    <>
      <OnboardingWidget />
      <div className="animate-fade-in">
        <div className="flex-stack-mobile" style={{ marginBottom: '2rem' }}>
        <div>
          <h1 className="page-title">Mission Control</h1>
          <p className="page-subtitle">Your central hub for opportunity management</p>
        </div>
        <div className="header-actions" style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <button 
            onClick={handleEmailSync} 
            disabled={isEmailSyncing || isSyncing}
            className="btn-outline" 
            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
          >
            <Mail size={16} />
            {isEmailSyncing ? 'Syncing...' : 'Sync Emails'}
          </button>
          <div data-tour="dashboard-sync-jobs">
            <SyncButton onSyncStateChange={(loading, text) => {
              setIsSyncing(loading);
              setSyncMessage(text);
            }} />
          </div>
        </div>
      </div>

        {userPlanTier !== 'PRO' && (
          <div 
            className="glass-card" 
            style={{ 
              marginBottom: '2rem', 
              padding: '1.5rem 2rem', 
              background: 'linear-gradient(135deg, rgba(38, 99, 235, 0.12) 0%, rgba(168, 85, 247, 0.12) 100%)', 
              border: '1px solid rgba(168, 85, 247, 0.3)',
              borderRadius: '12px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '1.5rem'
            }}
          >
            <div style={{ flex: 1, minWidth: '280px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                <span style={{ 
                  background: 'linear-gradient(135deg, #a855f7 0%, #3b82f6 100%)', 
                  color: '#fff', 
                  padding: '2px 8px', 
                  borderRadius: '12px', 
                  fontSize: '0.75rem', 
                  fontWeight: 700, 
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px'
                }}>
                  <Sparkles size={12} /> Upgrade to Pro
                </span>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Supercharge Your Job Search</span>
              </div>
              <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1.25rem' }}>Supercharge Your Job Search</h3>
              <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '0.75rem' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}><Zap size={14} style={{ color: '#a855f7' }} /> More job results from more sources</span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}><Zap size={14} style={{ color: '#a855f7' }} /> Unlimited AI Match Scoring</span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}><Zap size={14} style={{ color: '#a855f7' }} /> Unlimited Tailored Resumes & Cover Letters</span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}><Zap size={14} style={{ color: '#a855f7' }} /> Strategic Application Q&A Answers</span>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <button 
                onClick={() => setShowUpgradeModal(true)} 
                className="btn-primary" 
                style={{ 
                  padding: '0.75rem 1.5rem', 
                  fontSize: '0.95rem', 
                  fontWeight: 600,
                  whiteSpace: 'nowrap',
                  boxShadow: '0 4px 14px rgba(168, 85, 247, 0.35)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem'
                }}
              >
                Upgrade to Pro <ArrowRight size={16} />
              </button>
            </div>
          </div>
        )}

      <div className="responsive-grid" style={{ marginBottom: '1.5rem' }} data-tour="dashboard-stats">
        <div 
          className={`glass-card filter-card top-stat-card ${activeFilter === 'all' ? 'active' : ''}`}
          onClick={() => setActiveFilter('all')}
          style={{ cursor: 'pointer', padding: '1rem', position: 'relative' }}
        >
          <h4 style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '0.25rem', fontWeight: 500, margin: 0 }}>Jobs Found</h4>
          <h2 style={{ fontSize: '2.5rem', color: 'var(--text-primary)', margin: 0, marginTop: '0.25rem' }}>{totalDiscovered}</h2>
          {totalDiscovered > 200 && (
            <div style={{ marginTop: '-10px', color: 'red', fontSize: '0.8rem', fontWeight: 500, position: 'absolute', left: '1rem' }}>
              Consider a cleanup
            </div>
          )}
        </div>
        <div 
          className={`glass-card filter-card top-stat-card ${activeFilter === 'scored' ? 'active' : ''}`}
          onClick={() => setActiveFilter('scored')}
          style={{ cursor: 'pointer', padding: '1rem' }}
        >
          <h4 style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '0.25rem', fontWeight: 500, margin: 0 }}>Scored</h4>
          <h2 style={{ fontSize: '2.5rem', color: 'var(--text-primary)', margin: 0, marginTop: '0.25rem' }}>{totalScored}</h2>
        </div>
        <div 
          className={`glass-card filter-card top-stat-card ${activeFilter === 'high_fit' ? 'active' : ''}`}
          onClick={() => setActiveFilter('high_fit')}
          style={{ cursor: 'pointer', padding: '1rem' }}
        >
          <h4 style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '0.25rem', fontWeight: 500, margin: 0 }}>Great Matches (&gt;80)</h4>
          <h2 style={{ fontSize: '2.5rem', color: 'var(--accent-primary)', margin: 0, marginTop: '0.25rem' }}>{highlyScored}</h2>
        </div>
        <div 
          className={`glass-card filter-card top-stat-card ${activeFilter === 'archived' ? 'active' : ''}`}
          onClick={() => setActiveFilter('archived')}
          style={{ cursor: 'pointer', padding: '1rem' }}
        >
          <h4 style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '0.25rem', fontWeight: 500, margin: 0 }}>Saved</h4>
          <h2 style={{ fontSize: '2.5rem', color: 'var(--text-primary)', margin: 0, marginTop: '0.25rem' }}>{totalArchived}</h2>
        </div>
      </div>

      <AddJobUrlBar userPlanTier={userPlanTier} onJobAdded={(newJob) => setJobList(prev => [newJob, ...prev])} />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem', background: 'rgba(255, 255, 255, 0.03)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--border-glass)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <h3 style={{ margin: 0, fontSize: '1.2rem' }}>Matches ({filteredAndSortedJobs.length})</h3>
          <DashboardCleanup 
            checkedJobs={Array.from(checkedJobs)}
            onCleanupComplete={() => {
              router.refresh();
              setCheckedJobs(new Set());
            }} 
          />
        </div>
        
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <Search size={14} style={{ position: 'absolute', left: '0.6rem', color: 'var(--text-secondary)', pointerEvents: 'none' }} />
            <input
              type="text"
              placeholder="Filter words or description..."
              value={keywordFilter}
              onChange={(e) => setKeywordFilter(e.target.value)}
              style={{
                background: 'var(--bg-color)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border-glass)',
                padding: '0.4rem 2rem 0.4rem 2rem',
                borderRadius: '4px',
                fontSize: '0.85rem',
                minWidth: '200px'
              }}
            />
            {keywordFilter && (
              <button
                onClick={() => setKeywordFilter('')}
                style={{
                  position: 'absolute',
                  right: '0.5rem',
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-secondary)',
                  cursor: 'pointer',
                  padding: 0,
                  display: 'flex',
                  alignItems: 'center'
                }}
                title="Clear filter"
              >
                <X size={14} />
              </button>
            )}
          </div>

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
              {startDate && <span>{safeFormatDate(startDate)}</span>}
              <input 
                type="date" 
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            
            <span style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>to</span>
            
            <div className="date-picker-custom" title="End Date">
              <Calendar size={14} color={endDate ? 'var(--accent-primary)' : 'var(--text-secondary)'} />
              {endDate && <span>{safeFormatDate(endDate)}</span>}
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
              <option value="auto_apply">Auto Apply Confidence</option>
            </select>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Per page:</span>
            <select 
              value={itemsPerPage} 
              onChange={(e) => changeItemsPerPage(Number(e.target.value))}
              style={{ background: 'var(--bg-color)', color: 'var(--text-primary)', border: '1px solid var(--border-glass)', padding: '0.4rem', borderRadius: '4px' }}
            >
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
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
        <div data-tour="recent-jobs" style={{ overflowX: 'auto', background: 'var(--bg-glass)', borderRadius: '12px', border: '1px solid var(--border-glass)', marginBottom: '2rem' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-glass)', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                <th style={{ padding: '1rem', width: '40px' }}>
                  <input 
                    type="checkbox" 
                    onChange={toggleAllChecks} 
                    checked={currentJobs.length > 0 && checkedJobs.size === currentJobs.length}
                    style={{ cursor: 'pointer', width: '16px', height: '16px' }}
                  />
                </th>
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
              {currentJobs.map(job => {
                  const score = job.opportunity_scores?.[0]?.total_score;
                  const scoreClass = !score ? '' : score >= 80 ? 'score-high' : 'score-med';
                  const isEmailJob = job.company?.includes('(Scraped via Email)') || job.source?.toLowerCase().includes('email');
                  const isUserAdded = job.unlockedBySubmission === true;
                  
                  // job_feedback is a 1-to-1 relation, so it's an object or null, not an array.
                  // Sometimes Supabase might return it as an array if queried dynamically, so we handle both just in case.
                  const feedbackObj = Array.isArray(job.job_feedback) ? job.job_feedback[0] : job.job_feedback;
                  const isDisliked = feedbackObj?.feedback_type === 'dislike';
                  const isViewed = !!(job.is_viewed || job.isViewed);
                  
                  const rowStyle: any = {
                    borderBottom: '1px solid rgba(255,255,255,0.05)',
                    opacity: isDisliked ? 0.5 : 1,
                    ...(isUserAdded ? {
                      '--accent-primary': '#a855f7',
                      '--accent-secondary': '#9333ea',
                      '--accent-glow': 'rgba(168, 85, 247, 0.15)',
                      background: 'rgba(168, 85, 247, 0.04)'
                    } : isEmailJob ? {
                      '--accent-primary': '#0cc22d',
                      '--accent-secondary': '#09a026',
                      '--accent-glow': 'rgba(12, 194, 45, 0.15)'
                    } : {})
                  };
                  
                  return (
                    <tr key={job.id} className="job-card" style={rowStyle}>
                      <td style={{ padding: '1rem', borderLeft: isViewed ? '4px solid #2663EB' : '4px solid transparent' }}>
                        <input 
                          type="checkbox" 
                          checked={checkedJobs.has(job.id)} 
                          onChange={() => toggleJobCheck(job.id)}
                          style={{ cursor: 'pointer', width: '16px', height: '16px' }}
                        />
                      </td>
                      <td style={{ padding: '1rem', fontWeight: 600, color: 'var(--accent-primary)', textTransform: 'uppercase', fontSize: '0.85rem' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', alignItems: 'flex-start' }}>
                          <span>{cleanCompanyName(job.company)}</span>
                          <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center', flexWrap: 'wrap' }}>
                            {getConfidenceBadge(job.automation_confidence)}
                            {isUserAdded && (
                              <span title="Added by you via URL" style={{ color: '#a855f7', background: 'rgba(168, 85, 247, 0.12)', border: '1px solid rgba(168, 85, 247, 0.3)', padding: '2px 6px', borderRadius: '12px', fontSize: '0.7rem', fontWeight: 600 }}>Custom Added</span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className={confettiJobId === job.id ? 'confetti' : undefined} style={{ padding: '1rem' }}>
                        <Link href={`/job/${job.id}`} onClick={() => handleMarkViewed(job.id)} className={isEmailJob ? 'email-job-title' : 'job-title'} style={{ textDecoration: 'none', fontWeight: 600, fontSize: '1.1rem' }}>
                          {job.title}
                        </Link>
                      </td>
                      <td style={{ padding: '1rem', color: 'var(--text-secondary)' }}>{job.location || 'Remote'}</td>
                      <td style={{ padding: '1rem' }}>
                        {score ? (
                          <span className={`score-badge ${scoreClass}`} style={{ padding: '0.2rem 0.5rem', fontSize: '0.9rem', borderRadius: '4px' }}>{score}</span>
                        ) : scoresExhausted ? (
                          <span 
                            onClick={() => setShowUpgradeModal(true)} 
                            title="Weekly score allowance reached. Click to upgrade to Pro!" 
                            style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '0.25rem 0.5rem', background: 'rgba(255,255,255,0.05)', border: '1px dashed rgba(255,255,255,0.2)', borderRadius: '4px', color: 'var(--text-secondary)' }}
                          >
                            <Lock size={14} />
                          </span>
                        ) : '-'}
                      </td>
                      <td style={{ padding: '1rem', textTransform: 'capitalize' }}>
                        {getEffectiveStatus(job) === 'applied' ? (
                          <span className="badge badge-applied" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                            <CheckCircle2 size={14} /> Applied {safeFormatDate(job.applied_at)}
                          </span>
                        ) : (
                          <span className={`badge badge-${getEffectiveStatus(job)}`}>{getEffectiveStatus(job).replace('_', ' ')}</span>
                        )}
                      </td>
                      <td style={{ padding: '1rem', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>{safeFormatDate(job.created_at)}</td>
                      <td style={{ padding: '1rem' }}>
                        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'nowrap', alignItems: 'center' }}>
                          {isEmailJob && (!job.description || job.description.length < 500) && (
                             <button 
                               onClick={() => handleQueueFetch({ id: job.id, title: job.title, company: job.company })} 
                               disabled={fetchStatuses[job.id] === 'fetching' || fetchStatuses[job.id] === 'queued' || fetchStatuses[job.id] === 'success'} 
                               className={`btn-outline ${fetchStatuses[job.id] === 'error' ? 'error' : ''}`} 
                               style={{ 
                                 padding: '0.3rem 0.6rem', 
                                 fontSize: '0.75rem',
                                 borderColor: fetchStatuses[job.id] === 'error' ? 'var(--danger)' : fetchStatuses[job.id] === 'success' ? 'var(--success)' : '',
                                 color: fetchStatuses[job.id] === 'error' ? 'var(--danger)' : fetchStatuses[job.id] === 'success' ? 'var(--success)' : ''
                               }}
                             >
                               {fetchStatuses[job.id] === 'fetching' ? 'Fetching...' : 
                                fetchStatuses[job.id] === 'queued' ? 'Queued' : 
                                fetchStatuses[job.id] === 'success' ? <><Check size={13} /> Fetched</> : 
                                fetchStatuses[job.id] === 'error' ? 'Retry' : 'Fetch'}
                             </button>
                          )}
                          <FeedbackButtons
                            jobId={job.id}
                            initialFeedback={feedbackObj?.feedback_type as 'like' | 'dislike' | undefined}
                            compact
                            showNudgeTooltip={nudgeJobId === job.id}
                            nudgeVariant="dashboard"
                            onNudgeDismiss={handleNudgeDismiss}
                            onFeedbackGiven={handleNudgeFeedbackGiven}
                          />
                          <button onClick={() => toggleArchive(job.id)} className="btn-outline" style={{ padding: '0.3rem 0.5rem', fontSize: '0.8rem' }} title={job.is_archived ? "Unsave" : "Save"}>
                            <Archive size={14} />
                          </button>
                          <button onClick={() => deleteJob(job.id)} className="btn-outline" style={{ padding: '0.3rem 0.5rem', fontSize: '0.8rem', color: 'var(--danger)', borderColor: 'var(--danger)' }} title="Delete">
                            <Trash2 size={14} />
                          </button>
                          <Link href={`/job/${job.id}`} onClick={() => handleMarkViewed(job.id)} className="btn-primary" style={{ padding: '0.3rem 0.6rem', fontSize: '0.8rem' }}>
                            Details
                          </Link>
                          <a href={job.url} target="_blank" rel="noreferrer" onClick={() => handleMarkViewed(job.id)} className="btn-outline" style={{ padding: '0.3rem 0.6rem', fontSize: '0.8rem' }} title="Original">
                            <ExternalLink size={14} />
                          </a>
                        </div>
                      </td>
                    </tr>
                  );
              })}
              {currentJobs.length === 0 && (
                <tr>
                  <td colSpan={8} style={{ padding: '3rem 1rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                    No jobs match your current filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="job-card-grid" data-tour="recent-jobs">
          {currentJobs.map((job) => {
            const score = job.opportunity_scores?.[0]?.total_score;
            const scoreClass = !score ? '' : score >= 80 ? 'score-high' : 'score-med';
            const isEmailJob = job.company?.includes('(Scraped via Email)') || job.source?.toLowerCase().includes('email');
            const isUserAdded = job.unlockedBySubmission === true;
            
            const feedbackObj = Array.isArray(job.job_feedback) ? job.job_feedback[0] : job.job_feedback;
            const isDisliked = feedbackObj?.feedback_type === 'dislike';
            const isViewed = !!(job.is_viewed || job.isViewed);
            
            let cardBorder: string | undefined = undefined;
            if (isViewed) {
              cardBorder = '1px solid #2663EB';
            } else if (isUserAdded) {
              cardBorder = '1px solid rgba(168, 85, 247, 0.35)';
            }

            const cardStyle: any = {
              opacity: isDisliked ? 0.5 : 1,
              boxShadow: isDisliked ? 'none' : undefined,
              ...(cardBorder ? { border: cardBorder } : {}),
              ...(isUserAdded ? {
                '--accent-primary': '#a855f7',
                '--accent-secondary': '#9333ea',
                '--accent-glow': 'rgba(168, 85, 247, 0.15)',
                background: 'linear-gradient(135deg, rgba(168, 85, 247, 0.05) 0%, rgba(255, 255, 255, 0.02) 100%)'
              } : isEmailJob ? {
                '--accent-primary': '#0cc22d',
                '--accent-secondary': '#09a026',
                '--accent-glow': 'rgba(12, 194, 45, 0.15)'
              } : {})
            };
            
            return (
              <div key={job.id} className={`glass-card job-card${confettiJobId === job.id ? ' confetti' : ''}`} style={cardStyle}>
                <div className="job-header">
                  <div>
                    <div className="job-company" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                      {cleanCompanyName(job.company)}
                      {getConfidenceBadge(job.automation_confidence)}
                      {isUserAdded && (
                        <span title="Added by you via URL" style={{ color: '#a855f7', background: 'rgba(168, 85, 247, 0.12)', border: '1px solid rgba(168, 85, 247, 0.3)', padding: '2px 6px', borderRadius: '12px', fontSize: '0.7rem', fontWeight: 600 }}>Custom Added</span>
                      )}
                    </div>
                    <Link href={`/job/${job.id}`} onClick={() => handleMarkViewed(job.id)} style={{ textDecoration: 'none' }} className={isEmailJob ? 'email-job-title' : 'job-title'}>
                      <h3 style={{ cursor: 'pointer', margin: 0 }}>{job.title}</h3>
                    </Link>
                  </div>
                  {score ? (
                    <div className={`score-badge ${scoreClass}`}>
                      {score}
                    </div>
                  ) : scoresExhausted ? (
                    <div 
                      onClick={() => setShowUpgradeModal(true)} 
                      title="Weekly score allowance reached. Click to upgrade to Pro!" 
                      className="score-badge" 
                      style={{ cursor: 'pointer', background: 'rgba(255, 255, 255, 0.05)', border: '1px dashed rgba(255, 255, 255, 0.2)', color: 'var(--text-secondary)' }}
                    >
                      <Lock size={16} />
                    </div>
                  ) : null}
                </div>
                
                <div className="job-meta">
                  <span className="job-meta-item"><MapPin size={14} /> {job.location || 'Remote'}</span>
                  <span className="job-meta-item"><DollarSign size={14} /> {job.salary_range || 'Not Listed'}</span>
                  <span className="job-meta-item" style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                    <Clock size={13} /> {safeFormatDate(job.created_at)}
                  </span>
                </div>
                
                <div style={{ marginTop: 'auto', marginBottom: '1rem' }}>
                  {getEffectiveStatus(job) === 'applied' ? (
                    <span className="badge badge-applied" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                      <CheckCircle2 size={14} /> Applied {safeFormatDate(job.applied_at)}
                    </span>
                  ) : (
                    <span className={`badge badge-${getEffectiveStatus(job)}`}>{getEffectiveStatus(job).replace('_', ' ')}</span>
                  )}
                </div>
                
                <div style={{ paddingTop: '1rem', borderTop: '1px solid var(--border-glass)', display: 'flex', justifyContent: 'flex-start', alignItems: 'center' }}>
                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', justifyContent: 'flex-start', alignItems: 'center' }}>
                    {job.company?.includes('(Scraped via Email)') && (!job.description || job.description.length < 500) && (
                       <button 
                         onClick={() => handleQueueFetch({ id: job.id, title: job.title, company: job.company })} 
                         disabled={fetchStatuses[job.id] === 'fetching' || fetchStatuses[job.id] === 'queued' || fetchStatuses[job.id] === 'success'} 
                         className={`btn-outline ${fetchStatuses[job.id] === 'error' ? 'error' : ''}`} 
                         style={{ 
                           padding: '0.24rem 0.42rem', 
                           fontSize: '0.85rem',
                           borderColor: fetchStatuses[job.id] === 'error' ? 'var(--danger)' : fetchStatuses[job.id] === 'success' ? 'var(--success)' : '',
                           color: fetchStatuses[job.id] === 'error' ? 'var(--danger)' : fetchStatuses[job.id] === 'success' ? 'var(--success)' : ''
                         }}
                       >
                         {fetchStatuses[job.id] === 'fetching' ? 'Fetching...' : 
                          fetchStatuses[job.id] === 'queued' ? 'Queued' : 
                          fetchStatuses[job.id] === 'success' ? <><Check size={14} /> Fetched</> : 
                          fetchStatuses[job.id] === 'error' ? 'Failed - Retry' : 'Fetch Details'}
                       </button>
                    )}
                    <button onClick={() => toggleArchive(job.id)} className="btn-outline" style={{ padding: '0.24rem 0.42rem', fontSize: '0.85rem' }} title={job.is_archived ? "Unsave" : "Save"}>
                      <Archive size={14} />
                    </button>
                    <button onClick={() => deleteJob(job.id)} className="btn-outline" style={{ padding: '0.24rem 0.42rem', fontSize: '0.85rem', color: 'var(--danger)', borderColor: 'var(--danger)' }} title="Delete">
                      <Trash2 size={14} />
                    </button>
                    <Link href={`/job/${job.id}`} onClick={() => handleMarkViewed(job.id)} className="btn-primary" style={{ padding: '0.24rem 0.42rem', fontSize: '0.85rem' }}>
                      Details
                    </Link>
                    <a href={job.url} target="_blank" rel="noreferrer" onClick={() => handleMarkViewed(job.id)} className="btn-outline" style={{ padding: '0.24rem 0.42rem', fontSize: '0.85rem' }}>
                      Original <ExternalLink size={14} />
                    </a>
                    <FeedbackButtons
                      jobId={job.id}
                      initialFeedback={feedbackObj?.feedback_type as 'like' | 'dislike' | undefined}
                      compact
                      showNudgeTooltip={nudgeJobId === job.id}
                      nudgeVariant="dashboard"
                      onNudgeDismiss={handleNudgeDismiss}
                      onFeedbackGiven={handleNudgeFeedbackGiven}
                    />
                  </div>
                  <div style={{ marginLeft: 'auto', marginRight: '-12px', marginBottom: '-36px' }}>
                    <input 
                      type="checkbox" 
                      checked={checkedJobs.has(job.id)} 
                      onChange={() => toggleJobCheck(job.id)}
                      style={{ cursor: 'pointer', width: '18px', height: '18px' }}
                    />
                  </div>
                </div>
              </div>
            );
          })}
  
          {currentJobs.length === 0 && (
            <div className="glass-card" style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '4rem 2rem' }}>
              <p style={{ color: 'var(--text-secondary)', fontSize: '1.1rem' }}>No jobs match your current filters.</p>
              {jobs.length === 0 && (
                <p style={{ marginTop: '0.5rem', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Run the scraping pipeline to populate your dashboard.</p>
              )}
            </div>
          )}
        </div>
      )}

      {filteredAndSortedJobs.length > 0 && (
        <div 
          style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center', 
            flexWrap: 'wrap', 
            gap: '1rem', 
            marginTop: '2rem', 
            marginBottom: '2rem', 
            padding: '1rem', 
            background: 'rgba(255, 255, 255, 0.03)', 
            borderRadius: '8px', 
            border: '1px solid var(--border-glass)' 
          }}
        >
          <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
            Showing <strong style={{ color: 'var(--text-primary)' }}>{filteredAndSortedJobs.length > 0 ? startIndex + 1 : 0}–{endIndex}</strong> of <strong style={{ color: 'var(--text-primary)' }}>{filteredAndSortedJobs.length}</strong> jobs
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Per page:</span>
              <select 
                value={itemsPerPage} 
                onChange={(e) => changeItemsPerPage(Number(e.target.value))}
                style={{ background: 'var(--bg-color)', color: 'var(--text-primary)', border: '1px solid var(--border-glass)', padding: '0.4rem', borderRadius: '4px' }}
              >
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>

            {totalPages > 1 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <button 
                  className="btn-outline" 
                  disabled={currentPage === 1}
                  onClick={() => {
                    changePage(Math.max(1, currentPage - 1));
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  style={{ padding: '0.4rem 0.8rem', fontSize: '0.875rem' }}
                >
                  Previous
                </button>
                <span style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', minWidth: '80px', textAlign: 'center' }}>
                  Page {currentPage} of {totalPages}
                </span>
                <button 
                  className="btn-outline" 
                  disabled={currentPage === totalPages}
                  onClick={() => {
                    changePage(Math.min(totalPages, currentPage + 1));
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  style={{ padding: '0.4rem 0.8rem', fontSize: '0.875rem' }}
                >
                  Next
                </button>
              </div>
            )}
          </div>
        </div>
      )}
      <SyncOverlay 
        isSyncing={isSyncing} 
        syncMessage={syncMessage} 
        title="Syncing in Progress"
        subtext="This could take up to 3 minutes to complete. Please do not close or refresh this page."
      />
      </div>

      {showUpgradeModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)' }}>
          <div className="glass-card" style={{ maxWidth: '400px', width: '90%', textAlign: 'center', padding: '2rem' }}>
            <h2 style={{ marginBottom: '1rem' }}>Pro Feature</h2>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>
              Email Sync is a Pro feature. Upgrade your plan to automatically pull job posts from your email.
            </p>
            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
               <button onClick={() => setShowUpgradeModal(false)} className="btn-outline">Cancel</button>
              <Link href="/pricing" className="btn-primary" onClick={() => setShowUpgradeModal(false)}>Upgrade Plan</Link>
            </div>
          </div>
        </div>
      )}

      {showConfigModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)' }}>
          <div className="glass-card" style={{ maxWidth: '400px', width: '90%', textAlign: 'center', padding: '2rem' }}>
            <h2 style={{ marginBottom: '1rem' }}>Configuration Required</h2>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>
              You'll need to configure account to be able to pull job post from your email.
            </p>
            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
              <button onClick={() => setShowConfigModal(false)} className="btn-outline">Cancel</button>
              <Link href="/settings#email-sync" className="btn-primary" onClick={() => setShowConfigModal(false)}>Set up now</Link>
            </div>
          </div>
        </div>
      )}

      {showQueueOverlay && (
        <div style={{ 
          position: 'fixed', 
          bottom: '2rem', 
          right: '2rem', 
          width: '320px', 
          zIndex: 9999,
          background: 'var(--bg-glass)',
          border: '1px solid var(--border-glass)',
          borderRadius: '12px',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
          backdropFilter: 'blur(16px)',
          padding: '1rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.8rem'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '0.5rem' }}>
            <h3 style={{ margin: 0, fontSize: '1rem' }}>Fetch Queue</h3>
            {activeFetches.length === 0 && fetchQueue.length === 0 ? (
              <span style={{ fontSize: '0.8rem', color: 'var(--success)' }}>Complete</span>
            ) : (
              <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                {activeFetches.length} active, {fetchQueue.length} queued
              </span>
            )}
          </div>
          
          <div style={{ maxHeight: '200px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {activeFetches.map(job => (
              <div key={job.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(255,255,255,0.03)', padding: '0.5rem', borderRadius: '6px' }}>
                <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--accent-primary)', animation: 'pulse 1.5s infinite' }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{job.title}</div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{job.company}</div>
                </div>
                <span style={{ fontSize: '0.7rem', color: 'var(--accent-primary)' }}>Fetching...</span>
              </div>
            ))}
            
            {fetchQueue.map(job => (
              <div key={job.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(0,0,0,0.2)', padding: '0.5rem', borderRadius: '6px' }}>
                <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--text-secondary)' }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{job.title}</div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{job.company}</div>
                </div>
                <button 
                  onClick={() => removeQueuedItem(job.id)}
                  style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '0.2rem' }}
                  title="Remove from queue"
                >
                  ×
                </button>
              </div>
            ))}
            
            {activeFetches.length === 0 && fetchQueue.length === 0 && (
              <div style={{ textAlign: 'center', padding: '1rem', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
                All details fetched successfully!
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
