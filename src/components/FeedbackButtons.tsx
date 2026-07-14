'use client';

import { useState } from 'react';
import { submitJobFeedback } from '@/app/job/[id]/actions';
import { ThumbsUp, ThumbsDown, X } from 'lucide-react';

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

export default function FeedbackButtons({ jobId, initialFeedback }: { jobId: string, initialFeedback?: 'like' | 'dislike' | null }) {
  const [feedback, setFeedback] = useState<'like' | 'dislike' | null>(initialFeedback || null);
  const [showModal, setShowModal] = useState(false);
  const [selectedReasons, setSelectedReasons] = useState<string[]>([]);
  const [otherReason, setOtherReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleLike = async () => {
    setIsSubmitting(true);
    await submitJobFeedback(jobId, 'like', []);
    setFeedback('like');
    setIsSubmitting(false);
  };

  const handleDislikeClick = () => {
    if (feedback === 'dislike') return;
    setShowModal(true);
  };

  const submitDislike = async () => {
    setIsSubmitting(true);
    const finalReasons = selectedReasons.map(r => 
      r === "Other" && otherReason.trim() ? `Other: ${otherReason.trim()}` : r
    );
    await submitJobFeedback(jobId, 'dislike', finalReasons);
    setFeedback('dislike');
    setShowModal(false);
    setIsSubmitting(false);
  };

  const toggleReason = (reason: string) => {
    setSelectedReasons(prev => 
      prev.includes(reason) 
        ? prev.filter(r => r !== reason)
        : [...prev, reason]
    );
  };

  return (
    <div style={{ position: 'relative', display: 'flex', gap: '0.5rem' }}>
      <button 
        onClick={handleLike} 
        disabled={isSubmitting}
        className="btn-outline" 
        style={{ 
          padding: '0.5rem', 
          background: feedback === 'like' ? 'rgba(102, 252, 241, 0.1)' : 'transparent',
          borderColor: feedback === 'like' ? 'var(--accent-primary)' : 'var(--border-glass)'
        }}
        title="Like this job"
      >
        <ThumbsUp size={18} color={feedback === 'like' ? 'var(--accent-primary)' : 'var(--text-secondary)'} />
      </button>

      <button 
        onClick={handleDislikeClick} 
        disabled={isSubmitting}
        className="btn-outline" 
        style={{ 
          padding: '0.5rem',
          background: feedback === 'dislike' ? 'rgba(255, 99, 132, 0.1)' : 'transparent',
          borderColor: feedback === 'dislike' ? 'var(--danger)' : 'var(--border-glass)'
        }}
        title="Dislike this job"
      >
        <ThumbsDown size={18} color={feedback === 'dislike' ? 'var(--danger)' : 'var(--text-secondary)'} />
      </button>

      {/* Dislike Modal */}
      {showModal && (
        <div style={{
          position: 'absolute',
          top: '100%',
          right: 0,
          marginTop: '0.5rem',
          width: '300px',
          background: 'var(--bg-color)',
          border: '1px solid var(--border-glass)',
          borderRadius: '8px',
          padding: '1rem',
          zIndex: 50,
          boxShadow: '0 10px 25px rgba(0,0,0,0.5)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h4 style={{ margin: 0 }}>Why is this a bad fit?</h4>
            <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}>
              <X size={16} />
            </button>
          </div>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1rem', maxHeight: '300px', overflowY: 'auto' }}>
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
                  marginTop: '0.5rem',
                  padding: '0.5rem',
                  borderRadius: '4px',
                  border: '1px solid var(--border-glass)',
                  background: 'var(--bg-color)',
                  color: 'var(--text-primary)',
                  fontSize: '0.9rem',
                  minHeight: '60px',
                  resize: 'vertical',
                  fontFamily: 'inherit'
                }}
              />
            )}
          </div>

          <button 
            onClick={submitDislike}
            disabled={isSubmitting || selectedReasons.length === 0}
            className="btn-primary"
            style={{ width: '100%', padding: '0.5rem' }}
          >
            {isSubmitting ? 'Submitting...' : 'Submit Feedback'}
          </button>
        </div>
      )}
    </div>
  );
}
