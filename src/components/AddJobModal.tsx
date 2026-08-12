"use client";

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { PlusCircle, Sparkles, Loader2, AlertCircle, Clipboard, X, CheckCircle2 } from 'lucide-react';
import { trackAddJobUrl } from '@/lib/analytics';

interface AddJobModalProps {
  isOpen: boolean;
  onClose: () => void;
  userPlanTier?: string;
  onJobAdded: (newJob: any) => void;
}

export default function AddJobModal({
  isOpen,
  onClose,
  userPlanTier = 'FREE',
  onJobAdded
}: AddJobModalProps) {
  const [mounted, setMounted] = useState(false);
  const isPro = userPlanTier === 'PRO';
  const [url, setUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [statusStep, setStatusStep] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Manual Fallback Modal State
  const [showManualModal, setShowManualModal] = useState(false);
  const [manualTitle, setManualTitle] = useState('');
  const [manualCompany, setManualCompany] = useState('');
  const [manualLocation, setManualLocation] = useState('');
  const [manualDescription, setManualDescription] = useState('');
  const [isSubmittingManual, setIsSubmittingManual] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!isOpen || !mounted) return null;

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) setUrl(text.trim());
    } catch {
      // Clipboard permission denied fallback
    }
  };

  const handleSubmitUrl = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim() || isLoading) return;

    setErrorMsg(null);
    setSuccessMsg(null);
    setIsLoading(true);
    setStatusStep('Fetching job page & details...');

    try {
      const timer1 = setTimeout(() => setStatusStep('Extracting job title & description...'), 2000);
      const timer2 = setTimeout(() => setStatusStep('Scoring match & auto-apply confidence...'), 4500);

      const res = await fetch('/api/jobs/add-by-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim() })
      });

      clearTimeout(timer1);
      clearTimeout(timer2);

      const data = await res.json();

      if (!res.ok) {
        const errText = data.message || data.error || 'Failed to add job from URL';
        trackAddJobUrl(url.trim(), 'error', errText);
        if (data.error === 'COULD_NOT_SCRAPE') {
          if (data.partialData) {
            setManualTitle(data.partialData.title || '');
            setManualCompany(data.partialData.company || '');
            setManualLocation(data.partialData.location || '');
          }
          setShowManualModal(true);
          setErrorMsg('Unable to scrape this site directly. Please paste the job description manually below.');
        } else {
          setErrorMsg(errText);
        }
        setIsLoading(false);
        return;
      }

      trackAddJobUrl(url.trim(), 'success');
      setUrl('');
      setSuccessMsg(data.message || 'Job successfully added to your pipeline!');
      onJobAdded(data.job);
      setTimeout(() => {
        setSuccessMsg(null);
        onClose();
      }, 1200);
    } catch (err: any) {
      const errMsg = err.message || 'Network error occurred';
      trackAddJobUrl(url.trim(), 'error', errMsg);
      setErrorMsg(errMsg);
    } finally {
      setIsLoading(false);
      setStatusStep('');
    }
  };

  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualDescription.trim() || isSubmittingManual) return;

    setIsSubmittingManual(true);
    setErrorMsg(null);

    try {
      const res = await fetch('/api/jobs/add-by-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: url.trim(),
          manualTitle: manualTitle.trim(),
          manualCompany: manualCompany.trim(),
          manualLocation: manualLocation.trim(),
          manualDescription: manualDescription.trim()
        })
      });

      const data = await res.json();

      if (!res.ok) {
        const errText = data.message || data.error || 'Failed to submit job details';
        trackAddJobUrl(url.trim(), 'error', `Manual submit: ${errText}`);
        setErrorMsg(errText);
        setIsSubmittingManual(false);
        return;
      }

      trackAddJobUrl(url.trim(), 'success', 'Manual submit');
      setShowManualModal(false);
      setUrl('');
      setManualTitle('');
      setManualCompany('');
      setManualLocation('');
      setManualDescription('');
      setSuccessMsg(data.message || 'Job successfully added!');
      onJobAdded(data.job);
      setTimeout(() => {
        setSuccessMsg(null);
        onClose();
      }, 1200);
    } catch (err: any) {
      const errMsg = err.message || 'Network error occurred';
      trackAddJobUrl(url.trim(), 'error', `Manual submit: ${errMsg}`);
      setErrorMsg(errMsg);
    } finally {
      setIsSubmittingManual(false);
    }
  };

  const modalContent = (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem'
      }}
      onClick={onClose}
    >
      <div
        className="glass-card"
        style={{
          backgroundColor: 'var(--card)',
          border: '1px solid var(--border)',
          borderRadius: '16px',
          padding: '1.75rem',
          maxWidth: '560px',
          width: '100%',
          position: 'relative',
          boxShadow: '0 20px 40px rgba(0, 0, 0, 0.3)',
          color: 'var(--card-foreground)'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          style={{
            position: 'absolute',
            top: '1rem',
            right: '1rem',
            background: 'none',
            border: 'none',
            color: 'var(--muted-foreground)',
            cursor: 'pointer',
            padding: '4px',
            borderRadius: '50%'
          }}
          title="Close modal"
        >
          <X size={20} />
        </button>

        <h2 style={{ marginTop: 0, marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.6rem', fontSize: '1.35rem', fontWeight: 700 }}>
          <PlusCircle size={24} style={{ color: 'var(--accent-primary)' }} />
          Scrape & Add Job
        </h2>

        <p style={{ fontSize: '0.875rem', color: 'var(--muted-foreground)', marginBottom: '1.25rem', lineHeight: '1.4' }}>
          {isPro ? (
            <span>Paste any job opening URL to instantly extract job details, score match & add to your pipeline.</span>
          ) : (
            <span>Paste a job URL to scrape & score match immediately. Unlocks +1 Free Resume & Cover Letter generation!</span>
          )}
        </p>

        {!showManualModal ? (
          <form onSubmit={handleSubmitUrl} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ position: 'relative', width: '100%' }}>
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="Paste job URL (e.g. https://boards.greenhouse.io/...)"
                disabled={isLoading}
                required
                style={{
                  width: '100%',
                  height: '44px',
                  padding: '0 2.75rem 0 0.875rem',
                  borderRadius: '10px',
                  border: '1px solid var(--border)',
                  fontSize: '0.9rem',
                  outline: 'none',
                  background: 'var(--input)',
                  color: 'var(--foreground)'
                }}
              />
              <button
                type="button"
                onClick={handlePaste}
                title="Paste from clipboard"
                disabled={isLoading}
                style={{
                  position: 'absolute',
                  right: '10px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--muted-foreground)',
                  padding: '4px',
                  display: 'flex',
                  alignItems: 'center'
                }}
              >
                <Clipboard style={{ width: 18, height: 18 }} />
              </button>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
              <button
                type="button"
                onClick={onClose}
                disabled={isLoading}
                className="btn-outline"
                style={{
                  padding: '0.6rem 1.25rem',
                  borderRadius: '10px',
                  fontSize: '0.9rem'
                }}
              >
                Cancel
              </button>

              <button
                type="submit"
                disabled={isLoading || !url.trim()}
                className="btn-primary"
                style={{
                  padding: '0.6rem 1.4rem',
                  borderRadius: '10px',
                  fontSize: '0.9rem',
                  fontWeight: 600,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.5rem'
                }}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="animate-spin" size={16} />
                    <span>Scraping...</span>
                  </>
                ) : (
                  <>
                    <Sparkles size={16} />
                    <span>Scrape & Add</span>
                  </>
                )}
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleManualSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.25rem', color: 'var(--foreground)' }}>Job Title</label>
              <input
                type="text"
                value={manualTitle}
                onChange={(e) => setManualTitle(e.target.value)}
                placeholder="e.g. Senior Software Engineer"
                style={{
                  width: '100%',
                  height: '38px',
                  padding: '0 0.75rem',
                  borderRadius: '8px',
                  border: '1px solid var(--border)',
                  background: 'var(--input)',
                  color: 'var(--foreground)'
                }}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.25rem', color: 'var(--foreground)' }}>Company</label>
                <input
                  type="text"
                  value={manualCompany}
                  onChange={(e) => setManualCompany(e.target.value)}
                  placeholder="e.g. Acme Corp"
                  style={{
                    width: '100%',
                    height: '38px',
                    padding: '0 0.75rem',
                    borderRadius: '8px',
                    border: '1px solid var(--border)',
                    background: 'var(--input)',
                    color: 'var(--foreground)'
                  }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.25rem', color: 'var(--foreground)' }}>Location</label>
                <input
                  type="text"
                  value={manualLocation}
                  onChange={(e) => setManualLocation(e.target.value)}
                  placeholder="e.g. Remote / New York"
                  style={{
                    width: '100%',
                    height: '38px',
                    padding: '0 0.75rem',
                    borderRadius: '8px',
                    border: '1px solid var(--border)',
                    background: 'var(--input)',
                    color: 'var(--foreground)'
                  }}
                />
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.25rem', color: 'var(--foreground)' }}>Job Description *</label>
              <textarea
                value={manualDescription}
                onChange={(e) => setManualDescription(e.target.value)}
                placeholder="Paste full job description here..."
                required
                rows={5}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  borderRadius: '8px',
                  border: '1px solid var(--border)',
                  background: 'var(--input)',
                  color: 'var(--foreground)',
                  fontSize: '0.85rem',
                  resize: 'vertical'
                }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
              <button
                type="button"
                onClick={() => setShowManualModal(false)}
                className="btn-outline"
                style={{ padding: '0.5rem 1rem', borderRadius: '8px' }}
              >
                Back
              </button>
              <button
                type="submit"
                disabled={isSubmittingManual || !manualDescription.trim()}
                className="btn-primary"
                style={{ padding: '0.5rem 1.25rem', borderRadius: '8px', fontWeight: 600 }}
              >
                {isSubmittingManual ? 'Saving Job...' : 'Save & Score Job'}
              </button>
            </div>
          </form>
        )}

        {isLoading && statusStep && (
          <div style={{ marginTop: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', color: '#60a5fa' }}>
            <Loader2 className="animate-spin" size={14} />
            <span>{statusStep}</span>
          </div>
        )}

        {errorMsg && !showManualModal && (
          <div style={{ marginTop: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', color: 'var(--danger)' }}>
            <AlertCircle size={16} />
            <span>{errorMsg}</span>
          </div>
        )}

        {successMsg && (
          <div style={{ marginTop: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', color: 'var(--success)', fontWeight: 600 }}>
            <CheckCircle2 size={16} />
            <span>{successMsg}</span>
          </div>
        )}
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
