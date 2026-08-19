"use client";
// Force Railway fresh build trigger
import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { ExternalLink, Filter, Archive, Bookmark, BookmarkX, Mail, LayoutGrid, List, Calendar, MapPin, DollarSign, Clock, CheckCircle2, Check, Trash2, Lock, Sparkles, Zap, ArrowRight, Search, X, ChevronDown, Loader2, SlidersHorizontal, ArrowUpDown, Bot, FileText } from 'lucide-react';
import { cleanCompanyName } from '@/lib/cleaners';
import FeedbackButtons from '@/components/FeedbackButtons';
import SyncButton, { SyncButtonHandle } from '@/components/SyncButton';
import DashboardCleanup from '@/components/DashboardCleanup';
import { useRouter, useSearchParams } from 'next/navigation';
import AddJobUrlBar from '@/components/AddJobUrlBar';
import DashboardDock, { SortOptionType } from '@/components/DashboardDock';
import DashboardFilterModal from '@/components/DashboardFilterModal';
import DashboardSearchModal from '@/components/DashboardSearchModal';
import AddJobModal from '@/components/AddJobModal';
import { useDashboardFeedbackNudge } from '@/hooks/useDashboardFeedbackNudge';
import { US_STATE_ABBRS, extractStateAbbr, isUsLocation, isRemoteLocation, isInternationalLocation, isOutsideUsLocation } from '@/lib/locationUtils';
import { computeRoleMatchScore } from '@/lib/roleMatcher';
import InternationalLocationModal from '@/components/InternationalLocationModal';
import { PageHeader, PageHeaderHeading, PageHeaderDescription, PageHeaderActions } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

import SyncOverlay from './SyncOverlay';
import NonUsJobsFocusModal from '@/components/NonUsJobsFocusModal';
import TrialStatusBanner from '@/components/TrialStatusBanner';
import UpgradePrompt from '@/components/UpgradePrompt';
import { AntiAbuseBanner } from '@/components/AntiAbuseBanner';
import JitResumeUploadModal from '@/components/common/JitResumeUploadModal';
import RoleSuggestionBanner from '@/components/RoleSuggestionBanner';
import { useCommandBar } from '@/contexts/AutoApplyBarContext';


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

export default function DashboardClient({ 
  jobs, 
  userPlanTier = 'FREE', 
  trialEndsAt = null, 
  hasEmailCredentials = false, 
  initialScoresExhausted = false, 
  hasSeenNonUsPrompt = false, 
  noInternational = false, 
  searchLocation = '',
  searchKeyword = '',
  hasBaseResume = false
}: { 
  jobs: any[], 
  userPlanTier?: string, 
  trialEndsAt?: Date | string | null, 
  hasEmailCredentials?: boolean, 
  initialScoresExhausted?: boolean, 
  hasSeenNonUsPrompt?: boolean, 
  noInternational?: boolean, 
  searchLocation?: string,
  searchKeyword?: string,
  hasBaseResume?: boolean
}) {

  const router = useRouter();
  const [jobList, setJobList] = useState<any[]>(jobs || []);
  const [scoresExhausted, setScoresExhausted] = useState(initialScoresExhausted);
  const [isScoringBackground, setIsScoringBackground] = useState(false);
  const [hasResumeState, setHasResumeState] = useState(hasBaseResume);
  const [isJitResumeOpen, setIsJitResumeOpen] = useState(false);
  const [showNonUsModal, setShowNonUsModal] = useState(false);
  const [showIntlLocationModal, setShowIntlLocationModal] = useState(false);
  const [intlJobCount, setIntlJobCount] = useState(0);
  const [isLoaded, setIsLoaded] = useState(false);
  const hasDismissedNonUsModal = useRef(false);

  useEffect(() => {
    setHasResumeState(hasBaseResume);
  }, [hasBaseResume]);

  const [searchRole, setSearchRole] = useState(searchKeyword || '');
  const [searchLocationInput, setSearchLocationInput] = useState(searchLocation || '');
  const [roleSuggestions, setRoleSuggestions] = useState<string[]>([]);
  const syncButtonRef = useRef<SyncButtonHandle>(null);

  const handleSyncComplete = (newJobsCount: number, topRoleSuggestions?: string[]) => {
    if (topRoleSuggestions && topRoleSuggestions.length > 0) {
      setRoleSuggestions(topRoleSuggestions);
    }
  };

  const handleSelectSuggestedRole = (newRole: string) => {
    setSearchRole(newRole);
    try {
      localStorage.setItem('dashboard_search_role', newRole);
    } catch (e) {}
    fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ searchKeyword: newRole }),
    }).catch(() => {});
    setTimeout(() => {
      syncButtonRef.current?.triggerSync();
    }, 50);
  };

  useEffect(() => {
    if (!isLoaded) {
      let savedRole = '';
      let savedLocation = '';
      try {
        savedRole = localStorage.getItem('dashboard_search_role') || '';
        savedLocation = localStorage.getItem('dashboard_search_location') || '';
      } catch (e) {}

      setSearchRole(savedRole || searchKeyword || '');
      setSearchLocationInput(savedLocation || searchLocation || '');
      setIsLoaded(true);
    }
  }, [searchKeyword, searchLocation, isLoaded]);

  useEffect(() => {
    setJobList(jobs || []);
  }, [jobs]);

  // Check if job sync just completed and location preference is outside US
  useEffect(() => {
    try {
      const justSynced = localStorage.getItem('job_agent_just_completed_job_sync') === 'true';
      if (justSynced) {
        localStorage.removeItem('job_agent_just_completed_job_sync');
        if (isOutsideUsLocation(searchLocation)) {
          const dismissedForLoc = localStorage.getItem('intl_sources_notice_dismissed_loc');
          if (dismissedForLoc !== searchLocation) {
            setShowIntlLocationModal(true);
          }
        }
      }
    } catch (e) {}
  }, [searchLocation]);

  const handleKeepAllNonUs = () => {
    hasDismissedNonUsModal.current = true;
    setShowNonUsModal(false);
    try {
      localStorage.setItem('has_seen_non_us_prompt', 'true');
    } catch (e) {}
    fetch('/api/jobs/dismiss-non-us', { method: 'POST' }).catch((err) =>
      console.error('Failed to persist non-US dismiss setting:', err)
    );
  };

  const handleUsOnlyNonUs = (deletedIds: string[]) => {
    hasDismissedNonUsModal.current = true;
    try {
      localStorage.setItem('has_seen_non_us_prompt', 'true');
    } catch (e) {}
    if (deletedIds && deletedIds.length > 0) {
      setJobList((prev: any[]) => prev.filter((j: any) => !deletedIds.includes(j.id)));
    }
    setShowNonUsModal(false);
  };

  // Detect international jobs and show the focus prompt once
  useEffect(() => {
    let localDismissed = false;
    try {
      localDismissed = localStorage.getItem('has_seen_non_us_prompt') === 'true';
    } catch (e) {}

    if (hasSeenNonUsPrompt || noInternational || hasDismissedNonUsModal.current || localDismissed) return;
    const intlJobs = (jobs || []).filter((j: any) => isInternationalLocation(j.location || ''));
    if (intlJobs.length > 0) {
      setIntlJobCount(intlJobs.length);
      setShowNonUsModal(true);
    }
  // Run only on first render / when jobs list changes after a sync
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobs, hasSeenNonUsPrompt, noInternational]);



  const [activeFilter, setActiveFilter] = useState<'all' | 'scored' | 'high_fit' | 'archived'>('all');
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
  const [isEmailSyncing, setIsEmailSyncing] = useState(false);
  const [sortOption, setSortOption] = useState<SortOptionType>('role_match');
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
  const [shouldAutoSync, setShouldAutoSync] = useState(false);
  const [checkedJobs, setCheckedJobs] = useState<Set<string>>(new Set());
  const [isStartingBatch, setIsStartingBatch] = useState(false);

  // Use refs to always have the latest values without stale closures
  const checkedJobsRef = useRef(checkedJobs);
  const jobListRef = useRef(jobList);
  const isStartingBatchRef = useRef(isStartingBatch);
  checkedJobsRef.current = checkedJobs;
  jobListRef.current = jobList;
  isStartingBatchRef.current = isStartingBatch;

  // Stable handler — always reads from refs so no stale closure issues
  const handleStartBatchApply = useCallback(async () => {
    if (checkedJobsRef.current.size === 0 || isStartingBatchRef.current) return;
    setIsStartingBatch(true);
    const selected = jobListRef.current.filter((j) => checkedJobsRef.current.has(j.id));
    setCheckedJobs(new Set());

    try {
      await Promise.all(
        selected.map(async (j) => {
          try {
            await fetch(`/api/auto-apply/${j.id}/start`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ simulationMode: false }),
            });
          } catch (err) {
            console.error('Failed to start auto apply for job:', j.id, err);
          }
        })
      );

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('auto-apply-queue-start'));
      }
    } finally {
      setIsStartingBatch(false);
    }
  }, []); // stable — no deps needed since we use refs

  const { setSelectionState, setPageActions } = useCommandBar();

  const handleDeselectAll = useCallback(() => {
    setCheckedJobs(new Set());
  }, []);

  const handleOpenCleanup = useCallback(() => {
    setIsCleanupModalOpen(true);
  }, []);

  // Sync selection state with Global Command & Bottom Bar
  useEffect(() => {
    if (checkedJobs.size > 0) {
      setSelectionState({
        count: checkedJobs.size,
        isApplying: isStartingBatch,
        onStartApply: handleStartBatchApply,
        onDeselectAll: handleDeselectAll,
        onArchiveDelete: handleOpenCleanup,
      });
    } else {
      setSelectionState(null);
    }
  }, [checkedJobs.size, isStartingBatch, handleStartBatchApply, handleDeselectAll, handleOpenCleanup, setSelectionState]);

  const [activeAnimIndex, setActiveAnimIndex] = useState(0);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [confettiJobId, setConfettiJobId] = useState<string | null>(null);
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);
  const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);
  const [isAddJobModalOpen, setIsAddJobModalOpen] = useState(false);
  const [isCleanupModalOpen, setIsCleanupModalOpen] = useState(false);

  const handleExecuteSearchModal = useCallback((newKeyword: string, newLocation: string) => {
    setSearchRole(newKeyword);
    setSearchLocationInput(newLocation);
    setIsSearchModalOpen(false);
    setTimeout(() => {
      syncButtonRef.current?.triggerSync();
    }, 50);
  }, []);

  const hasActiveFilters = Boolean(
    keywordFilter ||
    sourceFilter !== 'both' ||
    startDate ||
    endDate ||
    locationFilter.length > 0 ||
    sortOption !== 'role_match'
  );

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

  // Handle action query params triggered from Settings / Profile page dock
  useEffect(() => {
    if (!searchParams) return;
    if (searchParams.get('openFilter') === 'true') {
      setIsFilterModalOpen(true);
    }
    if (searchParams.get('openAddJob') === 'true') {
      setIsAddJobModalOpen(true);
    }
    if (searchParams.get('openCleanup') === 'true') {
      setIsCleanupModalOpen(true);
    }
    if (searchParams.get('scanEmail') === 'true') {
      handleEmailSync();
    }
    const isAutoSyncParam = searchParams.get('autoSync') === 'true';
    const isAutoSyncStorage = typeof window !== 'undefined' && localStorage.getItem('job_agent_auto_sync_on_mount') === 'true';
    if (isAutoSyncParam || isAutoSyncStorage) {
      if (typeof window !== 'undefined') {
        localStorage.removeItem('job_agent_auto_sync_on_mount');
      }
      if (!jobs || jobs.length === 0) {
        setShouldAutoSync(true);
      }
    }
    if (
      searchParams.get('openFilter') ||
      searchParams.get('openAddJob') ||
      searchParams.get('openCleanup') ||
      searchParams.get('scanEmail') ||
      searchParams.get('autoSync')
    ) {
      const next = new URL(window.location.href);
      next.searchParams.delete('openFilter');
      next.searchParams.delete('openAddJob');
      next.searchParams.delete('openCleanup');
      next.searchParams.delete('scanEmail');
      next.searchParams.delete('autoSync');
      window.history.replaceState({}, '', next.toString());
    }
  }, [searchParams]);

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
        if (stateFromStorage.searchRole !== undefined) setSearchRole(stateFromStorage.searchRole);
      } catch (e) {
        console.error('Failed to parse dashboard state from local storage', e);
      }
    }

    const savedSearchRole = typeof window !== 'undefined' ? localStorage.getItem('dashboard_search_role') : null;
    if (savedSearchRole !== null && stateFromStorage.searchRole === undefined) {
      setSearchRole(savedSearchRole);
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
      searchRole,
      itemsPerPage,
      currentPage
    }));
    localStorage.setItem('dashboard_search_role', searchRole);
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
  }, [activeFilter, viewMode, sortOption, locationFilter, sourceFilter, startDate, endDate, keywordFilter, searchRole, itemsPerPage, currentPage, isLoaded]);


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

  // Register Dashboard quick actions into the Global Command Bar
  useEffect(() => {
    setPageActions(
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'nowrap' }}>
        {/* Scan Inbox */}
        <button
          type="button"
          onClick={handleEmailSync}
          disabled={isEmailSyncing || isSyncing}
          className="command-bar-btn"
          title="Scan inbox for job alerts"
        >
          {isEmailSyncing ? (
            <Loader2 size={14} className="animate-spin" style={{ color: '#38bdf8' }} />
          ) : (
            <Mail size={14} style={{ color: '#38bdf8' }} />
          )}
          <span>{isEmailSyncing ? 'Scanning...' : 'Scan Inbox'}</span>
        </button>

        {/* Search & Sync Jobs */}
        <button
          type="button"
          onClick={() => setIsSearchModalOpen(true)}
          disabled={isSyncing || isEmailSyncing}
          className="command-bar-btn"
          title="Search 20+ Job Boards"
          data-tour="dashboard-sync-jobs"
        >
          {isSyncing ? (
            <Loader2 size={14} className="animate-spin" style={{ color: '#38bdf8' }} />
          ) : (
            <Search size={14} style={{ color: '#38bdf8' }} />
          )}
          <span>{isSyncing ? 'Searching...' : 'Search Jobs'}</span>
        </button>

        {/* Divider */}
        <div style={{ width: '1px', height: '18px', background: '#30363d', margin: '0 0.15rem' }} />

        {/* Filter Button */}
        <button
          type="button"
          onClick={() => setIsFilterModalOpen(true)}
          className="command-bar-btn"
          style={{ position: 'relative' }}
          title="Filter & Sort Jobs"
        >
          <SlidersHorizontal size={14} style={{ color: '#60a5fa' }} />
          <span>Filter</span>
          {hasActiveFilters && (
            <span
              style={{
                position: 'absolute',
                top: '4px',
                right: '4px',
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                background: '#38bdf8',
                boxShadow: '0 0 6px #38bdf8',
              }}
            />
          )}
        </button>

        {/* Scrape & Add Job */}
        <button
          type="button"
          onClick={() => setIsAddJobModalOpen(true)}
          className="command-bar-btn"
          title="Paste job URL to add to pipeline"
        >
          <Sparkles size={14} style={{ color: '#34d399' }} />
          <span>Add Job</span>
        </button>

        {/* Clean Up Tool */}
        <button
          type="button"
          onClick={() => setIsCleanupModalOpen(true)}
          className="command-bar-btn command-bar-btn-danger"
          title="Clean Up Dashboard"
        >
          <Trash2 size={14} />
          <span>Clean Up</span>
        </button>
      </div>
    );
    return () => setPageActions(null);
  }, [
    isEmailSyncing,
    isSyncing,
    hasActiveFilters,
    setPageActions,
  ]);

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
    const roleTarget = (searchRole || searchKeyword || '').trim();

    const getAiScore = (j: any): number | null => {
      const s = j.opportunity_scores?.[0]?.total_score;
      if (typeof s === 'number' && !isNaN(s)) return s;
      return null;
    };

    result.sort((a, b) => {
      if (sortOption === 'role_match') {
        if (roleTarget) {
          const matchA = computeRoleMatchScore(a.title, roleTarget, a.description);
          const matchB = computeRoleMatchScore(b.title, roleTarget, b.description);
          if (matchB !== matchA) return matchB - matchA;
        }
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }

      if (sortOption === 'newest') {
        const timeA = new Date(a.created_at).getTime();
        const timeB = new Date(b.created_at).getTime();
        if (timeB !== timeA) return timeB - timeA;
        if (roleTarget) {
          const matchA = computeRoleMatchScore(a.title, roleTarget, a.description);
          const matchB = computeRoleMatchScore(b.title, roleTarget, b.description);
          if (matchB !== matchA) return matchB - matchA;
        }
        return 0;
      }

      if (sortOption === 'score_desc' || sortOption === 'score') {
        const scoreA = getAiScore(a);
        const scoreB = getAiScore(b);
        if (scoreA !== null && scoreB !== null) {
          if (scoreB !== scoreA) return scoreB - scoreA;
        } else if (scoreA !== null) {
          return -1;
        } else if (scoreB !== null) {
          return 1;
        }
      } else if (sortOption === 'score_asc') {
        const scoreA = getAiScore(a);
        const scoreB = getAiScore(b);
        if (scoreA !== null && scoreB !== null) {
          if (scoreA !== scoreB) return scoreA - scoreB;
        } else if (scoreA !== null) {
          return -1;
        } else if (scoreB !== null) {
          return 1;
        }
      } else if (sortOption === 'company') {
        const compA = (a.company || '').toLowerCase();
        const compB = (b.company || '').toLowerCase();
        const compDiff = compA.localeCompare(compB);
        if (compDiff !== 0) return compDiff;
      } else if (sortOption === 'salary_desc' || sortOption === 'salary') {
        const salA = extractMaxSalary(a.salary_range);
        const salB = extractMaxSalary(b.salary_range);
        if (salB !== salA) return salB - salA;
      } else if (sortOption === 'salary_asc') {
        const salA = extractMaxSalary(a.salary_range);
        const salB = extractMaxSalary(b.salary_range);
        if (salA !== salB) return salA - salB;
      } else if (sortOption === 'remote') {
        const isRemoteA = isRemoteLocation(a.location || '') ? 1 : 0;
        const isRemoteB = isRemoteLocation(b.location || '') ? 1 : 0;
        if (isRemoteB !== isRemoteA) return isRemoteB - isRemoteA;
      }

      // Role alignment secondary tie-breaker
      if (roleTarget) {
        const matchA = computeRoleMatchScore(a.title, roleTarget, a.description);
        const matchB = computeRoleMatchScore(b.title, roleTarget, b.description);
        if (matchB !== matchA) return matchB - matchA;
      }

      // Recency tie-breaker
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

    return result;
  }, [jobList, activeFilter, locationFilter, sortOption, sourceFilter, startDate, endDate, keywordFilter, searchRole, searchKeyword]);

  const isInitialMount = useRef(true);

  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    changePage(1);
  }, [activeFilter, sortOption, locationFilter, sourceFilter, startDate, endDate, keywordFilter, searchRole]);

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
    if (!hasResumeState) {
      setIsScoringBackground(false);
      return;
    }
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
  }, [currentJobs, router, userPlanTier, scoresExhausted, hasResumeState]);

  return (
    <>
      <div className="animate-fade-in" style={{ paddingBottom: '5.5rem' }}>
        {/* Dark Navy Header Section Container */}
        <div className="dashboard-top-section">
          <PageHeader className="dashboard-page-header">
            <div className="page-header-title-col">
              <PageHeaderHeading className="dashboard-mission-control-title">Mission Control</PageHeaderHeading>
              <PageHeaderDescription className="dashboard-mission-control-subtitle">Your central hub for opportunity management and application tracking</PageHeaderDescription>
            </div>
            <PageHeaderActions className="page-header-banner-col">
              <TrialStatusBanner trialEndsAt={trialEndsAt} planTier={userPlanTier} compact={true} />
            </PageHeaderActions>
          </PageHeader>

          <AntiAbuseBanner />

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

          {showNonUsModal && (
            <NonUsJobsFocusModal
              intlJobCount={intlJobCount}
              onKeepAll={handleKeepAllNonUs}
              onUsOnly={handleUsOnlyNonUs}
            />
          )}

          <InternationalLocationModal
            isOpen={showIntlLocationModal}
            locationPreference={searchLocation}
            onClose={() => {
              try {
                if (searchLocation) {
                  localStorage.setItem('intl_sources_notice_dismissed_loc', searchLocation);
                }
              } catch (e) {}
              setShowIntlLocationModal(false);
            }}
          />

          <div className="responsive-grid stat-cards-grid" style={{ marginBottom: '1.25rem' }} data-tour="dashboard-stats">
            <div 
              className={`glass-card filter-card top-stat-card stat-card-found ${activeFilter === 'all' ? 'active' : ''}`}
              onClick={() => setActiveFilter('all')}
              style={{ cursor: 'pointer', padding: '1.1rem 1.25rem', position: 'relative' }}
            >
              <h4 className="stat-card-label">Jobs Found</h4>
              <h2 className="stat-card-number">{totalDiscovered}</h2>
              {totalDiscovered > 200 && (
                <div className="stat-card-subtext-red">
                  Consider a cleanup
                </div>
              )}
            </div>
            <div 
              className={`glass-card filter-card top-stat-card stat-card-white ${activeFilter === 'scored' ? 'active' : ''}`}
              onClick={() => setActiveFilter('scored')}
              style={{ cursor: 'pointer', padding: '1.1rem 1.25rem' }}
            >
              <h4 className="stat-card-label">
                <span>Scored</span>
                {isScoringBackground && (
                  <span title="Background scoring in progress..." style={{ display: 'inline-flex', alignItems: 'center', marginLeft: '0.35rem' }}>
                    <Loader2 
                      size={13} 
                      className="animate-spin" 
                      style={{ color: '#2563eb', animation: 'spin 1s linear infinite' }} 
                    />
                  </span>
                )}
              </h4>
              <h2 className="stat-card-number">{totalScored}</h2>
            </div>
            <div 
              className={`glass-card filter-card top-stat-card stat-card-white ${activeFilter === 'high_fit' ? 'active' : ''}`}
              onClick={() => setActiveFilter('high_fit')}
              style={{ cursor: 'pointer', padding: '1.1rem 1.25rem' }}
            >
              <h4 className="stat-card-label">Great Matches (&gt;80)</h4>
              <h2 className="stat-card-number number-blue">{highlyScored}</h2>
            </div>
            <div 
              className={`glass-card filter-card top-stat-card stat-card-white ${activeFilter === 'archived' ? 'active' : ''}`}
              onClick={() => setActiveFilter('archived')}
              style={{ cursor: 'pointer', padding: '1.1rem 1.25rem' }}
            >
              <h4 className="stat-card-label">Saved</h4>
              <h2 className="stat-card-number">{totalArchived}</h2>
            </div>
          </div>
        </div>

        {/* Resume Activation Banner (Above Matches Section) */}
        {!hasResumeState && (
          <div 
            className="glass-card animate-fade-in" 
            style={{ 
              background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.08) 0%, rgba(59, 130, 246, 0.04) 100%)',
              border: '1px solid rgba(99, 102, 241, 0.25)',
              borderRadius: '12px',
              padding: '1.1rem 1.35rem',
              marginTop: '2.5rem',
              marginBottom: '3rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '1rem'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', flex: 1, minWidth: '280px' }}>
              <div style={{
                width: '42px',
                height: '42px',
                borderRadius: '10px',
                background: 'rgba(99, 102, 241, 0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--accent-primary, #6366f1)',
                flexShrink: 0
              }}>
                <Sparkles size={22} />
              </div>
              <div>
                <h4 style={{ margin: '0 0 0.2rem 0', fontSize: '0.96rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                  Unlock AI Opportunity Fit Scoring & Auto-Apply
                </h4>
                <p style={{ margin: 0, fontSize: '0.84rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                  Upload your resume to evaluate match breakdown across all opportunities and enable 1-click tailored application generation.
                </p>
              </div>
            </div>
            <button
              onClick={() => setIsJitResumeOpen(true)}
              className="btn-primary"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.65rem 1.25rem',
                fontSize: '0.88rem',
                fontWeight: 600,
                whiteSpace: 'nowrap'
              }}
            >
              <FileText size={16} /> Upload Resume
            </button>
          </div>
        )}

        {/* Matches Section Header Bar */}
        <div className="matches-header-bar" style={{ marginBottom: '2rem', marginTop: '-0.5rem' }}>
          <div className="matches-header-left-group">
            <div className="matches-title-wrapper" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
              <h3 className="matches-header-title" style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700, color: 'var(--text-primary)', whiteSpace: 'nowrap', lineHeight: '36px' }}>
                Matches ({filteredAndSortedJobs.length})
              </h3>
            </div>

            {/* Target Job Title / Role Search Field with Label */}
            <div className="matches-search-field-group" style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
              <label 
                htmlFor="dashboard-search-role"
                style={{ 
                  fontSize: '0.72rem', 
                  fontWeight: 700, 
                  textTransform: 'uppercase', 
                  letterSpacing: '0.04em', 
                  color: 'var(--text-secondary)' 
                }}
              >
                Job Title
              </label>
              <div 
                className="matches-search-input-wrapper"
                style={{
                  position: 'relative',
                  display: 'flex',
                  alignItems: 'center',
                  minWidth: '200px',
                  maxWidth: '260px',
                  width: '100%'
                }}
              >
                <Search 
                  size={14} 
                  style={{ 
                    position: 'absolute', 
                    left: '11px', 
                    color: 'var(--text-secondary)', 
                    pointerEvents: 'none',
                    opacity: 0.8
                  }} 
                />
                <input
                  id="dashboard-search-role"
                  type="text"
                  value={searchRole}
                  onChange={(e) => {
                    const val = e.target.value;
                    setSearchRole(val);
                    if (typeof window !== 'undefined') {
                      localStorage.setItem('dashboard_search_role', val);
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      syncButtonRef.current?.triggerSync();
                    }
                  }}
                  placeholder={searchKeyword || 'e.g. Product Manager'}
                  title="Job title or role to search for"
                  className="matches-search-input"
                  style={{
                    width: '100%',
                    padding: '0.4rem 2rem 0.4rem 2.1rem',
                    fontSize: '0.85rem',
                    borderRadius: '8px',
                    border: '1px solid var(--border-glass, rgba(255, 255, 255, 0.15))',
                    background: 'var(--bg-glass, rgba(0, 0, 0, 0.2))',
                    color: 'var(--text-primary)',
                    outline: 'none',
                    height: '36px',
                    boxSizing: 'border-box'
                  }}
                />
                {searchRole ? (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchRole('');
                      if (typeof window !== 'undefined') {
                        localStorage.setItem('dashboard_search_role', '');
                      }
                    }}
                    title="Clear job title"
                    style={{
                      position: 'absolute',
                      right: '8px',
                      background: 'none',
                      border: 'none',
                      color: 'var(--text-secondary)',
                      cursor: 'pointer',
                      padding: '2px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderRadius: '50%'
                    }}
                  >
                    <X size={13} />
                  </button>
                ) : null}
              </div>
            </div>

            {/* Target Location Search Field with Label */}
            <div className="matches-search-field-group" style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
              <label 
                htmlFor="dashboard-search-location"
                style={{ 
                  fontSize: '0.72rem', 
                  fontWeight: 700, 
                  textTransform: 'uppercase', 
                  letterSpacing: '0.04em', 
                  color: 'var(--text-secondary)' 
                }}
              >
                Location
              </label>
              <div 
                className="matches-search-input-wrapper"
                style={{
                  position: 'relative',
                  display: 'flex',
                  alignItems: 'center',
                  minWidth: '180px',
                  maxWidth: '240px',
                  width: '100%'
                }}
              >
                <MapPin 
                  size={14} 
                  style={{ 
                    position: 'absolute', 
                    left: '11px', 
                    color: 'var(--text-secondary)', 
                    pointerEvents: 'none',
                    opacity: 0.8
                  }} 
                />
                <input
                  id="dashboard-search-location"
                  type="text"
                  value={searchLocationInput}
                  onChange={(e) => {
                    const val = e.target.value;
                    setSearchLocationInput(val);
                    if (typeof window !== 'undefined') {
                      localStorage.setItem('dashboard_search_location', val);
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      syncButtonRef.current?.triggerSync();
                    }
                  }}
                  placeholder={searchLocation || 'e.g. Remote, San Francisco'}
                  title="Location to search for (defaults to your location preference)"
                  className="matches-search-input"
                  style={{
                    width: '100%',
                    padding: '0.4rem 2rem 0.4rem 2.1rem',
                    fontSize: '0.85rem',
                    borderRadius: '8px',
                    border: '1px solid var(--border-glass, rgba(255, 255, 255, 0.15))',
                    background: 'var(--bg-glass, rgba(0, 0, 0, 0.2))',
                    color: 'var(--text-primary)',
                    outline: 'none',
                    height: '36px',
                    boxSizing: 'border-box'
                  }}
                />
                {searchLocationInput ? (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchLocationInput('');
                      if (typeof window !== 'undefined') {
                        localStorage.setItem('dashboard_search_location', '');
                      }
                    }}
                    title="Clear location"
                    style={{
                      position: 'absolute',
                      right: '8px',
                      background: 'none',
                      border: 'none',
                      color: 'var(--text-secondary)',
                      cursor: 'pointer',
                      padding: '2px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderRadius: '50%'
                    }}
                  >
                    <X size={13} />
                  </button>
                ) : null}
              </div>
            </div>

            {/* Search for Jobs (SyncButton) */}
            <div className="matches-search-btn-wrapper" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
              <SyncButton
                ref={syncButtonRef}
                compact={true}
                searchKeywordOverride={searchRole.trim()}
                searchLocationOverride={searchLocationInput.trim()}
                autoTrigger={shouldAutoSync}
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
                onSyncComplete={() => {}}
              />
            </div>
          </div>

          {/* Action Controls: Scan Inbox | Filter | Sort */}
          <div className="matches-action-controls">
            {/* Scan Inbox */}
            <button
              onClick={handleEmailSync}
              disabled={isEmailSyncing || isSyncing}
              className="action-control-btn btn-scan-inbox"
              title={hasEmailCredentials ? 'Scan your synced email inbox for new job alerts' : 'Connect an email to scan for jobs'}
              style={{
                background: isEmailSyncing ? 'rgba(56, 189, 248, 0.2)' : 'rgba(56, 189, 248, 0.1)',
                border: '1px solid rgba(56, 189, 248, 0.25)',
                color: '#38bdf8',
                opacity: isEmailSyncing || isSyncing ? 0.6 : 1,
                cursor: isEmailSyncing || isSyncing ? 'not-allowed' : 'pointer'
              }}
            >
              <Mail size={15} className={isEmailSyncing ? 'animate-spin' : ''} />
              <span>{isEmailSyncing ? 'Scanning Inbox...' : 'Scan Inbox'}</span>
            </button>

            {/* Global Search Button */}
            <button
              onClick={() => setIsSearchModalOpen(true)}
              className="action-control-btn btn-search-trigger"
              style={{
                background: 'rgba(0, 112, 243, 0.1)',
                border: '1px solid rgba(0, 112, 243, 0.25)',
                color: '#0070f3',
              }}
              title="Search and aggregate across 20+ live job platforms"
            >
              <Search size={15} />
              <span>Search Online</span>
            </button>

            {/* Filter Toggle Button */}
            <div style={{ position: 'relative' }}>
              <button
                onClick={() => setIsFilterModalOpen(true)}
                className={`action-control-btn btn-filter ${hasActiveFilters ? 'active-filter' : ''}`}
                style={{
                  position: 'relative',
                  background: hasActiveFilters ? 'rgba(0, 112, 243, 0.15)' : undefined,
                  borderColor: hasActiveFilters ? '#0070f3' : undefined,
                  color: hasActiveFilters ? '#0070f3' : undefined,
                }}
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
            </div>

            {/* Sort Selector Dropdown */}
            <div
              className="action-control-btn btn-sort"
              title="Sort Job Feed"
            >
              <ArrowUpDown size={15} style={{ color: '#2563eb', flexShrink: 0 }} />
              <select
                value={sortOption}
                onChange={(e) => setSortOption(e.target.value as any)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'inherit',
                  fontSize: '0.85rem',
                  fontWeight: 500,
                  cursor: 'pointer',
                  outline: 'none',
                  appearance: 'none',
                  WebkitAppearance: 'none',
                  width: '100%'
                }}
              >
                <option value="role_match" style={{ background: '#ffffff', color: '#0f172a' }}>Role Match</option>
                <option value="newest" style={{ background: '#ffffff', color: '#0f172a' }}>Newest First</option>
                <option value="score_desc" style={{ background: '#ffffff', color: '#0f172a' }}>Match Score (High-Low)</option>
                <option value="score_asc" style={{ background: '#ffffff', color: '#0f172a' }}>Match Score (Low-High)</option>
                <option value="company" style={{ background: '#ffffff', color: '#0f172a' }}>Company (A-Z)</option>
                <option value="salary_desc" style={{ background: '#ffffff', color: '#0f172a' }}>Salary (High-Low)</option>
                <option value="remote" style={{ background: '#ffffff', color: '#0f172a' }}>Remote First</option>
              </select>
            </div>

            <div className="dashboard-view-toggles">
              <button 
                onClick={() => setViewMode('grid')}
                className={`view-toggle-btn ${viewMode === 'grid' ? 'active' : ''}`}
                title="Grid View"
              >
                <LayoutGrid size={18} />
              </button>
              <button 
                onClick={() => setViewMode('table')}
                className={`view-toggle-btn ${viewMode === 'table' ? 'active' : ''}`}
                title="Table View"
              >
                <List size={18} />
              </button>
            </div>
          </div>
        </div>
      
      {roleSuggestions.length > 0 && (
        <RoleSuggestionBanner
          suggestions={roleSuggestions}
          currentKeyword={searchRole}
          onSelectRole={handleSelectSuggestedRole}
          onDismiss={() => setRoleSuggestions([])}
        />
      )}
      
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
                            {job.isEasyApply && (
                              <span title="In-network Easy Apply role (requires personal account)" style={{ color: '#0284c7', background: 'rgba(2, 132, 199, 0.12)', border: '1px solid rgba(2, 132, 199, 0.3)', padding: '2px 6px', borderRadius: '12px', fontSize: '0.7rem', fontWeight: 600 }}>
                                {job.source && !job.source.toLowerCase().includes('google') ? `${job.source} Easy Apply` : 'Easy Apply'}
                              </span>
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
                          {/* 1. Delete */}
                          <button onClick={() => deleteJob(job.id)} className="btn-outline" style={{ padding: '0.3rem 0.5rem', fontSize: '0.8rem', color: 'var(--danger)', borderColor: 'var(--danger)' }} title="Delete">
                            <Trash2 size={14} />
                          </button>
                          {/* 2. Save */}
                          <button onClick={() => toggleArchive(job.id)} className="btn-outline" style={{ padding: '0.3rem 0.5rem', fontSize: '0.8rem', color: job.is_archived ? 'var(--accent-primary)' : undefined, borderColor: job.is_archived ? 'var(--accent-primary)' : undefined }} title={job.is_archived ? "Unsave" : "Save"}>
                            {job.is_archived ? <BookmarkX size={14} /> : <Bookmark size={14} />}
                          </button>
                          {/* 3. Original */}
                          <a href={job.url} target="_blank" rel="noreferrer" onClick={() => handleMarkViewed(job.id)} className="btn-outline" style={{ padding: '0.3rem 0.6rem', fontSize: '0.8rem' }} title="Original">
                            <ExternalLink size={14} />
                          </a>
                          {/* 4. Details */}
                          <Link href={`/job/${job.id}`} onClick={() => handleMarkViewed(job.id)} className="btn-primary" style={{ padding: '0.3rem 0.6rem', fontSize: '0.8rem' }}>
                            Details
                          </Link>
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
                background: 'linear-gradient(135deg, rgba(168, 85, 247, 0.02) 0%, rgba(255, 255, 255, 0.01) 100%)'
              } : isEmailJob ? {
                '--accent-primary': '#0cc22d',
                '--accent-secondary': '#09a026',
                '--accent-glow': 'rgba(12, 194, 45, 0.15)'
              } : {})
            };
            
            return (
              <div key={job.id} id={`job-item-${job.id}`} className={`glass-card job-card${confettiJobId === job.id ? ' confetti' : ''}`} style={cardStyle}>
                {/* Top Header: Company Name, Badges & Score */}
                <div className="job-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.75rem', marginBottom: '0.5rem' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--accent-primary, #0070f3)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                      {cleanCompanyName(job.company)}
                      {getConfidenceBadge(job.automation_confidence)}
                      {isUserAdded && (
                        <span title="Added by you via URL" style={{ color: '#a855f7', background: 'rgba(168, 85, 247, 0.12)', border: '1px solid rgba(168, 85, 247, 0.3)', padding: '2px 6px', borderRadius: '12px', fontSize: '0.7rem', fontWeight: 600, textTransform: 'none' }}>Custom Added</span>
                      )}
                      {isEmailJob && (
                        <span title="Discovered via email sync" style={{ color: '#0cc22d', background: 'rgba(12, 194, 45, 0.12)', border: '1px solid rgba(12, 194, 45, 0.3)', padding: '2px 6px', borderRadius: '12px', fontSize: '0.7rem', fontWeight: 600, textTransform: 'none' }}>Emailed Job</span>
                      )}
                      {job.isEasyApply && (
                        <span title="In-network Easy Apply role (requires personal account)" style={{ color: '#0284c7', background: 'rgba(2, 132, 199, 0.12)', border: '1px solid rgba(2, 132, 199, 0.3)', padding: '2px 6px', borderRadius: '12px', fontSize: '0.7rem', fontWeight: 600, textTransform: 'none' }}>
                          {job.source && !job.source.toLowerCase().includes('google') ? `${job.source} Easy Apply` : 'Easy Apply'}
                        </span>
                      )}
                    </div>
                    <Link href={`/job/${job.id}`} onClick={() => handleMarkViewed(job.id)} style={{ textDecoration: 'none' }} className={isEmailJob ? 'email-job-title' : 'job-title'}>
                      <h3 style={{ cursor: 'pointer', margin: 0, fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)' }}>{job.title}</h3>
                    </Link>
                  </div>

                  {score ? (
                    <div className={`score-badge ${scoreClass}`} style={{ fontSize: '1.2rem', fontWeight: 700, padding: '0.4rem 0.75rem', borderRadius: '12px', flexShrink: 0 }}>
                      {score}
                    </div>
                  ) : scoresExhausted ? (
                    <div 
                      onClick={() => setShowUpgradeModal(true)} 
                      title="Weekly score allowance reached. Click to upgrade to Pro!" 
                      className="score-badge" 
                      style={{ cursor: 'pointer', background: 'rgba(255, 255, 255, 0.05)', border: '1px dashed rgba(255, 255, 255, 0.2)', color: 'var(--text-secondary)', padding: '0.4rem 0.75rem', borderRadius: '12px', flexShrink: 0 }}
                    >
                      <Lock size={16} />
                    </div>
                  ) : null}
                </div>
                
                {/* Metadata Row */}
                <div className="job-meta" style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap', marginBottom: '0.875rem' }}>
                  <span className="job-meta-item" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                    <MapPin size={15} /> {job.location || 'Remote'}
                  </span>
                  <span className="job-meta-item" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                    <DollarSign size={15} /> {job.salary_range || 'Not Listed'}
                  </span>
                  <span className="job-meta-item" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                    <Clock size={14} /> {safeFormatDate(job.created_at)}
                  </span>
                </div>
                
                {/* Status Badge */}
                <div style={{ marginTop: 'auto', marginBottom: '1rem' }}>
                  {getEffectiveStatus(job) === 'applied' ? (
                    <span className="badge badge-applied" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '0.35rem 0.85rem', borderRadius: '9999px', background: 'rgba(0, 112, 243, 0.1)', border: '1px solid rgba(0, 112, 243, 0.3)', color: 'var(--accent-primary)', fontSize: '0.85rem', fontWeight: 500 }}>
                      <CheckCircle2 size={15} /> Applied {safeFormatDate(job.applied_at)}
                    </span>
                  ) : (
                    <span className={`badge badge-${getEffectiveStatus(job)}`} style={{ padding: '0.35rem 0.85rem', borderRadius: '9999px', fontSize: '0.85rem', fontWeight: 500 }}>
                      {getEffectiveStatus(job).replace('_', ' ')}
                    </span>
                  )}
                </div>
                
                {/* Horizontal Action Bar (Single Line: Thumbs, Delete, Save, Original, Details, Checkbox) */}
                <div className="dashboard-job-action-row" style={{ paddingTop: '0.85rem', borderTop: '1px solid var(--border-glass)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.3rem', width: '100%' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', flexShrink: 0 }}>
                    {/* Thumbs Up & Thumbs Down */}
                    <FeedbackButtons
                      jobId={job.id}
                      initialFeedback={feedbackObj?.feedback_type as 'like' | 'dislike' | undefined}
                      compact
                      showNudgeTooltip={nudgeJobId === job.id}
                      nudgeVariant="dashboard"
                      onNudgeDismiss={handleNudgeDismiss}
                      onFeedbackGiven={handleNudgeFeedbackGiven}
                    />

                    {/* Delete */}
                    <button 
                      onClick={() => deleteJob(job.id)} 
                      className="btn-outline card-icon-action-btn" 
                      style={{ color: 'var(--danger)', borderColor: 'var(--danger)' }} 
                      title="Delete"
                    >
                      <Trash2 size={15} />
                    </button>

                    {/* Save / Bookmark */}
                    <button 
                      onClick={() => toggleArchive(job.id)} 
                      className="btn-outline card-icon-action-btn" 
                      style={{ color: job.is_archived ? 'var(--accent-primary)' : undefined, borderColor: job.is_archived ? 'var(--accent-primary)' : undefined }} 
                      title={job.is_archived ? "Unsave" : "Save"}
                    >
                      {job.is_archived ? <BookmarkX size={15} /> : <Bookmark size={15} />}
                    </button>

                    {/* Original */}
                    <a 
                      href={job.url} 
                      target="_blank" 
                      rel="noreferrer" 
                      onClick={() => handleMarkViewed(job.id)} 
                      className="btn-outline card-icon-action-btn original-link-btn"
                      title="Original Job Listing"
                    >
                      <ExternalLink size={15} />
                    </a>

                    {/* Details */}
                    <Link 
                      href={`/job/${job.id}`} 
                      onClick={() => handleMarkViewed(job.id)} 
                      className="btn-primary card-label-action-btn"
                    >
                      Details
                    </Link>
                  </div>

                  {/* Checkbox */}
                  <input 
                    type="checkbox" 
                    checked={checkedJobs.has(job.id)} 
                    onChange={() => toggleJobCheck(job.id)}
                    style={{ cursor: 'pointer', width: '20px', height: '20px', borderRadius: '4px', flexShrink: 0, marginLeft: 'auto' }}
                    title="Select job"
                  />
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
                background: 'var(--card)',
                border: '1px dashed var(--accent-primary)',
                borderRadius: '20px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '1.25rem',
                boxShadow: 'var(--shadow-md)',
                color: 'var(--card-foreground)'
              }}
            >
              <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: 'var(--accent-glow)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--border)' }}>
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
                      border: '1px solid var(--border)',
                      background: 'var(--secondary)',
                      color: 'var(--foreground)',
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
                    onSyncComplete={handleSyncComplete}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {filteredAndSortedJobs.length > 0 && (
        <div 
          className="dashboard-pagination-card"
          style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center', 
            gap: '1rem', 
            marginTop: '2rem', 
            marginBottom: '2rem', 
            padding: '1.25rem', 
            background: 'var(--card)', 
            borderRadius: 'var(--radius-lg, 0.625rem)', 
            border: '1px solid var(--border)' 
          }}
        >
          <div style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
            Showing <strong style={{ color: 'var(--text-primary)' }}>{filteredAndSortedJobs.length > 0 ? startIndex + 1 : 0}–{endIndex}</strong> of <strong style={{ color: 'var(--text-primary)' }}>{filteredAndSortedJobs.length}</strong> jobs
          </div>

          <div className="dashboard-pagination-controls" style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>Per page:</span>
              <select 
                value={itemsPerPage} 
                onChange={(e) => changeItemsPerPage(Number(e.target.value))}
                style={{ background: 'var(--input, var(--card))', color: 'var(--text-primary)', border: '1px solid var(--border)', padding: '0.4rem 0.6rem', borderRadius: 'var(--radius, 6px)', fontSize: '16px', minHeight: '38px' }}
              >
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>

            {totalPages > 1 && (
              <div className="pagination-nav-grid" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <button 
                  className="btn-outline" 
                  disabled={currentPage === 1}
                  onClick={() => {
                    changePage(Math.max(1, currentPage - 1));
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  style={{ padding: '0.5rem 1rem', minHeight: '44px' }}
                >
                  Previous
                </button>
                <span style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', textAlign: 'center', whiteSpace: 'nowrap' }}>
                  Page {currentPage} of {totalPages}
                </span>
                <button 
                  className="btn-outline" 
                  disabled={currentPage === totalPages}
                  onClick={() => {
                    changePage(Math.min(totalPages, currentPage + 1));
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  style={{ padding: '0.5rem 1rem', minHeight: '44px' }}
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
              <a href="/api/stripe/checkout" className="btn-primary" onClick={() => setShowUpgradeModal(false)}>Upgrade Plan</a>
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





      {/* Dashboard Filter Modal */}
      <DashboardFilterModal
        isOpen={isFilterModalOpen}
        onClose={() => setIsFilterModalOpen(false)}
        keywordFilter={keywordFilter}
        setKeywordFilter={setKeywordFilter}
        sourceFilter={sourceFilter}
        setSourceFilter={setSourceFilter}
        startDate={startDate}
        setStartDate={setStartDate}
        endDate={endDate}
        setEndDate={setEndDate}
        locationFilter={locationFilter}
        setLocationFilter={setLocationFilter}
        uniqueLocations={uniqueLocations}
        totalMatches={filteredAndSortedJobs.length}
        sortOption={sortOption}
        setSortOption={setSortOption}
        activeFilter={activeFilter}
        setActiveFilter={setActiveFilter}
      />

      {/* Dashboard Search Jobs Modal (from Bottom Command Bar) */}
      <DashboardSearchModal
        isOpen={isSearchModalOpen}
        onClose={() => setIsSearchModalOpen(false)}
        defaultKeyword={searchRole || searchKeyword}
        defaultLocation={searchLocationInput || searchLocation}
        onSearch={handleExecuteSearchModal}
      />

      {/* Add Job Modal */}
      <AddJobModal
        isOpen={isAddJobModalOpen}
        onClose={() => setIsAddJobModalOpen(false)}
        userPlanTier={userPlanTier === 'PRO' || (trialEndsAt && new Date(trialEndsAt) > new Date()) ? 'PRO' : 'FREE'}
        onJobAdded={(newJob) => setJobList((prev) => [newJob, ...prev])}
      />





      {/* Cleanup Modal */}
      <DashboardCleanup
        isOpen={isCleanupModalOpen}
        onClose={() => setIsCleanupModalOpen(false)}
        hideTriggerButton={true}
        checkedJobs={[...checkedJobs]}
        onCleanupComplete={() => {
          setCheckedJobs(new Set());
          router.refresh();
        }}
      />

      {/* JIT Resume Upload Modal for Dashboard */}
      <JitResumeUploadModal
        isOpen={isJitResumeOpen}
        onClose={() => setIsJitResumeOpen(false)}
        onSuccess={() => {
          setHasResumeState(true);
          setIsJitResumeOpen(false);
          router.refresh();
        }}
        title="Upload Base Resume"
        description="Add your base master resume to activate personalized AI opportunity scoring, candidate match breakdown, and 1-click tailored application assets."
      />
    </>
  );
}
