'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

// ─── localStorage keys ───
const NUDGE_COUNT_KEY = 'feedback_nudge_count';
const NUDGE_LAST_SHOWN_KEY = 'feedback_nudge_last_shown';
const NUDGE_LAST_ACTED_KEY = 'feedback_nudge_last_acted';
const NUDGE_COMPLETED_KEY = 'feedback_nudge_completed';
const NUDGE_JOBS_VIEWED_KEY = 'feedback_nudge_jobs_viewed_since';
const TOTAL_FEEDBACKS_KEY = 'feedback_total_count';

// ─── Thresholds ───
const MAX_NUDGES = 5;
const FEEDBACK_GRADUATION_THRESHOLD = 5;

// Nudge 1: show on 3rd job detail view (index 2)
const NUDGE_1_MIN_VIEWS = 3;

// Nudge 2: show after 5+ more views (or 3 days), doubles if acted
const NUDGE_2_MIN_VIEWS_DEFAULT = 5;
const NUDGE_2_MIN_DAYS_DEFAULT = 3;
const NUDGE_2_MIN_VIEWS_ACTED = 10;
const NUDGE_2_MIN_DAYS_ACTED = 7;

// Nudge 3: show after 3 days (or 7 if acted), requires 15+ unrated jobs
const NUDGE_3_MIN_DAYS_DEFAULT = 3;
const NUDGE_3_MIN_DAYS_ACTED = 7;
const NUDGE_3_MIN_UNRATED_JOBS = 15;

export interface FeedbackNudgeState {
  /** Total nudges shown so far (0-3) */
  nudgeCount: number;
  /** Whether the nudge system is permanently done */
  isCompleted: boolean;
  /** Total feedbacks the user has ever given (tracked client-side) */
  totalFeedbacks: number;
  /** Number of job detail pages viewed since last nudge */
  jobsViewedSince: number;
  /** Timestamp of last nudge shown */
  lastShownAt: number | null;
  /** Whether user acted (gave feedback) after the most recent nudge */
  lastActedAt: number | null;
}

function loadState(): FeedbackNudgeState {
  try {
    return {
      nudgeCount: parseInt(localStorage.getItem(NUDGE_COUNT_KEY) || '0', 10) || 0,
      isCompleted: localStorage.getItem(NUDGE_COMPLETED_KEY) === 'true',
      totalFeedbacks: parseInt(localStorage.getItem(TOTAL_FEEDBACKS_KEY) || '0', 10) || 0,
      jobsViewedSince: parseInt(localStorage.getItem(NUDGE_JOBS_VIEWED_KEY) || '0', 10) || 0,
      lastShownAt: (() => {
        const v = localStorage.getItem(NUDGE_LAST_SHOWN_KEY);
        return v ? parseInt(v, 10) : null;
      })(),
      lastActedAt: (() => {
        const v = localStorage.getItem(NUDGE_LAST_ACTED_KEY);
        return v ? parseInt(v, 10) : null;
      })(),
    };
  } catch {
    return {
      nudgeCount: 0,
      isCompleted: false,
      totalFeedbacks: 0,
      jobsViewedSince: 0,
      lastShownAt: null,
      lastActedAt: null,
    };
  }
}

function daysSince(timestamp: number | null): number {
  if (!timestamp) return Infinity;
  return (Date.now() - timestamp) / (1000 * 60 * 60 * 24);
}

export function useFeedbackNudge() {
  const [state, setState] = useState<FeedbackNudgeState>(() => loadState());
  const [isLoaded, setIsLoaded] = useState(false);

  // Reload from localStorage on mount (SSR safety)
  useEffect(() => {
    setState(loadState());
    setIsLoaded(true);
  }, []);

  /**
   * Record that the user visited a job detail page.
   * Call this once per job detail page load.
   */
  const recordJobDetailView = useCallback(() => {
    setState(prev => {
      const next = prev.jobsViewedSince + 1;
      try { localStorage.setItem(NUDGE_JOBS_VIEWED_KEY, next.toString()); } catch {}
      return { ...prev, jobsViewedSince: next };
    });
  }, []);

  /**
   * Record that the user gave feedback (like or dislike).
   * Call this from FeedbackButtons after a successful submission.
   */
  const recordFeedbackGiven = useCallback(() => {
    setState(prev => {
      const newTotal = prev.totalFeedbacks + 1;
      const now = Date.now();
      try {
        localStorage.setItem(TOTAL_FEEDBACKS_KEY, newTotal.toString());
        localStorage.setItem(NUDGE_LAST_ACTED_KEY, now.toString());
      } catch {}

      // Graduate if threshold met
      const isNowCompleted = newTotal >= FEEDBACK_GRADUATION_THRESHOLD;
      if (isNowCompleted) {
        try { localStorage.setItem(NUDGE_COMPLETED_KEY, 'true'); } catch {}
      }

      return {
        ...prev,
        totalFeedbacks: newTotal,
        lastActedAt: now,
        isCompleted: isNowCompleted || prev.isCompleted,
      };
    });
  }, []);

  /**
   * Record that a nudge was shown. Increments count and resets jobs-viewed counter.
   */
  const recordNudgeShown = useCallback(() => {
    setState(prev => {
      const newCount = prev.nudgeCount + 1;
      const now = Date.now();
      try {
        localStorage.setItem(NUDGE_COUNT_KEY, newCount.toString());
        localStorage.setItem(NUDGE_LAST_SHOWN_KEY, now.toString());
        localStorage.setItem(NUDGE_JOBS_VIEWED_KEY, '0');
      } catch {}

      const isNowCompleted = newCount >= MAX_NUDGES;
      if (isNowCompleted) {
        try { localStorage.setItem(NUDGE_COMPLETED_KEY, 'true'); } catch {}
      }

      return {
        ...prev,
        nudgeCount: newCount,
        lastShownAt: now,
        jobsViewedSince: 0,
        lastActedAt: null, // reset acted flag for this new nudge cycle
        isCompleted: isNowCompleted || prev.isCompleted,
      };
    });
  }, []);

  /** Did the user act (give feedback) after the most recent nudge? */
  const actedAfterLastNudge = state.lastActedAt !== null &&
    state.lastShownAt !== null &&
    state.lastActedAt > state.lastShownAt;

  /**
   * Check if Nudge #1 (inline banner on job detail) should show.
   * Conditions: no nudges shown yet, viewed >= 3 job details, no prior feedback.
   */
  const shouldShowNudge1 = useCallback((): boolean => {
    if (!isLoaded || state.isCompleted) return false;
    if (state.nudgeCount !== 0) return false;
    if (state.totalFeedbacks > 0) return false;
    return state.jobsViewedSince >= NUDGE_1_MIN_VIEWS;
  }, [isLoaded, state]);

  /**
   * Check if Nudge #2 (tooltip on job detail header) should show.
   * Conditions: exactly 1 nudge shown, enough time/views passed.
   */
  const shouldShowNudge2 = useCallback((): boolean => {
    if (!isLoaded || state.isCompleted) return false;
    if (state.nudgeCount !== 1) return false;

    const minViews = actedAfterLastNudge ? NUDGE_2_MIN_VIEWS_ACTED : NUDGE_2_MIN_VIEWS_DEFAULT;
    const minDays = actedAfterLastNudge ? NUDGE_2_MIN_DAYS_ACTED : NUDGE_2_MIN_DAYS_DEFAULT;

    const enoughViews = state.jobsViewedSince >= minViews;
    const enoughTime = daysSince(state.lastShownAt) >= minDays;

    return enoughViews || enoughTime;
  }, [isLoaded, state, actedAfterLastNudge]);

  /**
   * Check if Nudge #3 (tooltip on dashboard) should show.
   * Conditions: exactly 2 nudges shown, enough time passed, enough unrated jobs.
   */
  const shouldShowNudge3 = useCallback((unratedJobCount: number): boolean => {
    if (!isLoaded || state.isCompleted) return false;
    if (state.nudgeCount !== 2) return false;

    const minDays = actedAfterLastNudge ? NUDGE_3_MIN_DAYS_ACTED : NUDGE_3_MIN_DAYS_DEFAULT;
    const enoughTime = daysSince(state.lastShownAt) >= minDays;

    return enoughTime && unratedJobCount >= NUDGE_3_MIN_UNRATED_JOBS;
  }, [isLoaded, state, actedAfterLastNudge]);

  return {
    state,
    isLoaded,
    recordJobDetailView,
    recordFeedbackGiven,
    recordNudgeShown,
    shouldShowNudge1,
    shouldShowNudge2,
    shouldShowNudge3,
  };
}
