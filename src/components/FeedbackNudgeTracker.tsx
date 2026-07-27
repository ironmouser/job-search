'use client';

import { useEffect, useRef } from 'react';
import { useFeedbackNudge } from '@/hooks/useFeedbackNudge';

/**
 * Invisible component placed on the job detail page that records
 * each job detail view for the nudge system's counter.
 * Must be a client component since useFeedbackNudge uses localStorage.
 */
export default function FeedbackNudgeTracker() {
  const { recordJobDetailView } = useFeedbackNudge();
  const hasRecorded = useRef(false);

  useEffect(() => {
    if (!hasRecorded.current) {
      hasRecorded.current = true;
      recordJobDetailView();
    }
  }, [recordJobDetailView]);

  return null;
}
