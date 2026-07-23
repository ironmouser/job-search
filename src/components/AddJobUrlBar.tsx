"use client";

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { PlusCircle, Sparkles, Globe, Loader2, AlertCircle, Clipboard, FileText, CheckCircle2 } from 'lucide-react';

interface AddJobUrlBarProps {
  userPlanTier?: string;
  onJobAdded: (newJob: any) => void;
}

export default function AddJobUrlBar({ userPlanTier = 'FREE', onJobAdded }: AddJobUrlBarProps) {
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
      // Simulate step text updates for responsive UX
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
        if (data.error === 'COULD_NOT_SCRAPE') {
          // Open manual fallback modal
          if (data.partialData) {
            setManualTitle(data.partialData.title || '');
            setManualCompany(data.partialData.company || '');
            setManualLocation(data.partialData.location || '');
          }
          setShowManualModal(true);
          setErrorMsg('Unable to scrape this site directly. Please paste the job description manually below.');
        } else {
          setErrorMsg(data.error || 'Failed to add job from URL');
        }
        setIsLoading(false);
        return;
      }

      setUrl('');
      setSuccessMsg(data.message || 'Job successfully added to your pipeline!');
      onJobAdded(data.job);
      setTimeout(() => setSuccessMsg(null), 5000);
    } catch (err: any) {
      setErrorMsg(err.message || 'Network error occurred');
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
        setErrorMsg(data.error || 'Failed to submit manual job details');
        setIsSubmittingManual(false);
        return;
      }

      setShowManualModal(false);
      setUrl('');
      setManualTitle('');
      setManualCompany('');
      setManualLocation('');
      setManualDescription('');
      setSuccessMsg(data.message || 'Job successfully added!');
      onJobAdded(data.job);
      setTimeout(() => setSuccessMsg(null), 5000);
    } catch (err: any) {
      setErrorMsg(err.message || 'Network error occurred');
    } finally {
      setIsSubmittingManual(false);
    }
  };

  return (
    <div style={{
      marginBottom: '1.5rem',
      background: 'rgba(255, 255, 255, 0.7)',
      backdropFilter: 'blur(10px)',
      border: '1px solid rgba(226, 232, 240, 0.8)',
      borderRadius: '16px',
      padding: '1.25rem 1.5rem',
      boxShadow: '0 4px 20px -2px rgba(0, 0, 0, 0.05)',
      transition: 'all 0.2s ease-in-out'
    }}>
      {/* Banner / Helper Text */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '0.75rem',
        fontSize: '0.875rem',
        fontWeight: 500
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: isPro ? '#4f46e5' : '#059669' }}>
          {isPro ? (
            <span>Paste any job URL to scrape, score & add to pipeline. <strong>Private submission (not shared with global feed)</strong>.</span>
          ) : (
            <>
              <Sparkles style={{ width: 16, height: 16 }} />
              <span>Paste a job URL to scrape & score it immediately. <strong>+1 Free Resume & Cover Letter generation unlocked!</strong></span>
            </>
          )}
        </div>
      </div>

      {/* Input Form */}
      <form onSubmit={handleSubmitUrl} style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: '1 1 300px' }}>
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="Paste job URL here (e.g. https://boards.greenhouse.io/company/jobs/12345)"
            disabled={isLoading}
            required
            style={{
              width: '100%',
              padding: '0.65rem 2.75rem 0.65rem 1rem',
              borderRadius: '10px',
              border: '1px solid #cbd5e1',
              fontSize: '0.9rem',
              outline: 'none',
              transition: 'border-color 0.2s ease',
              background: '#fff'
            }}
          />
          <button
            type="button"
            onClick={handlePaste}
            title="Paste from clipboard"
            disabled={isLoading}
            style={{
              position: 'absolute',
              right: '8px',
              top: '50%',
              transform: 'translateY(-50%)',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: '#64748b',
              padding: '4px',
              display: 'flex',
              alignItems: 'center'
            }}
          >
            <Clipboard style={{ width: 18, height: 18 }} />
          </button>
        </div>

        <button
          type="submit"
          disabled={isLoading || !url.trim()}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.65rem 1.25rem',
            borderRadius: '10px',
            background: 'linear-gradient(135deg, #4f46e5 0%, #3b82f6 100%)',
            color: '#fff',
            fontWeight: 600,
            fontSize: '0.9rem',
            border: 'none',
            cursor: isLoading || !url.trim() ? 'not-allowed' : 'pointer',
            opacity: isLoading || !url.trim() ? 0.7 : 1,
            boxShadow: '0 2px 8px rgba(79, 70, 229, 0.25)',
            transition: 'all 0.2s ease'
          }}
        >
          {isLoading ? (
            <>
              <Loader2 className="animate-spin" style={{ width: 18, height: 18 }} />
              <span>Scraping...</span>
            </>
          ) : (
            <>
              <PlusCircle style={{ width: 18, height: 18 }} />
              <span>Scrape & Add Job</span>
            </>
          )}
        </button>
      </form>

      {/* Progress & Alert Indicators */}
      {isLoading && statusStep && (
        <div style={{ marginTop: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', color: '#4f46e5' }}>
          <Loader2 className="animate-spin" style={{ width: 14, height: 14 }} />
          <span>{statusStep}</span>
        </div>
      )}

      {errorMsg && !showManualModal && (
        <div style={{ marginTop: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', color: '#ef4444' }}>
          <AlertCircle style={{ width: 16, height: 16 }} />
          <span>{errorMsg}</span>
        </div>
      )}

      {successMsg && (
        <div style={{ marginTop: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', color: '#10b981', fontWeight: 500 }}>
          <CheckCircle2 style={{ width: 16, height: 16 }} />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Manual Paste Fallback Modal */}
      {showManualModal && typeof document !== 'undefined' && createPortal(
        <div style={{
          position: 'fixed',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          backgroundColor: 'rgba(0, 0, 0, 0.6)',
          padding: '1rem'
        }}>
          <div style={{
            background: '#ffffff',
            borderRadius: '16px',
            maxWidth: '550px',
            width: '100%',
            padding: '1.75rem',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
            color: '#1e293b'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem', color: '#4f46e5' }}>
              <FileText style={{ width: 22, height: 22 }} />
              <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0 }}>Paste Job Description</h2>
            </div>
            <p style={{ fontSize: '0.875rem', color: '#64748b', marginBottom: '1.25rem' }}>
              We couldn't automatically scrape text from this URL. Please paste the job description text manually below to add it to your pipeline & generate assets.
            </p>

            <form onSubmit={handleManualSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.25rem' }}>Job Title</label>
                  <input
                    type="text"
                    value={manualTitle}
                    onChange={(e) => setManualTitle(e.target.value)}
                    placeholder="e.g. Senior Software Engineer"
                    style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.875rem' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.25rem' }}>Company</label>
                  <input
                    type="text"
                    value={manualCompany}
                    onChange={(e) => setManualCompany(e.target.value)}
                    placeholder="e.g. Acme Corp"
                    style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.875rem' }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.25rem' }}>Location (Optional)</label>
                <input
                  type="text"
                  value={manualLocation}
                  onChange={(e) => setManualLocation(e.target.value)}
                  placeholder="e.g. Remote / New York, NY"
                  style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.875rem' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.25rem' }}>Job Description Text *</label>
                <textarea
                  value={manualDescription}
                  onChange={(e) => setManualDescription(e.target.value)}
                  rows={6}
                  required
                  placeholder="Paste the full job posting requirements & description here..."
                  style={{ width: '100%', padding: '0.65rem 0.75rem', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.875rem', resize: 'vertical' }}
                />
              </div>

              {errorMsg && (
                <div style={{ fontSize: '0.85rem', color: '#ef4444', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <AlertCircle style={{ width: 15, height: 15 }} />
                  <span>{errorMsg}</span>
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
                <button
                  type="button"
                  onClick={() => setShowManualModal(false)}
                  style={{ padding: '0.5rem 1rem', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#fff', fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingManual || !manualDescription.trim()}
                  style={{
                    padding: '0.5rem 1.25rem',
                    borderRadius: '8px',
                    border: 'none',
                    background: '#4f46e5',
                    color: '#fff',
                    fontSize: '0.875rem',
                    fontWeight: 600,
                    cursor: isSubmittingManual || !manualDescription.trim() ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem'
                  }}
                >
                  {isSubmittingManual ? <Loader2 className="animate-spin" style={{ width: 16, height: 16 }} /> : 'Add Job & Score'}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
