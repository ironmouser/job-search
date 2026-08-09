"use client";
// Force Railway fresh build trigger
import { useState, useMemo, useEffect, useRef } from 'react';
import Link from 'next/link';
import { ExternalLink, Filter, Archive, Bookmark, BookmarkX, Mail, LayoutGrid, List, Calendar, MapPin, DollarSign, Clock, CheckCircle2, Check, Trash2, Lock, Sparkles, Zap, ArrowRight, Search, X, ChevronDown, Loader2 } from 'lucide-react';
import { cleanCompanyName } from '@/lib/cleaners';
import FeedbackButtons from '@/components/FeedbackButtons';
import SyncButton from '@/components/SyncButton';
import DashboardCleanup from '@/components/DashboardCleanup';
import { useRouter, useSearchParams } from 'next/navigation';
import AddJobUrlBar from '@/components/AddJobUrlBar';
import { useDashboardFeedbackNudge } from '@/hooks/useDashboardFeedbackNudge';
import { US_STATE_ABBRS, extractStateAbbr, isUsLocation, isRemoteLocation, isInternationalLocation } from '@/lib/locationUtils';
import { PageHeader, PageHeaderHeading, PageHeaderDescription, PageHeaderActions } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

import SyncOverlay from './SyncOverlay';
import { useHelp } from '@/contexts/HelpContext';
import DiscoveryNudgeOverlay from '@/components/DiscoveryNudgeOverlay';
import OnboardingWidget from '@/components/common/OnboardingWidget';
import NonUsJobsFocusModal from '@/components/NonUsJobsFocusModal';
import TrialStatusBanner from '@/components/TrialStatusBanner';
import UpgradePrompt from '@/components/UpgradePrompt';
import { AntiAbuseBanner } from '@/components/AntiAbuseBanner';


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

export default function DashboardClient({ jobs, userPlanTier = 'FREE', trialEndsAt = null, hasEmailCredentials = false, initialScoresExhausted = false, hasSeenNonUsPrompt = false, noInternational = false }: { jobs: any[], userPlanTier?: string, trialEndsAt?: Date | string | null, hasEmailCredentials?: boolean, initialScoresExhausted?: boolean, hasSeenNonUsPrompt?: boolean, noInternational?: boolean }) {

  const router = useRouter();
  const [jobList, setJobList] = useState<any[]>(jobs || []);
  const [scoresExhausted, setScoresExhausted] = useState(initialScoresExhausted);
  const [isScoringBackground, setIsScoringBackground] = useState(false);
  const [showNonUsModal, setShowNonUsModal] = useState(false);
  const [intlJobCount, setIntlJobCount] = useState(0);

  useEffect(() => {
    setJobList(jobs || []);
  }, [jobs]);

  // Detect international jobs and show the focus prompt once
  useEffect(() => {
    if (hasSeenNonUsPrompt || noInternational) return;
    const intlJobs = (jobs || []).filter((j: any) => isInternationalLocation(j.location || ''));
    if (intlJobs.length > 0) {
      setIntlJobCount(intlJobs.length);
      setShowNonUsModal(true);
    }
  // Run only on first render / when jobs list changes after a sync
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobs]);

  const { getOnboardingProgress } = useHelp();
  const [showDiscoveryNudge, setShowDiscoveryNudge] = useState(false);

  const checkAndTriggerDiscoveryNudge = () => {
    try {
      const hasCompletedSync = localStorage.getItem('job_agent_has_completed_job_sync') === 'true' || localStorage.getItem('job_agent_just_completed_job_sync') === 'true';
      const hasSeenNudge = localStorage.getItem('job_agent_discovery_nudge_seen') === 'true';
      const onboardingIncomplete = getOnboardingProgress().percentage < 100;

      if (hasCompletedSync && onboardingIncomplete && !hasSeenNudge) {
        setShowDiscoveryNudge(true);
      }
    } catch (e) {}
  };

  useEffect(() => {
    checkAndTriggerDiscoveryNudge();
  }, [getOnboardingProgress]);

  const handleCloseDiscoveryNudge = () => {
    setShowDiscoveryNudge(false);
    try {
      localStorage.setItem('job_agent_discovery_nudge_seen', 'true');
    } catch (e) {}
  };

  const [activeFilter, setActiveFilter] = useState<'all' | 'scored' | 'high_fit' | 'archived'>('all');
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
  const [isEmailSyncing, setIsEmailSyncing] = useState(false);
  const [sortOption, setSortOption] = useState<'newest' | 'score' | 'salary' | 'remote' | 'auto_apply'>('newest');
  const [locationFilter, setLocationFilter] = useState<string[]>([]);
  const [isLocationDropdownOpen, setIsLocationDropdownOpen] = useState(false);
  const locationDropdownRef = useRef<HTMLDivElement>(null);
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
  const [jobsFoundCount, setJobsFoundCount] = useState<number | null>(null);
  const [isRefiningJobs, setIsRefiningJobs] = useState(false);
  const [checkedJobs, setCheckedJobs] = useState<Set<string>>(new Set());
  const [activeAnimIndex, setActiveAnimIndex] = useState(0);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [confettiJobId, setConfettiJobId] = useState<string | null>(null);

  const searchParams = useSearchParams();
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState<number>(20);
  const scoringInProgress = useRef(new Set<string>());
  const attemptedScoringJobs = useRef(new Set<string>());
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

    // Remove the class after 9 seconds
    const timer = setTimeout(() => setConfettiJobId(null), 9000);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  // Close location dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (locationDropdownRef.current && !locationDropdownRef.current.contains(e.target as Node)) {
        setIsLocationDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
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
        if (stateFromStorage.locationFilter !== undefined) {
          if (Array.isArray(stateFromStorage.locationFilter)) {
            setLocationFilter(stateFromStorage.locationFilter);
          } else if (typeof stateFromStorage.locationFilter === 'string') {
            if (stateFromStorage.locationFilter === 'all' || !stateFromStorage.locationFilter) {
              setLocationFilter([]);
            } else {
              setLocationFilter([stateFromStorage.locationFilter]);
            }
          }
        }
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
  }, []);

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
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('last_clicked_job_id', jobId);
      localStorage.setItem('last_clicked_job_id', jobId);
    }
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
          // Fire-and-forget: don't block the UI waiting for AI scoring (3–12s)
          fetch('/api/score', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jobId: jobItem.id }) }).catch(() => {});
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
    if (job.is_archived) return 'saved';
    if (hasJobScore(job)) return 'scored';
    return job.status || 'discovered';
  };

  const unarchivedJobs = jobList?.filter(j => !j.is_archived) || [];
  const totalDiscovered = unarchivedJobs.length;
  const totalScored = unarchivedJobs.filter(j => hasJobScore(j)).length;
  const highlyScored = unarchivedJobs.filter(j => j.opportunity_scores?.[0]?.total_score >= 80).length;
  const totalArchived = jobList?.filter(j => j.is_archived).length || 0;

  const handleEmailSync = async () => {
    if (userPlanTier !== 'PRO' && !trialEndsAt) {
      setShowUpgradeModal(true);
      return;
    }

    if (!hasEmailCredentials) {
      setShowConfigModal(true);
      return;
    }

    setIsEmailSyncing(true);
    setIsSyncing(true);
    setJobsFoundCount(0);
    setSyncMessage('Scanning email inbox for job postings...');
    try {
      const res = await fetch('/api/sync/email', { method: 'POST' });
      let data: any = {};
      let runningCount = 0;

      if (res.body) {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            try {
              const jsonStr = trimmed.startsWith('data: ') ? trimmed.slice(6) : (trimmed.startsWith('data:') ? trimmed.slice(5) : trimmed);
              const payload = JSON.parse(jsonStr);
              if (typeof payload.foundCount === 'number') {
                runningCount = payload.foundCount;
                setJobsFoundCount(runningCount);
                if (payload.message) setSyncMessage(payload.message);
              }
              if (payload.type === 'complete' || payload.success !== undefined) {
                data = payload;
              }
            } catch (e) {}
          }
        }

        if (buffer.trim()) {
          try {
            const rawBuf = buffer.trim();
            const jsonStr = rawBuf.startsWith('data: ') ? rawBuf.slice(6) : (rawBuf.startsWith('data:') ? rawBuf.slice(5) : rawBuf);
            const payload = JSON.parse(jsonStr);
            if (typeof payload.foundCount === 'number') {
              runningCount = payload.foundCount;
              setJobsFoundCount(runningCount);
            }
            if (payload.type === 'complete' || payload.success !== undefined) {
              data = payload;
            }
          } catch (e) {}
        }
      } else {
        data = await res.json().catch(() => ({ error: 'Failed to parse response' }));
      }

      if (res.ok && data.success !== false) {
        const finalCount = data.count ?? runningCount;
        setIsEmailSyncing(false);
        setIsSyncing(false);
        setJobsFoundCount(null);
        setSyncMessage('');

        // ALWAYS refresh dashboard so newly saved jobs display immediately on first sync run
        router.refresh();

        if (finalCount === 0) {
          alert('Email sync complete! We scanned your inbox and found 0 new job opportunities since your last sync.');
        } else {
          // Fire background scoring call (non-blocking)
          fetch('/api/score', { method: 'POST', body: JSON.stringify({}) })
            .then(() => router.refresh())
            .catch(err => console.error('Background scoring error:', err));
        }
        return;
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
      setJobsFoundCount(null);
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

  const uniqueLocations = useMemo(() => {
    const locs = new Set<string>();
    let hasInternational = false;
    jobList?.forEach(j => {
      if (!j.location) return;
      if (isRemoteLocation(j.location)) {
        locs.add('Remote');
      }
      if (isUsLocation(j.location)) {
        const abbr = extractStateAbbr(j.location);
        locs.add(abbr ?? 'United States');
      } else if (!isRemoteLocation(j.location)) {
        hasInternational = true;
      }
    });
    if (hasInternational) locs.add('International');
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
    if (locationFilter.length > 0) {
      result = result.filter(j => {
        if (!j.location) return false;
        const locLower = j.location.toLowerCase();
        return locationFilter.some(locOpt => {
          if (locOpt === 'Remote') return isRemoteLocation(j.location);
          if (locOpt === 'United States') return isUsLocation(j.location) && !isRemoteLocation(j.location);
          if (locOpt === 'International') return !isUsLocation(j.location) && !isRemoteLocation(j.location);
          if (US_STATE_ABBRS.has(locOpt)) {
            return extractStateAbbr(j.location) === locOpt;
          }
          return false;
        });
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
        const isRemoteA = isRemoteLocation(a.location || '') ? 1 : 0;
        const isRemoteB = isRemoteLocation(b.location || '') ? 1 : 0;
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

  // Scroll to top of last clicked job when returning to dashboard
  useEffect(() => {
    if (!isLoaded || currentJobs.length === 0) return;

    const lastJobId = typeof window !== 'undefined'
      ? (sessionStorage.getItem('last_clicked_job_id') || localStorage.getItem('last_clicked_job_id'))
      : null;

    if (!lastJobId) return;

    const scrollElement = () => {
      const el = document.getElementById(`job-item-${lastJobId}`);
      if (el) {
        const rect = el.getBoundingClientRect();
        const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
        const targetY = rect.top + scrollTop - 100;
        window.scrollTo({ top: Math.max(0, targetY), behavior: 'smooth' });

        sessionStorage.removeItem('last_clicked_job_id');
        localStorage.removeItem('last_clicked_job_id');
        return true;
      }
      return false;
    };

    if (!scrollElement()) {
      const t1 = setTimeout(scrollElement, 150);
      const t2 = setTimeout(scrollElement, 400);
      return () => {
        clearTimeout(t1);
        clearTimeout(t2);
      };
    }
  }, [isLoaded, currentJobs, viewMode]);

  useEffect(() => {
    if (userPlanTier !== 'PRO' && scoresExhausted) return;

    const isUnscored = (j: any) => (!j.opportunity_scores || j.opportunity_scores.length === 0);
    const canBeScored = (j: any) => {
      if (j.url && (j.url.startsWith('http://') || j.url.startsWith('https://'))) return true;
      if (j.description && j.description.trim().length > 30) return true;
      return false;
    };

    // Helper to read/write retry state in sessionStorage
    const getRetryState = (): Record<string, { attempts: number; lastAttempt: number; exhausted?: boolean }> => {
      if (typeof window === 'undefined') return {};
      try {
        const raw = sessionStorage.getItem('job_agent_fetch_score_retries');
        return raw ? JSON.parse(raw) : {};
      } catch (e) {
        return {};
      }
    };

    const saveRetryState = (state: Record<string, { attempts: number; lastAttempt: number; exhausted?: boolean }>) => {
      if (typeof window === 'undefined') return;
      try {
        sessionStorage.setItem('job_agent_fetch_score_retries', JSON.stringify(state));
      } catch (e) {}
    };

    const now = Date.now();
    const TWO_MINUTES_MS = 2 * 60 * 1000;
    const retryState = getRetryState();

    // Filter unscored current jobs that are eligible (not exhausted, and past the 2-minute backoff window)
    const unscoredCurrentJobs = currentJobs.filter((j: any) => {
      if (!isUnscored(j) || !canBeScored(j)) return false;
      const record = retryState[j.id];
      if (!record) return true;
      if (record.exhausted || record.attempts >= 3) return false;
      // Enforce 2-minute initial backoff window before retrying
      if (now - record.lastAttempt < TWO_MINUTES_MS) return false;
      return true;
    });

    if (unscoredCurrentJobs.length === 0) {
      setIsScoringBackground(false);
      return;
    }

    setIsScoringBackground(true);

    // Debounce 500ms to avoid duplicate calls on rapid re-renders
    const timer = setTimeout(() => {
      if (unscoredCurrentJobs.length > 0) {
        // Cap batch size at 5 jobs per request
        const chunk = unscoredCurrentJobs.slice(0, 5);

        // Record retry attempt in sessionStorage
        const nextState = { ...retryState };
        chunk.forEach((j: any) => {
          const prev = nextState[j.id] || { attempts: 0, lastAttempt: 0 };
          const newAttempts = prev.attempts + 1;
          nextState[j.id] = {
            attempts: newAttempts,
            lastAttempt: Date.now(),
            exhausted: newAttempts >= 3
          };
        });
        saveRetryState(nextState);

        const executeFetchAndScore = async () => {
          try {
            const res = await fetch('/api/jobs/fetch-and-score', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ jobIds: chunk.map((j: any) => j.id) })
            });

            if (!res.ok) {
              if (res.status === 403) {
                setScoresExhausted(true);
                setIsScoringBackground(false);
                return;
              }
              const errorData = await res.json().catch(() => ({}));
              throw new Error(`Status ${res.status}: ${JSON.stringify(errorData)}`);
            }

            const data = await res.json().catch(() => ({}));
            const hasScoredNewJobs = data.results?.some((r: any) => r.status === 'scored' || r.status === 'already_scored');
            if (hasScoredNewJobs) {
              router.refresh();
            }
          } catch (e) {
            console.error('Failed background fetch and score batch:', e);
          } finally {
            if (unscoredCurrentJobs.length <= chunk.length) {
              setIsScoringBackground(false);
            }
          }
        };

        executeFetchAndScore();
      } else {
        setIsScoringBackground(false);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [currentJobs, router, userPlanTier, scoresExhausted]);

  return (
    <>
      <div className="animate-fade-in">
        <PageHeader>
          <div>
            <PageHeaderHeading>Mission Control</PageHeaderHeading>
            <PageHeaderDescription>Your central hub for opportunity management and application tracking</PageHeaderDescription>
          </div>
        </PageHeader>

        <AntiAbuseBanner />
        <TrialStatusBanner trialEndsAt={trialEndsAt} planTier={userPlanTier} />

        {showUpgradeModal && userPlanTier !== 'PRO' && (
          <UpgradePrompt
            variant="modal"
            feature="email-sync"
            stats={{
              resumesTailored: jobList?.filter((j: any) => j.opportunity_scores?.[0]?.total_score).length,
              jobsApplied: jobList?.filter((j: any) => j.applied_at || j.status === 'applied').length,
              jobsSynced: jobList?.length,
            }}
            onDismiss={() => setShowUpgradeModal(false)}
          />
        )}

        <OnboardingWidget />

        {/* Job Discovery Engine Hub - Positioned Above Quick Stat Cards */}
        <div className="glass-card" style={{ 
          padding: '1.25rem 1.5rem', 
          marginBottom: '1.5rem', 
          border: '1px solid rgba(59, 130, 246, 0.35)', 
          borderRadius: '16px', 
          display: 'flex', 
          flexWrap: 'wrap', 
          justifyContent: 'space-between', 
          alignItems: 'center', 
          gap: '1.25rem', 
          boxShadow: '0 2px 8px rgb(28 88 175 / 25%)' 
        }}>
          <div style={{ flex: '1 1 280px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.35rem' }}>
              <Sparkles size={20} style={{ color: 'var(--accent-primary)' }} />
              <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>
                Job Discovery Engine
              </h3>
            </div>
            <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--text-secondary)', lineHeight: '1.4' }}>
              Find live matching job openings across 20+ job boards or import job alert notifications directly from your email inbox.
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', flexWrap: 'wrap' }}>
            <Button 
              onClick={handleEmailSync} 
              disabled={isEmailSyncing || isSyncing}
              variant="outline"
              size="default"
              style={{
                padding: '0.85rem 1.4rem',
                borderRadius: '12px',
                fontWeight: 600,
                fontSize: '0.95rem',
                border: '1px solid rgb(13 12 12 / 20%)',
                background: 'rgba(255, 255, 255, 0.05)',
                display: 'flex',
                alignItems: 'center',
                gap: '0.6rem',
                height: 'auto'
              }}
            >
              <Mail size={18} style={{ color: '#38bdf8' }} />
              <span>{isEmailSyncing ? 'Scanning Inbox...' : 'Scan Inbox for Jobs'}</span>
            </Button>

            <div data-tour="dashboard-sync-jobs">
              <SyncButton 
                onSyncStateChange={(loading, text, count, isRefining) => {
                  setIsSyncing(loading);
                  setSyncMessage(text);
                  if (loading) {
                    if (count !== undefined) setJobsFoundCount(count);
                    setIsRefiningJobs(!!isRefining);
                  } else {
                    setJobsFoundCount(null);
                    setIsRefiningJobs(false);
                  }
                }}
                onSyncComplete={() => {
                  setTimeout(() => {
                    checkAndTriggerDiscoveryNudge();
                  }, 600);
                }}
              />
            </div>
          </div>
        </div>

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
          <h4 style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '0.25rem', fontWeight: 500, margin: 0, display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <span>Scored</span>
            {isScoringBackground && (
              <span title="Background scoring in progress..." style={{ display: 'inline-flex', alignItems: 'center' }}>
                <Loader2 
                  size={13} 
                  className="animate-spin" 
                  style={{ color: 'var(--accent-primary)', animation: 'spin 1s linear infinite' }} 
                />
              </span>
            )}
          </h4>
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

      <div className="dashboard-controls-container">
        <div className="dashboard-controls-header">
          <div className="dashboard-matches-title">
            <h3>Matches ({filteredAndSortedJobs.length})</h3>
            <DashboardCleanup 
              checkedJobs={Array.from(checkedJobs)}
              onCleanupComplete={() => {
                router.refresh();
                setCheckedJobs(new Set());
              }} 
            />
          </div>
          
          <div className="dashboard-view-toggles">
            <button 
              onClick={() => setViewMode('grid')}
              style={{ background: viewMode === 'grid' ? 'rgba(255,255,255,0.1)' : 'transparent', color: viewMode === 'grid' ? 'var(--accent-primary)' : 'var(--text-secondary)' }}
              title="Grid View"
            >
              <LayoutGrid size={16} />
            </button>
            <button 
              onClick={() => setViewMode('table')}
              style={{ background: viewMode === 'table' ? 'rgba(255,255,255,0.1)' : 'transparent', color: viewMode === 'table' ? 'var(--accent-primary)' : 'var(--text-secondary)' }}
              title="Table View"
            >
              <List size={16} />
            </button>
          </div>
        </div>
        
        <div className="dashboard-filters-bar">
          <div className="filter-search-wrapper">
            <Search size={14} className="filter-search-icon" />
            <input
              type="text"
              placeholder="Filter words or description..."
              value={keywordFilter}
              onChange={(e) => setKeywordFilter(e.target.value)}
            />
            {keywordFilter && (
              <button
                onClick={() => setKeywordFilter('')}
                className="filter-search-clear"
                title="Clear filter"
              >
                <X size={14} />
              </button>
            )}
          </div>

          <div className="filter-dropdowns-wrapper">
            <div className="filter-item">
              <span className="filter-item-label">Source:</span>
              <select 
                value={sourceFilter} 
                onChange={(e) => setSourceFilter(e.target.value as any)}
              >
                <option value="both">Both</option>
                <option value="email">Email Only</option>
                <option value="scraped">Scraped Only</option>
              </select>
            </div>

            <div className="filter-item">
              <span className="filter-item-label">Date:</span>
              <div className="date-range-wrapper">
                <div className="date-picker-custom" title="Start Date">
                  <Calendar size={14} color={startDate ? 'var(--accent-primary)' : 'var(--text-secondary)'} />
                  {startDate && <span>{safeFormatDate(startDate)}</span>}
                  <input 
                    type="date" 
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                  />
                </div>
                
                <span className="date-range-separator">to</span>
                
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
            </div>
            
            <div ref={locationDropdownRef} style={{ position: 'relative' }}>
              <div className="filter-item">
                <span className="filter-item-label">Location:</span>
                <button 
                  type="button"
                  onClick={() => setIsLocationDropdownOpen(prev => !prev)}
                  className="filter-dropdown-btn"
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Filter size={14} color="var(--text-secondary)" />
                    <span>
                      {locationFilter.length === 0 
                        ? 'All Locations' 
                        : locationFilter.length === 1 
                          ? locationFilter[0] 
                          : `${locationFilter.length} Locations Selected`}
                    </span>
                  </div>
                  <ChevronDown size={14} color="var(--text-secondary)" style={{ transform: isLocationDropdownOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s ease' }} />
                </button>
              </div>

              {isLocationDropdownOpen && (
                <div style={{
                  position: 'absolute',
                  top: 'calc(100% + 4px)',
                  left: 0,
                  background: 'var(--bg-color)',
                  border: '1px solid var(--border-glass)',
                  borderRadius: '8px',
                  padding: '0.5rem',
                  zIndex: 100,
                  minWidth: '220px',
                  maxHeight: '280px',
                  overflowY: 'auto',
                  boxShadow: '0 10px 25px rgba(0,0,0,0.5)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.25rem'
                }}>
                  <div 
                    onClick={() => { setLocationFilter([]); }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '0.4rem 0.6rem',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '0.85rem',
                      fontWeight: 600,
                      color: locationFilter.length === 0 ? 'var(--accent-primary)' : 'var(--text-secondary)',
                      background: locationFilter.length === 0 ? 'rgba(102, 252, 241, 0.08)' : 'transparent'
                    }}
                  >
                    <span>All Locations</span>
                    {locationFilter.length > 0 && (
                      <span style={{ fontSize: '0.75rem', opacity: 0.7 }}>Clear</span>
                    )}
                  </div>

                  <div style={{ borderBottom: '1px solid var(--border-glass)', margin: '0.25rem 0' }} />

                  {uniqueLocations.map(loc => {
                    const isChecked = locationFilter.includes(loc);
                    return (
                      <label 
                        key={loc}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.6rem',
                          padding: '0.35rem 0.6rem',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          fontSize: '0.85rem',
                          color: isChecked ? 'var(--accent-primary)' : 'var(--text-primary)',
                          background: isChecked ? 'rgba(102, 252, 241, 0.05)' : 'transparent',
                          userSelect: 'none'
                        }}
                      >
                        <input 
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {
                            setLocationFilter(prev => 
                              prev.includes(loc) ? prev.filter(l => l !== loc) : [...prev, loc]
                            );
                          }}
                          style={{ cursor: 'pointer', accentColor: 'var(--accent-primary)', width: '15px', height: '15px' }}
                        />
                        <span>{loc}</span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="filter-item">
              <span className="filter-item-label">Sort by:</span>
              <select 
                value={sortOption} 
                onChange={(e) => setSortOption(e.target.value as any)}
              >
                <option value="newest">Newest First</option>
                <option value="score">Score (High to Low)</option>
                <option value="salary">Salary (High to Low)</option>
                <option value="remote">Remote First</option>
                <option value="auto_apply">Auto Apply Confidence</option>
              </select>
            </div>

            <div className="filter-item">
              <span className="filter-item-label">Per page:</span>
              <select 
                value={itemsPerPage} 
                onChange={(e) => changeItemsPerPage(Number(e.target.value))}
              >
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>
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
                    <tr key={job.id} id={`job-item-${job.id}`} style={rowStyle}>
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
                            {isEmailJob && (
                              <span title="Discovered via email sync" style={{ color: '#0cc22d', background: 'rgba(12, 194, 45, 0.12)', border: '1px solid rgba(12, 194, 45, 0.3)', padding: '2px 6px', borderRadius: '12px', fontSize: '0.7rem', fontWeight: 600 }}>Emailed Job</span>
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
                          <button onClick={() => toggleArchive(job.id)} className="btn-outline" style={{ padding: '0.3rem 0.5rem', fontSize: '0.8rem', color: job.is_archived ? 'var(--accent-primary)' : undefined, borderColor: job.is_archived ? 'var(--accent-primary)' : undefined }} title={job.is_archived ? "Unsave" : "Save"}>
                            {job.is_archived ? <BookmarkX size={14} /> : <Bookmark size={14} />}
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
              <div key={job.id} id={`job-item-${job.id}`} className={`glass-card job-card${confettiJobId === job.id ? ' confetti' : ''}`} style={cardStyle}>
                <div className="job-header">
                  <div>
                    <div className="job-company" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                      {cleanCompanyName(job.company)}
                      {getConfidenceBadge(job.automation_confidence)}
                      {isUserAdded && (
                        <span title="Added by you via URL" style={{ color: '#a855f7', background: 'rgba(168, 85, 247, 0.12)', border: '1px solid rgba(168, 85, 247, 0.3)', padding: '2px 6px', borderRadius: '12px', fontSize: '0.7rem', fontWeight: 600 }}>Custom Added</span>
                      )}
                      {isEmailJob && (
                        <span title="Discovered via email sync" style={{ color: '#0cc22d', background: 'rgba(12, 194, 45, 0.12)', border: '1px solid rgba(12, 194, 45, 0.3)', padding: '2px 6px', borderRadius: '12px', fontSize: '0.7rem', fontWeight: 600 }}>Emailed Job</span>
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
                    <button onClick={() => toggleArchive(job.id)} className="btn-outline" style={{ padding: '0.24rem 0.42rem', fontSize: '0.85rem', color: job.is_archived ? 'var(--accent-primary)' : undefined, borderColor: job.is_archived ? 'var(--accent-primary)' : undefined }} title={job.is_archived ? "Unsave" : "Save"}>
                      {job.is_archived ? <BookmarkX size={14} /> : <Bookmark size={14} />}
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
            <div 
              className="glass-card" 
              style={{ 
                gridColumn: '1 / -1', 
                textAlign: 'center', 
                padding: '3.5rem 2rem',
                background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.8) 0%, rgba(30, 41, 59, 0.8) 100%)',
                border: '1px dashed rgba(59, 130, 246, 0.4)',
                borderRadius: '20px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '1.25rem',
                boxShadow: '0 12px 40px rgba(0, 0, 0, 0.3)'
              }}
            >
              <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: 'rgba(59, 130, 246, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(59, 130, 246, 0.3)' }}>
                <Sparkles size={32} style={{ color: 'var(--accent-primary)' }} />
              </div>

              <div>
                <h3 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                  {jobs.length === 0 ? "No Jobs Discovered Yet" : "No Jobs Match Selected Filters"}
                </h3>
                <p style={{ margin: '0.5rem 0 0 0', color: 'var(--text-secondary)', fontSize: '1rem', maxWidth: '520px', lineHeight: '1.5' }}>
                  {jobs.length === 0 
                    ? "No job listings are displaying yet. Click Search for Jobs to scan 20+ online job boards, or Scan Inbox for Jobs to import job alert emails."
                    : "Try clearing or adjusting your keyword and location filters to view more opportunities."}
                </p>
              </div>

              {jobs.length === 0 && (
                <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', justifyContent: 'center', marginTop: '0.5rem' }}>
                  <Button 
                    onClick={handleEmailSync} 
                    disabled={isEmailSyncing || isSyncing}
                    variant="outline"
                    size="default"
                    style={{
                      padding: '0.85rem 1.4rem',
                      borderRadius: '12px',
                      fontWeight: 600,
                      fontSize: '0.95rem',
                      border: '1px solid rgb(13 12 12 / 20%)',
                      background: 'rgba(255, 255, 255, 0.05)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.6rem',
                      height: 'auto'
                    }}
                  >
                    <Mail size={18} style={{ color: '#38bdf8' }} />
                    <span>{isEmailSyncing ? 'Scanning Inbox...' : 'Scan Inbox for Jobs'}</span>
                  </Button>

                  <SyncButton 
                    onSyncStateChange={(loading, text, count, isRefining) => {
                      setIsSyncing(loading);
                      setSyncMessage(text);
                      if (loading) {
                        if (count !== undefined) setJobsFoundCount(count);
                        setIsRefiningJobs(!!isRefining);
                      } else {
                        setJobsFoundCount(null);
                        setIsRefiningJobs(false);
                      }
                    }}
                    onSyncComplete={() => {
                      setTimeout(() => {
                        checkAndTriggerDiscoveryNudge();
                      }, 600);
                    }}
                  />
                </div>
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
        jobsFoundCount={jobsFoundCount}
        isRefining={isRefiningJobs}
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

      <DiscoveryNudgeOverlay
        isOpen={showDiscoveryNudge}
        onClose={handleCloseDiscoveryNudge}
      />

      {showNonUsModal && (
        <NonUsJobsFocusModal
          intlJobCount={intlJobCount}
          onKeepAll={() => setShowNonUsModal(false)}
          onUsOnly={(deletedIds) => {
            setJobList((prev: any[]) => prev.filter((j: any) => !deletedIds.includes(j.id)));
            setShowNonUsModal(false);
          }}
        />
      )}
    </>
  );
}
