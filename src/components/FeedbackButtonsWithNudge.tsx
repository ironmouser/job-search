'use client';

import { useState, useEffect } from 'react';
import FeedbackButtons from './FeedbackButtons';
import { useFeedbackNudge } from '@/hooks/useFeedbackNudge';

/**
 * Wraps FeedbackButtons on the job detail header with nudge #2 tooltip logic.
 * Shows a tooltip above the buttons when shouldShowNudge2 is true.
 */
export default function FeedbackButtonsWithNudge({
  jobId,
  initialFeedback,
  compact = false,
}: {
  jobId: string;
  initialFeedback?: 'like' | 'dislike' | null;
  compact?: boolean;
}) {
  const { shouldShowNudge2, recordNudgeShown, recordFeedbackGiven } = useFeedbackNudge();
  const [showTooltip, setShowTooltip] = useState(false);
  const [nudgeRecorded, setNudgeRecorded] = useState(false);

  useEffect(() => {
    // Delay check slightly so the page is rendered
    const timer = setTimeout(() => {
      if (shouldShowNudge2() && !initialFeedback) {
        setShowTooltip(true);
        if (!nudgeRecorded) {
          recordNudgeShown();
          setNudgeRecorded(true);
        }
      }
    }, 2000); // 2s delay so user has settled into the page

    return () => clearTimeout(timer);
  }, [shouldShowNudge2, initialFeedback, recordNudgeShown, nudgeRecorded]);

  const handleFeedbackGiven = () => {
    recordFeedbackGiven();
    setShowTooltip(false);
  };

  const handleNudgeDismiss = () => {
    setShowTooltip(false);
  };

  return (
    <FeedbackButtons
      jobId={jobId}
      initialFeedback={initialFeedback}
      compact={compact}
      onFeedbackGiven={handleFeedbackGiven}
      showNudgeTooltip={showTooltip}
      nudgeVariant="job-detail"
      onNudgeDismiss={handleNudgeDismiss}
    />
  );
}
