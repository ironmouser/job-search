"use client";

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  ChevronLeft,
  ChevronRight,
  Sparkles,
  CheckCircle2,
  ExternalLink,
  Zap,
  HelpCircle,
  SlidersHorizontal,
  Loader2,
  FileText,
} from 'lucide-react';
import FeedbackButtons from './FeedbackButtons';
import { useJobNav } from './JobDetailsNavWrapper';
import JobDetailsFilterModal from './JobDetailsFilterModal';
import { trackDockAction } from '@/lib/analytics';
import JitResumeUploadModal from './common/JitResumeUploadModal';
import { useCommandBar } from '@/contexts/AutoApplyBarContext';

interface JobDetailsActionBarProps {
  currentJobId: string;
  initialFeedback?: 'like' | 'dislike' | null;
  initialIsArchived?: boolean;
  hasAssets?: boolean;
  jobUrl?: string;
  status?: string;
  isPro?: boolean;
}

export default function JobDetailsActionBar({
  currentJobId,
  initialFeedback,
  initialIsArchived = false,
  hasAssets = false,
  jobUrl = '',
  status = 'discovered',
  isPro = false,
}: JobDetailsActionBarProps) {
  const router = useRouter();
  const { triggerNavigate, registerSwipeHandlers } = useJobNav();
  const { setPageActions } = useCommandBar();

  const [sequence, setSequence] = useState<any[]>([]);
  const [loadingSeq, setLoadingSeq] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isAutoApplying, setIsAutoApplying] = useState(false);
  const [isJitResumeOpen, setIsJitResumeOpen] = useState(false);
  const [localHasAssets, setLocalHasAssets] = useState(hasAssets);
  const prefetchedJobs = useRef<Set<string>>(new Set());

  useEffect(() => {
    setLocalHasAssets(hasAssets);
  }, [hasAssets]);

  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);
  const [hasActiveFilters, setHasActiveFilters] = useState(false);

  const loadSequence = async () => {
    try {
      let stateObj: any = {};
      if (typeof window !== 'undefined') {
        const saved = localStorage.getItem('jobAgentDashboardState');
        if (saved) {
          try {
            stateObj = JSON.parse(saved);
          } catch (e) {}
        }
      }

      const active = Boolean(
        stateObj.keywordFilter ||
        (stateObj.activeFilter && stateObj.activeFilter !== 'all') ||
        (stateObj.sortOption && stateObj.sortOption !== 'role_match') ||
        (stateObj.sourceFilter && stateObj.sourceFilter !== 'both') ||
        stateObj.startDate ||
        stateObj.endDate
      );
      setHasActiveFilters(active);

      const params = new URLSearchParams();
      const roleKeyword = stateObj.searchRole || (typeof window !== 'undefined' ? localStorage.getItem('dashboard_search_role') : null);
      if (roleKeyword) params.set('searchRole', roleKeyword);
      if (stateObj.activeFilter) params.set('activeFilter', stateObj.activeFilter);
      if (stateObj.sortOption) params.set('sortOption', stateObj.sortOption);
      if (stateObj.sourceFilter) params.set('sourceFilter', stateObj.sourceFilter);
      if (stateObj.startDate) params.set('startDate', stateObj.startDate);
      if (stateObj.endDate) params.set('endDate', stateObj.endDate);
      if (stateObj.keywordFilter) params.set('keywordFilter', stateObj.keywordFilter);
      if (stateObj.locationFilter) params.set('locationFilter', JSON.stringify(stateObj.locationFilter));

      const res = await fetch(`/api/jobs/sequence?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setSequence(data.sequence || data.jobs || []);
      }
    } catch (e) {
      console.error('Failed to load sequence for job action bar:', e);
    } finally {
      setLoadingSeq(false);
    }
  };

  useEffect(() => {
    loadSequence();
  }, [currentJobId]);

  const currentIndex = sequence.findIndex(j => j.id === currentJobId);
  const prevJob = currentIndex > 0 ? sequence[currentIndex - 1] : null;
  const nextJob = currentIndex >= 0 && currentIndex < sequence.length - 1 ? sequence[currentIndex + 1] : null;

  // Background Prefetch
  useEffect(() => {
    if (prevJob && !prefetchedJobs.current.has(prevJob.id)) {
      router.prefetch(`/job/${prevJob.id}`);
      prefetchedJobs.current.add(prevJob.id);
    }
    if (nextJob && !prefetchedJobs.current.has(nextJob.id)) {
      router.prefetch(`/job/${nextJob.id}`);
      prefetchedJobs.current.add(nextJob.id);
    }
  }, [prevJob, nextJob, router]);

  const handlePrev = () => {
    if (!prevJob) return;
    trackDockAction('navigate_prev', currentJobId, { target_id: prevJob.id });
    const targetUrl = `/job/${prevJob.id}`;
    window.scrollTo({ top: 0, behavior: 'instant' });
    triggerNavigate('prev', targetUrl, () => {
      router.push(targetUrl);
    });
  };

  const handleNext = () => {
    if (!nextJob) return;
    trackDockAction('navigate_next', currentJobId, { target_id: nextJob.id });
    const targetUrl = `/job/${nextJob.id}`;
    window.scrollTo({ top: 0, behavior: 'instant' });
    triggerNavigate('next', targetUrl, () => {
      router.push(targetUrl);
    });
  };

  useEffect(() => {
    registerSwipeHandlers(
      nextJob ? handleNext : null,
      prevJob ? handlePrev : null
    );
    return () => registerSwipeHandlers(null, null);
  }, [nextJob, prevJob, registerSwipeHandlers]);

  // Keyboard navigation shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement;
      const isInput = activeEl?.tagName === 'INPUT' || activeEl?.tagName === 'TEXTAREA' || activeEl?.getAttribute('contenteditable') === 'true';
      if (isInput) return;

      if (e.key === 'ArrowRight' || e.key === 'j' || e.key === 'J') {
        if (nextJob) {
          e.preventDefault();
          handleNext();
        }
      } else if (e.key === 'ArrowLeft' || e.key === 'k' || e.key === 'K') {
        if (prevJob) {
          e.preventDefault();
          handlePrev();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [nextJob, prevJob]);

  const handleStep1Review = () => {
    trackDockAction('step1_review', currentJobId);
    const element = document.getElementById('step-1-review');
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleStep2Generate = async () => {
    trackDockAction('step2_generate_assets', currentJobId);
    const element = document.getElementById('step-2-assets');
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }

    if (localHasAssets || isGenerating) return;

    try {
      setIsGenerating(true);
      const res = await fetch(`/api/jobs/${currentJobId}/tailor`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ force: true })
      });
      if (res.ok) {
        setLocalHasAssets(true);
        router.refresh();
      } else if (res.status === 400) {
        const data = await res.json();
        if (data.code === 'NO_RESUME') {
          setIsJitResumeOpen(true);
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleStep3AutoApply = async () => {
    trackDockAction('step3_auto_apply', currentJobId);
    const element = document.getElementById('step-3-apply');
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }

    try {
      setIsAutoApplying(true);
      await fetch(`/api/auto-apply/${currentJobId}/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ simulationMode: false })
      });
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('auto-apply-queue-start'));
      }
    } catch (err) {
      console.error('Failed to trigger auto apply:', err);
      setIsAutoApplying(false);
    }
  };

  const handleStep4QA = () => {
    trackDockAction('step4_qa', currentJobId);
    const element = document.getElementById('step-4-qa');
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
  };

  // Register Job Page actions into the Global Command Bar
  useEffect(() => {
    setPageActions(
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'nowrap' }}>
        {/* Save & Feedback */}
        <FeedbackButtons
          jobId={currentJobId}
          initialFeedback={initialFeedback}
          initialIsArchived={initialIsArchived}
          showSaveForLater={true}
          compact={true}
        />

        <div style={{ width: '1px', height: '18px', background: 'rgba(255, 255, 255, 0.15)', margin: '0 0.15rem' }} />

        {/* Prev & Next Navigation Buttons (without step number) */}
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
          <button
            type="button"
            onClick={handlePrev}
            disabled={!prevJob || currentIndex <= 0}
            className="command-bar-btn"
            title="Previous Job"
            style={{ padding: '0.32rem 0.55rem' }}
          >
            <ChevronLeft size={14} />
          </button>

          <button
            type="button"
            onClick={handleNext}
            disabled={!nextJob || currentIndex >= sequence.length - 1}
            className="command-bar-btn"
            title="Next Job"
            style={{ opacity: (!nextJob || currentIndex >= sequence.length - 1) ? 0.45 : 1 }}
          >
            <span>Next</span> <ChevronRight size={14} />
          </button>
        </div>

        <div style={{ width: '1px', height: '18px', background: 'rgba(255, 255, 255, 0.15)', margin: '0 0.15rem' }} />

        {/* Step 1: Review Job */}
        <button
          type="button"
          onClick={handleStep1Review}
          className="command-bar-btn"
          title="Jump to Job Description"
        >
          <span style={{ opacity: 0.75, fontSize: '0.75rem' }}>1.</span>
          <FileText size={14} />
          <span>Review Job</span>
        </button>

        {/* Step 2: Generate Assets */}
        <button
          type="button"
          onClick={handleStep2Generate}
          className="command-bar-btn"
          title={localHasAssets ? "Assets Generated — Scroll to view" : "Generate Cover Letter & Resume Extract"}
        >
          <span style={{ opacity: 0.75, fontSize: '0.75rem' }}>2.</span>
          {localHasAssets ? (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', color: '#34d399' }}>
              <CheckCircle2 size={14} /> Assets Ready
            </span>
          ) : (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
              <Sparkles size={14} style={{ color: '#38bdf8' }} /> {isGenerating ? 'Generating...' : 'Assets'}
            </span>
          )}
        </button>

        {/* Step 3: Apply */}
        <button
          type="button"
          onClick={handleStep3AutoApply}
          disabled={isAutoApplying}
          className={`command-bar-btn ${status === 'applied' ? '' : 'command-bar-btn-primary'}`}
          style={status === 'applied' ? { background: 'rgba(16, 185, 129, 0.2)', borderColor: '#10b981', color: '#34d399' } : {}}
        >
          <span style={{ opacity: 0.8, fontSize: '0.75rem' }}>3.</span>
          {status === 'applied' ? (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', color: '#34d399' }}>
              <CheckCircle2 size={14} /> Applied
            </span>
          ) : isAutoApplying ? (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', color: '#ffffff' }}>
              <Loader2 size={14} className="animate-spin" /> Auto Applying...
            </span>
          ) : (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
              <Zap size={14} style={{ color: '#fbbf24' }} /> Auto Apply
            </span>
          )}
        </button>

        {/* Step 4: Q&A */}
        <button
          type="button"
          onClick={handleStep4QA}
          className="command-bar-btn"
          title="Jump to Application Q&A"
        >
          <span style={{ opacity: 0.75, fontSize: '0.75rem' }}>4.</span>
          <HelpCircle size={14} />
          <span>Q&A</span>
        </button>

        {/* Filter Button */}
        <button
          type="button"
          onClick={() => setIsFilterModalOpen(true)}
          className="command-bar-btn"
          style={{ position: 'relative' }}
          title="Filter & Sort Job Queue"
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

        {/* Counter */}
        {currentIndex >= 0 && sequence.length > 0 && (
          <span style={{
            fontSize: '0.75rem',
            color: '#f0f6fc',
            fontWeight: 700,
            padding: '0.25rem 0.6rem',
            borderRadius: '6px',
            background: '#161b22',
            border: '1px solid #30363d',
            whiteSpace: 'nowrap',
          }}>
            {currentIndex + 1} / {sequence.length}
          </span>
        )}
      </div>
    );
    return () => setPageActions(null);
  }, [
    currentJobId,
    initialFeedback,
    initialIsArchived,
    localHasAssets,
    isGenerating,
    status,
    hasActiveFilters,
    currentIndex,
    sequence.length,
    prevJob,
    nextJob,
    setPageActions,
  ]);


  return (
    <>
      {/* Modals remain managed at root level */}
      <JobDetailsFilterModal
        isOpen={isFilterModalOpen}
        onClose={() => setIsFilterModalOpen(false)}
        onApply={() => {
          loadSequence();
          setIsFilterModalOpen(false);
        }}
      />

      <JitResumeUploadModal
        isOpen={isJitResumeOpen}
        onClose={() => setIsJitResumeOpen(false)}
        onSuccess={() => {
          setIsJitResumeOpen(false);
          handleStep2Generate();
        }}
      />
    </>
  );
}
