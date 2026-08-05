"use client";

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  ChevronLeft,
  ChevronRight,
  Bookmark,
  BookmarkX,
  ThumbsUp,
  ThumbsDown,
  Layers,
  X,
  Sparkles,
  CheckCircle2,
  ExternalLink,
  Zap,
  HelpCircle,
  FileText,
  Send,
  SlidersHorizontal
} from 'lucide-react';
import FeedbackButtons from './FeedbackButtons';
import { useJobNav } from './JobDetailsNavWrapper';
import JobDetailsFilterModal from './JobDetailsFilterModal';

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
  isPro = false
}: JobDetailsActionBarProps) {
  const router = useRouter();
  const { triggerNavigate } = useJobNav();

  const [sequence, setSequence] = useState<any[]>([]);
  const [loadingSeq, setLoadingSeq] = useState(true);
  const [isFabOpen, setIsFabOpen] = useState(false);
  const [showApplyPopover, setShowApplyPopover] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [localHasAssets, setLocalHasAssets] = useState(hasAssets);
  const [mobileApplyOpen, setMobileApplyOpen] = useState(false);
  const prefetchedJobs = useRef<Set<string>>(new Set());
  const popoverTimeout = useRef<NodeJS.Timeout | null>(null);

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
        (stateObj.sortOption && stateObj.sortOption !== 'newest') ||
        (stateObj.sourceFilter && stateObj.sourceFilter !== 'both') ||
        stateObj.startDate ||
        stateObj.endDate
      );
      setHasActiveFilters(active);

      const params = new URLSearchParams();
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
        if (data.sequence) {
          setSequence(data.sequence);
        }
      }
    } catch (err) {
      console.error('Failed to load job sequence:', err);
    } finally {
      setLoadingSeq(false);
    }
  };

  // Fetch sequence based on saved dashboard state
  useEffect(() => {
    loadSequence();
  }, [currentJobId]);

  const currentIndex = sequence.findIndex(j => j.id === currentJobId);
  const prevJob = currentIndex > 0 ? sequence[currentIndex - 1] : null;
  const nextJob = currentIndex >= 0 && currentIndex < sequence.length - 1 ? sequence[currentIndex + 1] : null;

  // Prefetch routes for Next & Previous
  useEffect(() => {
    if (nextJob?.id) {
      router.prefetch(`/job/${nextJob.id}`);
    }
    if (prevJob?.id) {
      router.prefetch(`/job/${prevJob.id}`);
    }
  }, [nextJob, prevJob, router]);

  // Background fetch & score next 3 jobs
  useEffect(() => {
    if (currentIndex < 0 || sequence.length === 0) return;

    const next3Jobs = sequence.slice(currentIndex + 1, currentIndex + 4);

    next3Jobs.forEach(job => {
      if (!job.id || prefetchedJobs.current.has(job.id)) return;

      if (!job.isScored || !job.isDescriptionAdequate) {
        prefetchedJobs.current.add(job.id);
        fetch('/api/score', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jobId: job.id })
        }).catch(err => {
          console.warn(`Background score trigger failed for job ${job.id}:`, err);
        });
      }
    });
  }, [currentIndex, sequence]);

  const handleNext = () => {
    if (!nextJob) return;
    const targetUrl = `/job/${nextJob.id}`;
    window.scrollTo({ top: 0, behavior: 'instant' });
    triggerNavigate('next', targetUrl, () => {
      router.push(targetUrl);
    });
  };

  const handlePrev = () => {
    if (!prevJob) return;
    const targetUrl = `/job/${prevJob.id}`;
    window.scrollTo({ top: 0, behavior: 'instant' });
    triggerNavigate('prev', targetUrl, () => {
      router.push(targetUrl);
    });
  };

  const handleStep2Generate = async () => {
    const section = document.getElementById('step-2-assets');
    if (section) {
      section.scrollIntoView({ behavior: 'smooth' });
    }

    if (!localHasAssets && !isGenerating) {
      setIsGenerating(true);
      try {
        const res = await fetch('/api/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jobId: currentJobId })
        });
        if (res.ok) {
          setLocalHasAssets(true);
          router.refresh();
        }
      } catch (e) {
        console.error('Failed to generate assets:', e);
      } finally {
        setIsGenerating(false);
      }
    }
  };

  const handleStep3AutoApply = () => {
    setShowApplyPopover(false);
    setMobileApplyOpen(false);
    setIsFabOpen(false);
    const section = document.getElementById('step-3-apply');
    if (section) {
      section.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const handleStep3ApplyNewTab = () => {
    setShowApplyPopover(false);
    setMobileApplyOpen(false);
    setIsFabOpen(false);
    if (jobUrl) {
      window.open(jobUrl, '_blank');
    }
    const section = document.getElementById('step-3-apply');
    if (section) {
      section.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const handleStep4QA = () => {
    setIsFabOpen(false);
    const section = document.getElementById('step-4-qa');
    if (section) {
      section.scrollIntoView({ behavior: 'smooth' });
      setTimeout(() => {
        const textarea = section.querySelector('textarea');
        if (textarea) {
          textarea.focus();
        }
      }, 400);
    }
  };

  const handleMouseEnterPopover = () => {
    if (popoverTimeout.current) clearTimeout(popoverTimeout.current);
    setShowApplyPopover(true);
  };

  const handleMouseLeavePopover = () => {
    popoverTimeout.current = setTimeout(() => {
      setShowApplyPopover(false);
    }, 200);
  };

  return (
    <>
      {/* Desktop Action Bar — 4-Step Workflow Dock */}
      <div className="job-action-bar-desktop">
        {/* Left Reactions & Save */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <FeedbackButtons
            jobId={currentJobId}
            initialFeedback={initialFeedback}
            initialIsArchived={initialIsArchived}
            showSaveForLater={true}
            compact={true}
          />
        </div>

        {/* Divider */}
        <div className="job-action-bar-divider" />

        {/* 4-Step Numbered Workflow Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          {/* Step 1: Back & Next */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <button
              onClick={handlePrev}
              disabled={!prevJob || currentIndex <= 0}
              className="btn-outline"
              title="Previous Job"
              style={{
                padding: '0.4rem 0.65rem',
                fontSize: '0.85rem',
                borderRadius: '9999px',
                opacity: (!prevJob || currentIndex <= 0) ? 0.4 : 1,
                cursor: (!prevJob || currentIndex <= 0) ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center'
              }}
            >
              <ChevronLeft size={16} />
            </button>

            <button
              onClick={handleNext}
              disabled={!nextJob || currentIndex >= sequence.length - 1}
              className="btn-primary"
              style={{
                padding: '0.4rem 0.9rem',
                fontSize: '0.85rem',
                borderRadius: '9999px',
                opacity: (!nextJob || currentIndex >= sequence.length - 1) ? 0.4 : 1,
                cursor: (!nextJob || currentIndex >= sequence.length - 1) ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.35rem'
              }}
            >
              <span className="job-step-number" style={{ background: '#ffffff', color: 'var(--accent-primary, #0070f3)' }}>1</span>
              Next <ChevronRight size={16} />
            </button>
          </div>

          {/* Step 2: Generate Assets */}
          <button
            onClick={handleStep2Generate}
            className="job-step-btn"
            title={localHasAssets ? "Assets Generated — Scroll to view" : "Generate Cover Letter & Resume Extract"}
          >
            <span className="job-step-number">2</span>
            {localHasAssets ? (
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', color: '#10b981', fontWeight: 600 }}>
                <CheckCircle2 size={14} /> Assets Ready
              </span>
            ) : (
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                <Sparkles size={14} style={{ color: '#0070f3' }} /> {isGenerating ? 'Generating...' : 'Generate Assets'}
              </span>
            )}
          </button>

          {/* Step 3: Apply (Hover Popover Dropup) */}
          <div
            style={{ position: 'relative' }}
            onMouseEnter={handleMouseEnterPopover}
            onMouseLeave={handleMouseLeavePopover}
          >
            <button
              onClick={() => setShowApplyPopover(prev => !prev)}
              className="job-step-btn"
              style={{
                background: status === 'applied' ? 'rgba(16, 185, 129, 0.1)' : undefined,
                borderColor: status === 'applied' ? '#10b981' : undefined,
                color: status === 'applied' ? '#10b981' : undefined
              }}
            >
              <span className="job-step-number">3</span>
              {status === 'applied' ? (
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontWeight: 600 }}>
                  <CheckCircle2 size={14} /> Applied
                </span>
              ) : (
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                  <Send size={14} /> Apply <ChevronRight size={14} style={{ transform: 'rotate(-90deg)' }} />
                </span>
              )}
            </button>

            {/* Apply Popover Card */}
            {showApplyPopover && (
              <div className="job-apply-popover" onMouseEnter={handleMouseEnterPopover} onMouseLeave={handleMouseLeavePopover}>
                <button onClick={handleStep3AutoApply} className="job-apply-option-btn">
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <Zap size={15} style={{ color: '#f59e0b' }} /> Auto Apply
                  </span>
                  <span style={{ fontSize: '0.7rem', background: 'rgba(245, 158, 11, 0.15)', color: '#d97706', padding: '2px 6px', borderRadius: '10px', fontWeight: 600 }}>1-Click</span>
                </button>

                <button onClick={handleStep3ApplyNewTab} className="job-apply-option-btn">
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <ExternalLink size={15} style={{ color: '#0070f3' }} /> Apply in New Tab
                  </span>
                  <span style={{ fontSize: '0.7rem', background: '#e2e8f0', color: '#475569', padding: '2px 6px', borderRadius: '10px', fontWeight: 600 }}>Direct</span>
                </button>
              </div>
            )}
          </div>

          {/* Step 4: Q&A */}
          <button onClick={handleStep4QA} className="job-step-btn" title="Jump to Application Q&A">
            <span className="job-step-number">4</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
              <HelpCircle size={14} /> Q&A
            </span>
          </button>

          {/* Filter Button */}
          <button
            onClick={() => setIsFilterModalOpen(true)}
            className="job-step-btn"
            title="Filter & Sort Job Queue"
            style={{
              position: 'relative'
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
              <SlidersHorizontal size={14} /> Filter
            </span>
            {hasActiveFilters && (
              <span
                style={{
                  position: 'absolute',
                  top: '4px',
                  right: '4px',
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  background: '#0070f3'
                }}
              />
            )}
          </button>
        </div>

        {/* Counter */}
        {currentIndex >= 0 && sequence.length > 0 && (
          <span className="job-action-bar-counter">
            {currentIndex + 1} of {sequence.length}
          </span>
        )}
      </div>

      {/* Mobile Multi-Action FAB */}
      <div className="job-action-bar-mobile">
        {isFabOpen && (
          <div className="job-fab-menu">
            {/* Speed Dial Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.5rem', marginBottom: '0.25rem' }}>
              <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#475569' }}>
                {currentIndex >= 0 && sequence.length > 0 ? `Job ${currentIndex + 1} of ${sequence.length}` : '4-Step Workflow'}
              </span>
              <button onClick={() => setIsFabOpen(false)} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', padding: '2px' }}>
                <X size={16} />
              </button>
            </div>

            {/* Step 1: Next & Prev */}
            <div style={{ width: '100%', display: 'flex', gap: '0.5rem' }}>
              <button
                onClick={() => { setIsFabOpen(false); handlePrev(); }}
                disabled={!prevJob || currentIndex <= 0}
                className="btn-outline"
                style={{ flex: 1, justifyContent: 'center', padding: '0.5rem', fontSize: '0.85rem' }}
              >
                <ChevronLeft size={16} /> Prev
              </button>

              <button
                onClick={() => { setIsFabOpen(false); handleNext(); }}
                disabled={!nextJob || currentIndex >= sequence.length - 1}
                className="btn-primary"
                style={{ flex: 1, justifyContent: 'center', padding: '0.5rem', fontSize: '0.85rem' }}
              >
                1. Next <ChevronRight size={16} />
              </button>

              <button
                onClick={() => { setIsFabOpen(false); setIsFilterModalOpen(true); }}
                className="btn-outline"
                style={{ padding: '0.5rem 0.65rem', fontSize: '0.85rem', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}
                title="Filter Queue"
              >
                <SlidersHorizontal size={16} />
                {hasActiveFilters && (
                  <span style={{ position: 'absolute', top: '3px', right: '3px', width: '6px', height: '6px', borderRadius: '50%', background: '#0070f3' }} />
                )}
              </button>
            </div>

            {/* Step 2: Generate Assets */}
            <button
              onClick={() => { setIsFabOpen(false); handleStep2Generate(); }}
              className="btn-outline"
              style={{ width: '100%', justifyContent: 'space-between', padding: '0.5rem 0.75rem', fontSize: '0.85rem' }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <Sparkles size={15} style={{ color: '#0070f3' }} /> 2. Generate Assets
              </span>
              {localHasAssets && <CheckCircle2 size={16} style={{ color: '#10b981' }} />}
            </button>

            {/* Step 3: Apply Toggle */}
            <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
              <button
                onClick={() => setMobileApplyOpen(prev => !prev)}
                className="btn-outline"
                style={{ width: '100%', justifyContent: 'space-between', padding: '0.5rem 0.75rem', fontSize: '0.85rem' }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <Send size={15} /> 3. Apply Options
                </span>
                <ChevronRight size={16} style={{ transform: mobileApplyOpen ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s ease' }} />
              </button>

              {mobileApplyOpen && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', paddingLeft: '0.75rem', borderLeft: '2px solid #0070f3', margin: '0.25rem 0' }}>
                  <button onClick={handleStep3AutoApply} className="job-apply-option-btn">
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <Zap size={14} style={{ color: '#f59e0b' }} /> Auto Apply
                    </span>
                  </button>
                  <button onClick={handleStep3ApplyNewTab} className="job-apply-option-btn">
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <ExternalLink size={14} style={{ color: '#0070f3' }} /> Apply in New Tab
                    </span>
                  </button>
                </div>
              )}
            </div>

            {/* Step 4: Q&A */}
            <button
              onClick={handleStep4QA}
              className="btn-outline"
              style={{ width: '100%', justifyContent: 'flex-start', padding: '0.5rem 0.75rem', fontSize: '0.85rem' }}
            >
              <HelpCircle size={15} /> 4. Application Q&A
            </button>

            {/* Reactions & Save */}
            <div style={{ width: '100%', paddingTop: '0.5rem', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'center' }}>
              <FeedbackButtons
                jobId={currentJobId}
                initialFeedback={initialFeedback}
                initialIsArchived={initialIsArchived}
                showSaveForLater={true}
                compact={true}
              />
            </div>
          </div>
        )}

        <button
          onClick={() => setIsFabOpen(prev => !prev)}
          aria-label="Toggle 4-Step Workflow Actions"
          style={{
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
            transition: 'transform 0.2s ease'
          }}
        >
          {isFabOpen ? <X size={26} /> : <Sparkles size={26} />}
        </button>
      </div>

      {/* Filter & Sort Dialog Modal */}
      <JobDetailsFilterModal
        isOpen={isFilterModalOpen}
        onClose={() => setIsFilterModalOpen(false)}
        onApply={loadSequence}
        onJumpToFirst={(firstJobId) => {
          if (firstJobId !== currentJobId) {
            router.push(`/job/${firstJobId}`);
          }
        }}
      />
    </>
  );
}
