'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Star, Send, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';

interface FeedbackModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function FeedbackModal({ isOpen, onClose }: FeedbackModalProps) {
  const [mounted, setMounted] = useState(false);
  const [rating, setRating] = useState<number>(0);
  const [hoverRating, setHoverRating] = useState<number>(0);
  const [comment, setComment] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (rating === 0) {
      setError('Please select a star rating from 1 to 5.');
      return;
    }

    setError(null);
    setLoading(true);

    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating, comment }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to submit feedback');
      }

      setSuccess(true);
    } catch (err: any) {
      setError(err.message || 'Unable to submit feedback right now. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setRating(0);
    setHoverRating(0);
    setComment('');
    setError(null);
    setSuccess(false);
    onClose();
  };

  if (!mounted || !isOpen) return null;

  const activeStarCount = hoverRating || rating;

  const modalContent = (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
        padding: '1.5rem',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="feedback-modal-title"
        style={{
          width: '100%',
          maxWidth: '480px',
          backgroundColor: 'var(--card)',
          border: '1px solid var(--border)',
          borderRadius: '16px',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.3), 0 8px 10px -6px rgba(0, 0, 0, 0.2)',
          overflow: 'hidden',
          color: 'var(--card-foreground)',
          position: 'relative',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '1.25rem 1.5rem',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'var(--card-header-bg)',
          }}
        >
          <div>
            <h2 id="feedback-modal-title" style={{ fontSize: '1.25rem', fontWeight: 600, margin: 0, color: 'var(--foreground)' }}>
              Rate Your Experience
            </h2>
            <p style={{ fontSize: '0.85rem', color: 'var(--muted-foreground)', margin: '4px 0 0 0' }}>
              Your feedback helps us make Job Agent even better
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close modal"
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--muted-foreground)',
              cursor: 'pointer',
              padding: '6px',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.15s ease',
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '1.5rem' }}>
          {success ? (
            <div style={{ textAlign: 'center', padding: '1.5rem 0' }}>
              <div
                style={{
                  width: '56px',
                  height: '56px',
                  borderRadius: '50%',
                  backgroundColor: 'rgba(16, 185, 129, 0.15)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 1.25rem auto',
                  color: '#10b981',
                }}
              >
                <CheckCircle2 size={32} />
              </div>
              <h3 style={{ fontSize: '1.3rem', fontWeight: 600, marginBottom: '0.5rem', color: 'var(--foreground)' }}>
                Thank You for Your Feedback!
              </h3>
              <p style={{ color: 'var(--muted-foreground)', fontSize: '0.95rem', marginBottom: '1.5rem', lineHeight: 1.5 }}>
                We appreciate you taking the time to rate our platform. Your response has been saved.
              </p>
              <button
                onClick={handleReset}
                style={{
                  padding: '0.75rem 1.75rem',
                  backgroundColor: 'var(--accent-primary)',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '8px',
                  fontWeight: 600,
                  fontSize: '0.95rem',
                  cursor: 'pointer',
                  transition: 'opacity 0.15s ease',
                }}
              >
                Close Window
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              {error && (
                <div
                  style={{
                    padding: '0.85rem 1rem',
                    borderRadius: '8px',
                    backgroundColor: 'rgba(239, 68, 68, 0.1)',
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                    color: '#ef4444',
                    fontSize: '0.875rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                  }}
                >
                  <AlertCircle size={18} style={{ flexShrink: 0, color: '#ef4444' }} />
                  <span>{error}</span>
                </div>
              )}

              {/* Star Rating Section */}
              <div style={{ textAlign: 'center' }}>
                <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: 600, color: 'var(--foreground)', marginBottom: '0.75rem' }}>
                  How would you rate Job Agent HQ? *
                </label>
                <div
                  style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem' }}
                  onMouseLeave={() => setHoverRating(0)}
                >
                  {[1, 2, 3, 4, 5].map((starIndex) => (
                    <button
                      key={starIndex}
                      type="button"
                      onClick={() => setRating(starIndex)}
                      onMouseEnter={() => setHoverRating(starIndex)}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        cursor: 'pointer',
                        padding: '4px',
                        transition: 'transform 0.15s ease',
                        transform: activeStarCount >= starIndex ? 'scale(1.15)' : 'scale(1)',
                      }}
                      aria-label={`Rate ${starIndex} out of 5 stars`}
                    >
                      <Star
                        size={32}
                        fill={starIndex <= activeStarCount ? '#f59e0b' : 'none'}
                        color={starIndex <= activeStarCount ? '#f59e0b' : 'var(--muted-foreground)'}
                        strokeWidth={1.5}
                      />
                    </button>
                  ))}
                </div>
                {rating > 0 && (
                  <p style={{ fontSize: '0.8rem', color: 'var(--muted-foreground)', marginTop: '0.4rem', fontWeight: 500 }}>
                    {rating === 1 && 'Poor'}
                    {rating === 2 && 'Fair'}
                    {rating === 3 && 'Good'}
                    {rating === 4 && 'Very Good'}
                    {rating === 5 && 'Excellent!'}
                  </p>
                )}
              </div>

              {/* Comments Input */}
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 500, color: 'var(--foreground)', marginBottom: '0.4rem' }}>
                  Comments or Suggestions
                </label>
                <textarea
                  rows={4}
                  placeholder="Tell us what you like or how we can improve..."
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.65rem 0.85rem',
                    borderRadius: '8px',
                    backgroundColor: 'var(--input)',
                    border: '1px solid var(--border)',
                    color: 'var(--foreground)',
                    fontSize: '0.925rem',
                    outline: 'none',
                    resize: 'vertical',
                    fontFamily: 'inherit',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              {/* Buttons */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.25rem' }}>
                <button
                  type="button"
                  onClick={onClose}
                  disabled={loading}
                  style={{
                    padding: '0.65rem 1.25rem',
                    backgroundColor: 'var(--secondary)',
                    color: 'var(--foreground)',
                    border: '1px solid var(--border)',
                    borderRadius: '8px',
                    fontWeight: 500,
                    fontSize: '0.9rem',
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading || rating === 0}
                  style={{
                    padding: '0.65rem 1.4rem',
                    backgroundColor: 'var(--accent-primary)',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '8px',
                    fontWeight: 600,
                    fontSize: '0.9rem',
                    cursor: loading || rating === 0 ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    opacity: loading || rating === 0 ? 0.6 : 1,
                  }}
                >
                  {loading ? (
                    <>
                      <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
                      Submitting...
                    </>
                  ) : (
                    <>
                      <Send size={16} />
                      Submit Feedback
                    </>
                  )}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
