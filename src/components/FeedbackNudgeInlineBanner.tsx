'use client';

import { useState, useEffect, useRef } from 'react';
import { Sparkles, X, ThumbsUp, ThumbsDown } from 'lucide-react';
import { submitJobFeedback } from '@/app/(authenticated)/job/[id]/actions';
import { useFeedbackNudge } from '@/hooks/useFeedbackNudge';

const DISLIKE_REASONS = [
  "Compensation too low",
  "Not remote / Poor location",
  "Wrong tech stack",
  "Mismatch with my skillset",
  "Lack technical qualifications",
  "Lack non-technical qualifications",
  "Lack education qualifications",
  "Company culture concerns",
  "Role level mismatch (too senior/junior)",
  "Other"
];

/**
 * Inline banner that appears between Step 1 (Job Description) and Step 2 (Generate Assets)
 * on the job detail page. Only shows for Nudge #1 — after the user has scrolled past
 * 60% of the description on their 3rd+ job detail page.
 */
export default function FeedbackNudgeInlineBanner({
  jobId,
  initialFeedback,
}: {
  jobId: string;
  initialFeedback?: 'like' | 'dislike' | null;
}) {
  const { shouldShowNudge1, recordNudgeShown, recordFeedbackGiven } = useFeedbackNudge();
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [hasTriggered, setHasTriggered] = useState(false);
  const [feedback, setFeedback] = useState<'like' | 'dislike' | null>(initialFeedback || null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showDislikeReasons, setShowDislikeReasons] = useState(false);
  const [selectedReasons, setSelectedReasons] = useState<string[]>([]);
  const [otherReason, setOtherReason] = useState('');
  const bannerRef = useRef<HTMLDivElement>(null);
  const descriptionRef = useRef<HTMLElement | null>(null);

  // If user already has feedback on this job, don't bother
  if (initialFeedback) return null;

  // Observe scroll position relative to the job description section
  useEffect(() => {
    if (hasTriggered || dismissed || feedback) return;
    if (!shouldShowNudge1()) return;

    // Find the description container by data attribute
    const descEl = document.querySelector('[data-tour="job-detail-description"]');
    if (!descEl) return;
    descriptionRef.current = descEl as HTMLElement;

    const handleScroll = () => {
      if (!descriptionRef.current) return;
      const rect = descriptionRef.current.getBoundingClientRect();
      const descHeight = descriptionRef.current.scrollHeight || rect.height;
      const viewportHeight = window.innerHeight;

      // How much of the description has scrolled past the viewport top
      const scrolledPast = Math.max(0, -rect.top);
      const scrollPercent = descHeight > 0 ? scrolledPast / descHeight : 0;

      // Trigger when 60% has scrolled past OR bottom of description is in view
      if (scrollPercent >= 0.6 || rect.bottom <= viewportHeight + 100) {
        setHasTriggered(true);
        setVisible(true);
        recordNudgeShown();
        window.removeEventListener('scroll', handleScroll);
      }
    };

    // Small delay to let the page render
    const timer = setTimeout(() => {
      window.addEventListener('scroll', handleScroll, { passive: true });
      handleScroll(); // Check immediately in case description is short
    }, 1000);

    return () => {
      clearTimeout(timer);
      window.removeEventListener('scroll', handleScroll);
    };
  }, [hasTriggered, dismissed, feedback, shouldShowNudge1, recordNudgeShown]);

  // Auto-dismiss after 15 seconds
  useEffect(() => {
    if (!visible || dismissed || feedback) return;
    const timer = setTimeout(() => setDismissed(true), 15000);
    return () => clearTimeout(timer);
  }, [visible, dismissed, feedback]);

  const handleLike = async () => {
    setIsSubmitting(true);
    await submitJobFeedback(jobId, 'like', []);
    setFeedback('like');
    recordFeedbackGiven();
    setIsSubmitting(false);
    // Auto-dismiss after a brief success moment
    setTimeout(() => setDismissed(true), 1500);
  };

  const handleDislikeClick = () => {
    setShowDislikeReasons(true);
  };

  const submitDislike = async () => {
    setIsSubmitting(true);
    const finalReasons = selectedReasons.includes("Other") && otherReason.trim()
      ? [...selectedReasons.filter(r => r !== "Other"), `Other: ${otherReason.trim()}`]
      : selectedReasons;

    await submitJobFeedback(jobId, 'dislike', finalReasons);
    setFeedback('dislike');
    recordFeedbackGiven();
    setIsSubmitting(false);
    setShowDislikeReasons(false);
    setTimeout(() => setDismissed(true), 1500);
  };

  const toggleReason = (reason: string) => {
    setSelectedReasons(prev =>
      prev.includes(reason)
        ? prev.filter(r => r !== reason)
        : [...prev, reason]
    );
  };

  if (!visible || dismissed) return null;

  return (
    <div
      ref={bannerRef}
      style={{
        margin: '2rem 0',
        padding: '1.5rem 2rem',
        borderRadius: '12px',
        background: 'linear-gradient(135deg, rgba(102, 252, 241, 0.06) 0%, rgba(168, 85, 247, 0.06) 100%)',
        border: '1px solid rgba(102, 252, 241, 0.2)',
        position: 'relative',
        animation: 'fadeSlideUp 0.4s ease-out',
      }}
    >
      {/* Dismiss button */}
      <button
        onClick={() => setDismissed(true)}
        style={{
          position: 'absolute',
          top: '0.75rem',
          right: '0.75rem',
          background: 'none',
          border: 'none',
          color: 'var(--text-secondary)',
          cursor: 'pointer',
          padding: '0.25rem',
          opacity: 0.6,
          transition: 'opacity 0.2s',
        }}
        onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
        onMouseLeave={e => (e.currentTarget.style.opacity = '0.6')}
        title="Dismiss"
      >
        <X size={16} />
      </button>

      {feedback ? (
        // Success state
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{
            width: '36px',
            height: '36px',
            borderRadius: '50%',
            background: feedback === 'like' ? 'rgba(52, 211, 153, 0.15)' : 'rgba(255, 99, 132, 0.15)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            {feedback === 'like'
              ? <ThumbsUp size={18} color="var(--success)" />
              : <ThumbsDown size={18} color="var(--danger)" />
            }
          </div>
          <p style={{ margin: 0, color: 'var(--text-primary)', fontSize: '0.95rem', fontWeight: 500 }}>
            Thanks! Your feedback helps us find better matches for you.
          </p>
        </div>
      ) : showDislikeReasons ? (
        // Dislike reasons inline
        <div>
          <h4 style={{ margin: '0 0 0.75rem 0', fontSize: '1rem', paddingRight: '2rem' }}>Why is this a bad fit?</h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginBottom: '1rem', maxHeight: '200px', overflowY: 'auto' }}>
            {DISLIKE_REASONS.map(reason => (
              <label key={reason} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.9rem' }}>
                <input
                  type="checkbox"
                  checked={selectedReasons.includes(reason)}
                  onChange={() => toggleReason(reason)}
                  style={{ accentColor: 'var(--accent-primary)' }}
                />
                {reason}
              </label>
            ))}
            {selectedReasons.includes("Other") && (
              <textarea
                value={otherReason}
                onChange={(e) => setOtherReason(e.target.value)}
                placeholder="Please explain why..."
                style={{
                  width: '100%',
                  marginTop: '0.25rem',
                  padding: '0.5rem',
                  borderRadius: '4px',
                  border: '1px solid var(--border-glass)',
                  background: 'var(--bg-color)',
                  color: 'var(--text-primary)',
                  fontSize: '0.9rem',
                  minHeight: '50px',
                  resize: 'vertical',
                  fontFamily: 'inherit'
                }}
              />
            )}
          </div>
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button
              onClick={submitDislike}
              disabled={isSubmitting || selectedReasons.length === 0}
              className="btn-primary"
              style={{ padding: '0.5rem 1rem', fontSize: '0.9rem' }}
            >
              {isSubmitting ? 'Submitting...' : 'Submit'}
            </button>
            <button
              onClick={() => setShowDislikeReasons(false)}
              className="btn-outline"
              style={{ padding: '0.5rem 1rem', fontSize: '0.9rem' }}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        // Default nudge state
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
            <Sparkles size={18} color="var(--accent-primary)" />
            <h4 style={{ margin: 0, fontSize: '1rem' }}>Optimize Your Match Accuracy</h4>
          </div>
          <p style={{
            color: 'var(--text-secondary)',
            fontSize: '0.9rem',
            lineHeight: 1.5,
            margin: '0 0 1rem 0',
            maxWidth: '600px',
            paddingRight: '2rem',
          }}>
            Rating this position directly trains our AI engine to refine your match scoring and surface higher-relevance job opportunities.
          </p>
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              onClick={handleLike}
              disabled={isSubmitting}
              className="btn-outline"
              style={{
                padding: '0.5rem 1rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
                borderColor: 'rgba(52, 211, 153, 0.4)',
                color: 'var(--success)',
                fontSize: '0.9rem',
              }}
            >
              <ThumbsUp size={16} /> Good Fit
            </button>
            <button
              onClick={handleDislikeClick}
              disabled={isSubmitting}
              className="btn-outline"
              style={{
                padding: '0.5rem 1rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
                borderColor: 'rgba(255, 99, 132, 0.4)',
                color: 'var(--danger)',
                fontSize: '0.9rem',
              }}
            >
              <ThumbsDown size={16} /> Not For Me
            </button>
            <button
              onClick={() => setDismissed(true)}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                fontSize: '0.85rem',
                padding: '0.5rem',
                opacity: 0.7,
              }}
            >
              Skip
            </button>
          </div>
        </div>
      )}

      {/* Animation keyframe */}
      <style>{`
        @keyframes fadeSlideUp {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
