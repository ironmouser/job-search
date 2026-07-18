'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { submitJobFeedback } from '@/app/(authenticated)/job/[id]/actions';
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
  const [isMobile, setIsMobile] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 1024);
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

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
    const finalReasons = selectedReasons.includes("Other") && otherReason.trim()
      ? [...selectedReasons.filter(r => r !== "Other"), `Other: ${otherReason.trim()}`]
      : selectedReasons;

    await submitJobFeedback(jobId, 'dislike', finalReasons);
    setFeedback('dislike');
    setIsSubmitting(false);
    setShowModal(false);
  };

  const toggleReason = (reason: string) => {
    setSelectedReasons(prev => 
      prev.includes(reason) 
        ? prev.filter(r => r !== reason) 
        : [...prev, reason]
    );
  };

  const renderModal = () => {
    if (!showModal) return null;

    const modalContent = (
      <>
        {isMobile && (
          <div 
            onClick={() => setShowModal(false)}
            style={{
              position: 'fixed',
              top: 0, left: 0, right: 0, bottom: 0,
              background: 'rgba(0,0,0,0.6)',
              zIndex: 9999
            }}
          />
        )}
        <div style={isMobile ? {
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: 'min(320px, 90vw)',
          background: 'var(--bg-color)',
          border: '1px solid var(--border-glass)',
          borderRadius: '12px',
          padding: '1.5rem',
          zIndex: 10000,
          boxShadow: '0 20px 40px rgba(0,0,0,0.6)'
        } : {
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
      </>
    );

    if (isMobile && mounted) {
      return createPortal(modalContent, document.body);
    }

    return modalContent;
  };

  return (
    <div style={{ display: 'flex', gap: '0.5rem', position: 'relative' }}>
      <button 
        onClick={handleLike} 
        disabled={isSubmitting || feedback === 'like'}
        className="btn-outline" 
        style={{ 
          padding: '0.5rem', 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center',
          background: feedback === 'like' ? 'rgba(52, 211, 153, 0.1)' : 'transparent',
          borderColor: feedback === 'like' ? 'var(--success)' : 'var(--border-glass)',
          cursor: 'pointer',
          borderRadius: '8px'
        }}
        title="Like this job"
      >
        <ThumbsUp size={18} color={feedback === 'like' ? 'var(--success)' : 'var(--text-secondary)'} />
      </button>

      <button 
        onClick={handleDislikeClick} 
        disabled={isSubmitting || feedback === 'dislike'}
        className="btn-outline" 
        style={{ 
          padding: '0.5rem', 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center',
          background: feedback === 'dislike' ? 'rgba(255, 99, 132, 0.1)' : 'transparent',
          borderColor: feedback === 'dislike' ? 'var(--danger)' : 'var(--border-glass)',
          cursor: 'pointer',
          borderRadius: '8px'
        }}
        title="Dislike this job"
      >
        <ThumbsDown size={18} color={feedback === 'dislike' ? 'var(--danger)' : 'var(--text-secondary)'} />
      </button>

      {renderModal()}
    </div>
  );
}
