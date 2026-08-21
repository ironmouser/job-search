"use client";

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { PlusCircle, Sparkles, Loader2, AlertCircle, Clipboard, X, CheckCircle2, Link2, FileText, Info } from 'lucide-react';
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

  // Mode Selection: 'url' or 'manual'
  const [activeTab, setActiveTab] = useState<'url' | 'manual'>('url');

  // URL Mode State
  const [url, setUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [statusStep, setStatusStep] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Manual Mode State
  const [manualTitle, setManualTitle] = useState('');
  const [manualCompany, setManualCompany] = useState('');
  const [manualLocation, setManualLocation] = useState('');
  const [manualDescription, setManualDescription] = useState('');
  const [manualUrl, setManualUrl] = useState('');
  const [isSubmittingManual, setIsSubmittingManual] = useState(false);
  const [scrapeFailureReason, setScrapeFailureReason] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Reset state on close / open
  useEffect(() => {
    if (isOpen) {
      setErrorMsg(null);
      setSuccessMsg(null);
      setScrapeFailureReason(null);
    }
  }, [isOpen]);

  if (!isOpen || !mounted) return null;

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) setUrl(text.trim());
    } catch {
      // Clipboard permission fallback
    }
  };

  const handleTabChange = (tab: 'url' | 'manual') => {
    setActiveTab(tab);
    setErrorMsg(null);
    if (tab === 'manual' && url.trim() && !manualUrl) {
      setManualUrl(url.trim());
    }
  };

  const handleSubmitUrl = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim() || isLoading) return;

    setErrorMsg(null);
    setSuccessMsg(null);
    setScrapeFailureReason(null);
    setIsLoading(true);
    setStatusStep('Fetching job page & security check...');

    try {
      const timer1 = setTimeout(() => setStatusStep('Extracting job title, company & description...'), 2000);
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

        // If scraping failed or unverified source, transition smoothly to manual entry with explanation
        if (data.error === 'COULD_NOT_SCRAPE' || data.error === 'UNTRUSTED_SOURCE') {
          if (data.partialData) {
            setManualTitle(data.partialData.title || '');
            setManualCompany(data.partialData.company || '');
            setManualLocation(data.partialData.location || '');
          }
          setManualUrl(url.trim());
          setScrapeFailureReason(errText);
          setActiveTab('manual');
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

    if (manualDescription.trim().length < 30) {
      setErrorMsg('Job description must be at least 30 characters.');
      return;
    }

    setIsSubmittingManual(true);
    setErrorMsg(null);

    try {
      const res = await fetch('/api/jobs/add-by-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: manualUrl.trim() || undefined,
          manualTitle: manualTitle.trim(),
          manualCompany: manualCompany.trim(),
          manualLocation: manualLocation.trim(),
          manualDescription: manualDescription.trim()
        })
      });

      const data = await res.json();

      if (!res.ok) {
        const errText = data.message || data.error || 'Failed to submit job details';
        trackAddJobUrl(manualUrl.trim() || 'manual', 'error', `Manual submit: ${errText}`);
        setErrorMsg(errText);
        setIsSubmittingManual(false);
        return;
      }

      trackAddJobUrl(manualUrl.trim() || 'manual', 'success', 'Manual submit');
      setUrl('');
      setManualTitle('');
      setManualCompany('');
      setManualLocation('');
      setManualDescription('');
      setManualUrl('');
      setScrapeFailureReason(null);
      setSuccessMsg(data.message || 'Job successfully added!');
      onJobAdded(data.job);
      setTimeout(() => {
        setSuccessMsg(null);
        onClose();
      }, 1200);
    } catch (err: any) {
      const errMsg = err.message || 'Network error occurred';
      trackAddJobUrl(manualUrl.trim() || 'manual', 'error', `Manual submit: ${errMsg}`);
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
          maxWidth: '580px',
          width: '100%',
          position: 'relative',
          boxShadow: '0 20px 40px rgba(0, 0, 0, 0.3)',
          color: 'var(--card-foreground)',
          maxHeight: '90vh',
          overflowY: 'auto'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          style={{
            position: 'absolute',
            top: '1.1rem',
            right: '1.1rem',
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

        {/* Modal Header */}
        <h2 style={{ marginTop: 0, marginBottom: '0.35rem', display: 'flex', alignItems: 'center', gap: '0.6rem', fontSize: '1.35rem', fontWeight: 700 }}>
          <PlusCircle size={24} style={{ color: 'var(--accent-primary)' }} />
          Add Job Opening
        </h2>

        {/* Dynamic Context Instructions */}
        <p style={{ fontSize: '0.85rem', color: 'var(--muted-foreground)', marginBottom: '1.25rem', lineHeight: '1.4' }}>
          {activeTab === 'url' ? (
            isPro ? (
              <span>Paste any job opening URL to automatically extract details, score match & add to your pipeline.</span>
            ) : (
              <span>Paste a job URL to scrape & score match immediately. Unlocks +1 Free Resume & Cover Letter generation!</span>
            )
          ) : (
            <span>Enter the job details and full description below to save this position and calculate your match score.</span>
          )}
        </p>

        {/* Segmented Mode Selector Tabs */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '6px',
            backgroundColor: 'var(--muted)',
            padding: '4px',
            borderRadius: '10px',
            marginBottom: '1.25rem'
          }}
        >
          <button
            type="button"
            onClick={() => handleTabChange('url')}
            disabled={isLoading || isSubmittingManual}
            style={{
              padding: '0.5rem 0.75rem',
              borderRadius: '7px',
              border: 'none',
              fontSize: '0.85rem',
              fontWeight: activeTab === 'url' ? 600 : 500,
              backgroundColor: activeTab === 'url' ? 'var(--card)' : 'transparent',
              color: activeTab === 'url' ? 'var(--foreground)' : 'var(--muted-foreground)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              boxShadow: activeTab === 'url' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
              transition: 'all 0.15s ease'
            }}
          >
            <Link2 size={16} />
            <span>Import via URL</span>
          </button>

          <button
            type="button"
            onClick={() => handleTabChange('manual')}
            disabled={isLoading || isSubmittingManual}
            style={{
              padding: '0.5rem 0.75rem',
              borderRadius: '7px',
              border: 'none',
              fontSize: '0.85rem',
              fontWeight: activeTab === 'manual' ? 600 : 500,
              backgroundColor: activeTab === 'manual' ? 'var(--card)' : 'transparent',
              color: activeTab === 'manual' ? 'var(--foreground)' : 'var(--muted-foreground)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              boxShadow: activeTab === 'manual' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
              transition: 'all 0.15s ease'
            }}
          >
            <FileText size={16} />
            <span>Enter Job Info</span>
          </button>
        </div>

        {/* Tab 1: URL Mode */}
        {activeTab === 'url' && (
          <form onSubmit={handleSubmitUrl} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ position: 'relative', width: '100%' }}>
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="Paste job URL (e.g. https://company.com/careers/jobs/...)"
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

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.25rem' }}>
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
                    <span>Scraping & Scoring...</span>
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
        )}

        {/* Tab 2: Manual Mode */}
        {activeTab === 'manual' && (
          <form onSubmit={handleManualSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
            {/* Scrape Failure Alert Banner */}
            {scrapeFailureReason && (
              <div
                style={{
                  padding: '0.75rem 0.85rem',
                  borderRadius: '8px',
                  backgroundColor: 'rgba(234, 179, 8, 0.1)',
                  border: '1px solid rgba(234, 179, 8, 0.3)',
                  color: 'var(--foreground)',
                  fontSize: '0.825rem',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '0.5rem',
                  lineHeight: '1.4'
                }}
              >
                <Info size={16} style={{ color: '#eab308', flexShrink: 0, marginTop: '2px' }} />
                <div>
                  <strong>Automatic scrape notice:</strong> {scrapeFailureReason}
                  <div style={{ marginTop: '3px', color: 'var(--muted-foreground)' }}>
                    You can easily add this position by filling out the details below.
                  </div>
                </div>
              </div>
            )}

            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.25rem', color: 'var(--foreground)' }}>
                Job Title <span style={{ color: 'var(--danger)' }}>*</span>
              </label>
              <input
                type="text"
                value={manualTitle}
                onChange={(e) => setManualTitle(e.target.value)}
                placeholder="e.g. Senior Product Manager"
                maxLength={200}
                required
                style={{
                  width: '100%',
                  height: '38px',
                  padding: '0 0.75rem',
                  borderRadius: '8px',
                  border: '1px solid var(--border)',
                  background: 'var(--input)',
                  color: 'var(--foreground)',
                  fontSize: '0.875rem'
                }}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.25rem', color: 'var(--foreground)' }}>
                  Company <span style={{ color: 'var(--danger)' }}>*</span>
                </label>
                <input
                  type="text"
                  value={manualCompany}
                  onChange={(e) => setManualCompany(e.target.value)}
                  placeholder="e.g. Acme Corp"
                  maxLength={200}
                  required
                  style={{
                    width: '100%',
                    height: '38px',
                    padding: '0 0.75rem',
                    borderRadius: '8px',
                    border: '1px solid var(--border)',
                    background: 'var(--input)',
                    color: 'var(--foreground)',
                    fontSize: '0.875rem'
                  }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.25rem', color: 'var(--foreground)' }}>
                  Location
                </label>
                <input
                  type="text"
                  value={manualLocation}
                  onChange={(e) => setManualLocation(e.target.value)}
                  placeholder="e.g. Remote / Seattle, WA"
                  maxLength={200}
                  style={{
                    width: '100%',
                    height: '38px',
                    padding: '0 0.75rem',
                    borderRadius: '8px',
                    border: '1px solid var(--border)',
                    background: 'var(--input)',
                    color: 'var(--foreground)',
                    fontSize: '0.875rem'
                  }}
                />
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.25rem', color: 'var(--foreground)' }}>
                Job Posting URL (Optional)
              </label>
              <input
                type="url"
                value={manualUrl}
                onChange={(e) => setManualUrl(e.target.value)}
                placeholder="https://company.com/careers/..."
                style={{
                  width: '100%',
                  height: '38px',
                  padding: '0 0.75rem',
                  borderRadius: '8px',
                  border: '1px solid var(--border)',
                  background: 'var(--input)',
                  color: 'var(--foreground)',
                  fontSize: '0.875rem'
                }}
              />
            </div>

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--foreground)' }}>
                  Job Description <span style={{ color: 'var(--danger)' }}>*</span>
                </label>
                <span style={{ fontSize: '0.75rem', color: manualDescription.length > 24000 ? 'var(--danger)' : 'var(--muted-foreground)' }}>
                  {manualDescription.length.toLocaleString()} / 25,000
                </span>
              </div>
              <textarea
                value={manualDescription}
                onChange={(e) => setManualDescription(e.target.value)}
                placeholder="Paste the full job description, role requirements, and responsibilities here..."
                required
                maxLength={25000}
                rows={6}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  borderRadius: '8px',
                  border: '1px solid var(--border)',
                  background: 'var(--input)',
                  color: 'var(--foreground)',
                  fontSize: '0.85rem',
                  resize: 'vertical',
                  lineHeight: '1.4'
                }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.25rem' }}>
              <button
                type="button"
                onClick={onClose}
                className="btn-outline"
                style={{ padding: '0.55rem 1.15rem', borderRadius: '8px', fontSize: '0.9rem' }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmittingManual || !manualDescription.trim() || !manualTitle.trim() || !manualCompany.trim()}
                className="btn-primary"
                style={{
                  padding: '0.55rem 1.35rem',
                  borderRadius: '8px',
                  fontWeight: 600,
                  fontSize: '0.9rem',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.5rem'
                }}
              >
                {isSubmittingManual ? (
                  <>
                    <Loader2 className="animate-spin" size={16} />
                    <span>Saving & Scoring...</span>
                  </>
                ) : (
                  <>
                    <Sparkles size={16} />
                    <span>Save & Score Job</span>
                  </>
                )}
              </button>
            </div>
          </form>
        )}

        {/* Live Loading Steps */}
        {isLoading && statusStep && (
          <div style={{ marginTop: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', color: '#60a5fa' }}>
            <Loader2 className="animate-spin" size={14} />
            <span>{statusStep}</span>
          </div>
        )}

        {/* Error Messages */}
        {errorMsg && (
          <div style={{ marginTop: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', color: 'var(--danger)' }}>
            <AlertCircle size={16} />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Success Messages */}
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
