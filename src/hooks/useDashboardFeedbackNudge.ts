'use client';

import { useState, useEffect, useMemo } from 'react';
import { useFeedbackNudge } from '@/hooks/useFeedbackNudge';

/**
 * Hook for dashboard-level nudge #3 logic.
 * Returns which job ID (if any) should show the tooltip,
 * and handlers for dismissal and feedback.
 *
 * Pass it the list of current jobs displayed on the dashboard.
 */
export function useDashboardFeedbackNudge(currentJobs: any[]) {
  const { shouldShowNudge3, recordNudgeShown, recordFeedbackGiven, isLoaded } = useFeedbackNudge();
  const [nudgeJobId, setNudgeJobId] = useState<string | null>(null);
  const [nudgeRecorded, setNudgeRecorded] = useState(false);

  // Count unrated jobs
  const unratedCount = useMemo(() => {
    return currentJobs.filter(j => {
      const fb = Array.isArray(j.job_feedback) ? j.job_feedback[0] : j.job_feedback;
      return !fb?.feedback_type;
    }).length;
  }, [currentJobs]);

  useEffect(() => {
    if (!isLoaded || nudgeJobId || nudgeRecorded) return;

    // Delay check so the dashboard has rendered
    const timer = setTimeout(() => {
      if (shouldShowNudge3(unratedCount)) {
        // Show tooltip on the first job on the page as requested
        const firstJob = currentJobs[0];

        if (firstJob) {
          setNudgeJobId(firstJob.id);
          if (!nudgeRecorded) {
            recordNudgeShown();
            setNudgeRecorded(true);
          }
        }
      }
    }, 20000); // 20s delay — let user explore and settle into the dashboard first

    return () => clearTimeout(timer);
  }, [isLoaded, shouldShowNudge3, unratedCount, currentJobs, recordNudgeShown, nudgeJobId, nudgeRecorded]);

  const handleDismiss = () => {
    setNudgeJobId(null);
  };

  const handleFeedbackGiven = () => {
    recordFeedbackGiven();
    setNudgeJobId(null);
  };

  return {
    nudgeJobId,
    handleDismiss,
    handleFeedbackGiven,
  };
}
