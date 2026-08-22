"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { 
  Sparkles, 
  Link2, 
  FileText, 
  Clipboard, 
  Loader2, 
  AlertCircle, 
  CheckCircle2, 
  ArrowRight, 
  ArrowLeft,
  Zap,
  Info
} from 'lucide-react';
import { 
  trackPrepareApplicationView, 
  trackPrepareApplicationStart, 
  trackPrepareApplicationSuccess, 
  trackPrepareApplicationError 
} from '@/lib/analytics';
import { PageHeader, PageHeaderHeading, PageHeaderDescription } from '@/components/ui/page-header';

interface PreparedJob {
  id: string;
  title: string;
  company: string;
  location?: string | null;
  url?: string | null;
  description?: string | null;
}

interface PrepareApplicationFlowProps {
  userPlanTier?: string;
  hasBaseResume?: boolean;
}

export default function PrepareApplicationFlow({
  userPlanTier = 'FREE',
  hasBaseResume = false
}: PrepareApplicationFlowProps = {}) {
  const router = useRouter();

  // Mode Selection: 'url' or 'manual'
  const [activeTab, setActiveTab] = useState<'url' | 'manual'>('url');

  // URL Mode State
  const [url, setUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [statusStep, setStatusStep] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [createdJob, setCreatedJob] = useState<PreparedJob | null>(null);

  // Manual Mode State
  const [manualTitle, setManualTitle] = useState('');
  const [manualCompany, setManualCompany] = useState('');
  const [manualLocation, setManualLocation] = useState('');
  const [manualDescription, setManualDescription] = useState('');
  const [manualUrl, setManualUrl] = useState('');
  const [isSubmittingManual, setIsSubmittingManual] = useState(false);
  const [scrapeFailureNotice, setScrapeFailureNotice] = useState<string | null>(null);

  useEffect(() => {
    trackPrepareApplicationView('prepare_page');
  }, []);

  const handlePasteClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setUrl(text.trim());
      }
    } catch {
      // Clipboard fallback
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
    setScrapeFailureNotice(null);
    setIsLoading(true);
    trackPrepareApplicationStart('url');
    setStatusStep('Connecting to job posting and security check...');

    try {
      const timer1 = setTimeout(() => {
        setStatusStep('Extracting job title, company and requirements...');
      }, 1800);
      const timer2 = setTimeout(() => {
        setStatusStep('Evaluating opportunity match and preparing workspace...');
      }, 4200);

      const res = await fetch('/api/jobs/add-by-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim() })
      });

      clearTimeout(timer1);
      clearTimeout(timer2);

      const data = await res.json();

      if (!res.ok) {
        const errText = data.message || data.error || 'Unable to import job from this link';
        trackPrepareApplicationError(errText, 'url');

        if (data.error === 'COULD_NOT_SCRAPE' || data.error === 'UNTRUSTED_SOURCE') {
          if (data.partialData) {
            setManualTitle(data.partialData.title || '');
            setManualCompany(data.partialData.company || '');
            setManualLocation(data.partialData.location || '');
          }
          setManualUrl(url.trim());
          setScrapeFailureNotice(errText);
          setActiveTab('manual');
        } else {
          setErrorMsg(errText);
        }
        setIsLoading(false);
        return;
      }

      trackPrepareApplicationSuccess(data.job?.id || 'unknown', 'url');
      setCreatedJob(data.job);
      setIsLoading(false);

      // Smooth transition into the opportunity workspace
      setTimeout(() => {
        router.push(`/job/${data.job.id}`);
      }, 1400);

    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : 'Network error occurred. Please try again.';
      trackPrepareApplicationError(errMsg, 'url');
      setErrorMsg(errMsg);
      setIsLoading(false);
    } finally {
      setStatusStep('');
    }
  };

  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualDescription.trim() || isSubmittingManual) return;

    if (manualDescription.trim().length < 30) {
      setErrorMsg('Please enter at least 30 characters for the job description.');
      return;
    }

    setIsSubmittingManual(true);
    setErrorMsg(null);
    trackPrepareApplicationStart('manual');

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
        trackPrepareApplicationError(errText, 'manual');
        setErrorMsg(errText);
        setIsSubmittingManual(false);
        return;
      }

      trackPrepareApplicationSuccess(data.job?.id || 'unknown', 'manual');
      setCreatedJob(data.job);
      setIsSubmittingManual(false);

      // Smooth transition into the opportunity workspace
      setTimeout(() => {
        router.push(`/job/${data.job.id}`);
      }, 1400);

    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : 'Network error occurred. Please try again.';
      trackPrepareApplicationError(errMsg, 'manual');
      setErrorMsg(errMsg);
      setIsSubmittingManual(false);
    }
  };

  return (
    <div className="animate-fade-in" style={{ paddingBottom: '6rem', maxWidth: '1080px', margin: '0 auto' }}>
      {/* Top Breadcrumb Navigation */}
      <div style={{ marginBottom: '1.25rem' }}>
        <Link 
          href="/dashboard" 
          className="btn-outline" 
          style={{ 
            border: 'none', 
            padding: '0.4rem 0', 
            color: 'var(--text-secondary)',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.4rem',
            fontSize: '0.9rem'
          }}
        >
          <ArrowLeft size={16} /> Back to Dashboard
        </Link>
      </div>

      {/* Main Header */}
      <PageHeader style={{ marginBottom: '2rem' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <div style={{
              width: '36px',
              height: '36px',
              borderRadius: '10px',
              background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.2), rgba(56, 189, 248, 0.2))',
              border: '1px solid rgba(99, 102, 241, 0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--accent-primary, #6366f1)'
            }}>
              <Sparkles size={20} />
            </div>
            <PageHeaderHeading style={{ fontSize: '1.75rem', fontWeight: 800, margin: 0 }}>
              Prepare an Application
            </PageHeaderHeading>
          </div>
          <PageHeaderDescription style={{ fontSize: '0.95rem', color: 'var(--text-secondary)', maxWidth: '780px', lineHeight: 1.5, marginTop: '0.25rem' }}>
            Already found a job somewhere else? Bring any job posting URL or description to Jahq. We will analyze what the employer is looking for, evaluate your match, and help you tailor your resume and cover letter for maximum impact.
          </PageHeaderDescription>
        </div>
      </PageHeader>

      {/* Two Column Layout: Main Input Panel + Value Proposition Highlights */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'minmax(0, 1.45fr) minmax(0, 1fr)', 
        gap: '2rem',
        alignItems: 'start'
      }} className="responsive-prepare-grid">
        
        {/* Left Column: Interactive Input Container */}
        <div className="glass-card" style={{
          padding: '1.75rem',
          borderRadius: '16px',
          border: '1px solid var(--border-glass, rgba(255, 255, 255, 0.12))',
          background: 'var(--card, rgba(15, 23, 42, 0.6))',
          boxShadow: '0 12px 32px rgba(0, 0, 0, 0.2)'
        }}>
          
          {/* Success Banner State */}
          {createdJob ? (
            <div style={{ padding: '1rem 0', textAlign: 'center' }}>
              <div style={{
                width: '56px',
                height: '56px',
                borderRadius: '50%',
                background: 'rgba(16, 185, 129, 0.15)',
                color: '#10b981',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 1.25rem'
              }}>
                <CheckCircle2 size={32} />
              </div>
              <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1.3rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                Opportunity Ready!
              </h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.92rem', marginBottom: '1.5rem', lineHeight: 1.5 }}>
                We have analyzed <strong>{createdJob.title}</strong> at <strong>{createdJob.company}</strong>. Opening your application workspace now.
              </p>
              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <Link
                  href={`/job/${createdJob.id}`}
                  className="btn-primary"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    padding: '0.75rem 1.75rem',
                    fontSize: '0.95rem',
                    fontWeight: 600
                  }}
                >
                  <span>Open Application Workspace</span>
                  <ArrowRight size={16} />
                </Link>
              </div>
            </div>
          ) : (
            <>
              {/* Segmented Mode Selector Tabs */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '6px',
                  backgroundColor: 'rgba(255, 255, 255, 0.05)',
                  padding: '4px',
                  borderRadius: '10px',
                  marginBottom: '1.5rem',
                  border: '1px solid var(--border-glass, rgba(255, 255, 255, 0.08))'
                }}
              >
                <button
                  type="button"
                  onClick={() => handleTabChange('url')}
                  disabled={isLoading || isSubmittingManual}
                  style={{
                    padding: '0.65rem 0.75rem',
                    borderRadius: '8px',
                    border: 'none',
                    fontSize: '0.88rem',
                    fontWeight: activeTab === 'url' ? 600 : 500,
                    backgroundColor: activeTab === 'url' ? 'var(--accent-primary, #6366f1)' : 'transparent',
                    color: activeTab === 'url' ? '#ffffff' : 'var(--text-secondary)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <Link2 size={16} />
                  <span>Import via Job URL</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleTabChange('manual')}
                  disabled={isLoading || isSubmittingManual}
                  style={{
                    padding: '0.65rem 0.75rem',
                    borderRadius: '8px',
                    border: 'none',
                    fontSize: '0.88rem',
                    fontWeight: activeTab === 'manual' ? 600 : 500,
                    backgroundColor: activeTab === 'manual' ? 'var(--accent-primary, #6366f1)' : 'transparent',
                    color: activeTab === 'manual' ? '#ffffff' : 'var(--text-secondary)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <FileText size={16} />
                  <span>Paste Job Description</span>
                </button>
              </div>

              {/* Mode 1: Import via Job URL */}
              {activeTab === 'url' && (
                <form onSubmit={handleSubmitUrl} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.4rem', color: 'var(--text-primary)' }}>
                      Job Posting URL
                    </label>
                    <div style={{ position: 'relative', width: '100%' }}>
                      <input
                        type="url"
                        value={url}
                        onChange={(e) => setUrl(e.target.value)}
                        placeholder="https://boards.greenhouse.io/company/jobs/... or any job link"
                        disabled={isLoading}
                        required
                        style={{
                          width: '100%',
                          height: '46px',
                          padding: '0 3rem 0 1rem',
                          borderRadius: '10px',
                          border: '1px solid var(--border-glass, rgba(255, 255, 255, 0.15))',
                          fontSize: '0.92rem',
                          outline: 'none',
                          background: 'var(--input, rgba(0, 0, 0, 0.25))',
                          color: 'var(--text-primary)'
                        }}
                      />
                      <button
                        type="button"
                        onClick={handlePasteClipboard}
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
                          color: 'var(--text-secondary)',
                          padding: '6px',
                          display: 'flex',
                          alignItems: 'center',
                          borderRadius: '6px'
                        }}
                      >
                        <Clipboard size={18} />
                      </button>
                    </div>
                    <span style={{ display: 'block', fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '0.4rem' }}>
                      Supports Greenhouse, Lever, Workday, Ashby, LinkedIn, Indeed, SmartRecruiters, and direct company career sites.
                    </span>
                  </div>

                  {/* Live Loading Steps */}
                  {isLoading && statusStep && (
                    <div style={{ 
                      padding: '0.85rem 1rem', 
                      borderRadius: '8px', 
                      backgroundColor: 'rgba(56, 189, 248, 0.1)', 
                      border: '1px solid rgba(56, 189, 248, 0.25)', 
                      display: 'flex', 
                      alignItems: 'center', 
                      gap: '0.6rem', 
                      fontSize: '0.88rem', 
                      color: '#38bdf8' 
                    }}>
                      <Loader2 className="animate-spin" size={16} />
                      <span>{statusStep}</span>
                    </div>
                  )}

                  {/* Error Notification */}
                  {errorMsg && (
                    <div style={{ 
                      padding: '0.85rem 1rem', 
                      borderRadius: '8px', 
                      backgroundColor: 'rgba(239, 68, 68, 0.1)', 
                      border: '1px solid rgba(239, 68, 68, 0.25)', 
                      display: 'flex', 
                      alignItems: 'flex-start', 
                      gap: '0.6rem', 
                      fontSize: '0.86rem', 
                      color: '#f87171' 
                    }}>
                      <AlertCircle size={17} style={{ flexShrink: 0, marginTop: '2px' }} />
                      <span>{errorMsg}</span>
                    </div>
                  )}

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
                    <button
                      type="submit"
                      disabled={isLoading || !url.trim()}
                      className="btn-primary"
                      style={{
                        padding: '0.75rem 1.75rem',
                        borderRadius: '10px',
                        fontSize: '0.92rem',
                        fontWeight: 600,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.5rem'
                      }}
                    >
                      {isLoading ? (
                        <>
                          <Loader2 className="animate-spin" size={16} />
                          <span>Analyzing Opportunity...</span>
                        </>
                      ) : (
                        <>
                          <Sparkles size={16} />
                          <span>Analyze & Prepare Application</span>
                        </>
                      )}
                    </button>
                  </div>
                </form>
              )}

              {/* Mode 2: Paste Job Description */}
              {activeTab === 'manual' && (
                <form onSubmit={handleManualSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {/* Scrape Fallback Notice */}
                  {scrapeFailureNotice && (
                    <div
                      style={{
                        padding: '0.85rem 1rem',
                        borderRadius: '8px',
                        backgroundColor: 'rgba(234, 179, 8, 0.1)',
                        border: '1px solid rgba(234, 179, 8, 0.3)',
                        color: 'var(--text-primary)',
                        fontSize: '0.85rem',
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: '0.6rem',
                        lineHeight: 1.4
                      }}
                    >
                      <Info size={18} style={{ color: '#eab308', flexShrink: 0, marginTop: '2px' }} />
                      <div>
                        <strong>Notice:</strong> {scrapeFailureNotice}
                        <div style={{ marginTop: '3px', color: 'var(--text-secondary)' }}>
                          You can paste the job description text below and we will analyze your opportunity immediately.
                        </div>
                      </div>
                    </div>
                  )}

                  <div>
                    <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '0.3rem', color: 'var(--text-primary)' }}>
                      Job Title <span style={{ color: 'var(--danger, #ef4444)' }}>*</span>
                    </label>
                    <input
                      type="text"
                      value={manualTitle}
                      onChange={(e) => setManualTitle(e.target.value)}
                      placeholder="e.g. Staff Product Designer"
                      maxLength={200}
                      required
                      style={{
                        width: '100%',
                        height: '40px',
                        padding: '0 0.85rem',
                        borderRadius: '8px',
                        border: '1px solid var(--border-glass, rgba(255, 255, 255, 0.15))',
                        background: 'var(--input, rgba(0, 0, 0, 0.25))',
                        color: 'var(--text-primary)',
                        fontSize: '0.88rem'
                      }}
                    />
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '0.3rem', color: 'var(--text-primary)' }}>
                        Company Name <span style={{ color: 'var(--danger, #ef4444)' }}>*</span>
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
                          height: '40px',
                          padding: '0 0.85rem',
                          borderRadius: '8px',
                          border: '1px solid var(--border-glass, rgba(255, 255, 255, 0.15))',
                          background: 'var(--input, rgba(0, 0, 0, 0.25))',
                          color: 'var(--text-primary)',
                          fontSize: '0.88rem'
                        }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '0.3rem', color: 'var(--text-primary)' }}>
                        Location
                      </label>
                      <input
                        type="text"
                        value={manualLocation}
                        onChange={(e) => setManualLocation(e.target.value)}
                        placeholder="e.g. Remote / New York, NY"
                        maxLength={200}
                        style={{
                          width: '100%',
                          height: '40px',
                          padding: '0 0.85rem',
                          borderRadius: '8px',
                          border: '1px solid var(--border-glass, rgba(255, 255, 255, 0.15))',
                          background: 'var(--input, rgba(0, 0, 0, 0.25))',
                          color: 'var(--text-primary)',
                          fontSize: '0.88rem'
                        }}
                      />
                    </div>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '0.3rem', color: 'var(--text-primary)' }}>
                      Original Posting Link (Optional)
                    </label>
                    <input
                      type="url"
                      value={manualUrl}
                      onChange={(e) => setManualUrl(e.target.value)}
                      placeholder="https://company.com/careers/..."
                      style={{
                        width: '100%',
                        height: '40px',
                        padding: '0 0.85rem',
                        borderRadius: '8px',
                        border: '1px solid var(--border-glass, rgba(255, 255, 255, 0.15))',
                        background: 'var(--input, rgba(0, 0, 0, 0.25))',
                        color: 'var(--text-primary)',
                        fontSize: '0.88rem'
                      }}
                    />
                  </div>

                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.3rem' }}>
                      <label style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                        Job Description & Role Requirements <span style={{ color: 'var(--danger, #ef4444)' }}>*</span>
                      </label>
                      <span style={{ fontSize: '0.75rem', color: manualDescription.length > 24000 ? 'var(--danger, #ef4444)' : 'var(--text-secondary)' }}>
                        {manualDescription.length.toLocaleString()} / 25,000
                      </span>
                    </div>
                    <textarea
                      value={manualDescription}
                      onChange={(e) => setManualDescription(e.target.value)}
                      placeholder="Paste the full job description, role requirements, qualifications, and responsibilities here..."
                      required
                      maxLength={25000}
                      rows={8}
                      style={{
                        width: '100%',
                        padding: '0.85rem',
                        borderRadius: '8px',
                        border: '1px solid var(--border-glass, rgba(255, 255, 255, 0.15))',
                        background: 'var(--input, rgba(0, 0, 0, 0.25))',
                        color: 'var(--text-primary)',
                        fontSize: '0.88rem',
                        resize: 'vertical',
                        lineHeight: 1.5
                      }}
                    />
                  </div>

                  {errorMsg && (
                    <div style={{ 
                      padding: '0.85rem 1rem', 
                      borderRadius: '8px', 
                      backgroundColor: 'rgba(239, 68, 68, 0.1)', 
                      border: '1px solid rgba(239, 68, 68, 0.25)', 
                      display: 'flex', 
                      alignItems: 'center', 
                      gap: '0.6rem', 
                      fontSize: '0.86rem', 
                      color: '#f87171' 
                    }}>
                      <AlertCircle size={16} />
                      <span>{errorMsg}</span>
                    </div>
                  )}

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
                    <button
                      type="submit"
                      disabled={isSubmittingManual || !manualDescription.trim() || !manualTitle.trim() || !manualCompany.trim()}
                      className="btn-primary"
                      style={{
                        padding: '0.75rem 1.75rem',
                        borderRadius: '10px',
                        fontSize: '0.92rem',
                        fontWeight: 600,
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
                          <span>Save & Prepare Application</span>
                        </>
                      )}
                    </button>
                  </div>
                </form>
              )}
            </>
          )}
        </div>

        {/* Right Column: Value Proposition & Workflow Steps */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          
          {/* Value Card */}
          <div className="glass-card" style={{
            padding: '1.5rem',
            borderRadius: '16px',
            border: '1px solid var(--border-glass, rgba(255, 255, 255, 0.12))',
            background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.08) 0%, rgba(56, 189, 248, 0.04) 100%)'
          }}>
            <h3 style={{ margin: '0 0 0.85rem 0', fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Zap size={18} style={{ color: 'var(--accent-primary, #6366f1)' }} />
              What Jahq will do for this job
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
              <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
                <div style={{
                  width: '24px',
                  height: '24px',
                  borderRadius: '50%',
                  background: 'rgba(99, 102, 241, 0.2)',
                  color: 'var(--accent-primary, #6366f1)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '0.78rem',
                  fontWeight: 700,
                  flexShrink: 0,
                  marginTop: '2px'
                }}>1</div>
                <div>
                  <h4 style={{ margin: '0 0 0.15rem 0', fontSize: '0.88rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                    Analyze Employer Requirements
                  </h4>
                  <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                    Extract core responsibilities, tech stack, and evaluation signals from the job posting.
                  </p>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
                <div style={{
                  width: '24px',
                  height: '24px',
                  borderRadius: '50%',
                  background: 'rgba(99, 102, 241, 0.2)',
                  color: 'var(--accent-primary, #6366f1)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '0.78rem',
                  fontWeight: 700,
                  flexShrink: 0,
                  marginTop: '2px'
                }}>2</div>
                <div>
                  <h4 style={{ margin: '0 0 0.15rem 0', fontSize: '0.88rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                    Calculate AI Opportunity Score
                  </h4>
                  <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                    Evaluate product fit, compensation, remote flex, and culture fit against your experience.
                  </p>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
                <div style={{
                  width: '24px',
                  height: '24px',
                  borderRadius: '50%',
                  background: 'rgba(99, 102, 241, 0.2)',
                  color: 'var(--accent-primary, #6366f1)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '0.78rem',
                  fontWeight: 700,
                  flexShrink: 0,
                  marginTop: '2px'
                }}>3</div>
                <div>
                  <h4 style={{ margin: '0 0 0.15rem 0', fontSize: '0.88rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                    Tailor Resume & Generate Cover Letter
                  </h4>
                  <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                    Craft targeted resume extracts and compelling 3-paragraph cover letters ready for export.
                  </p>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
                <div style={{
                  width: '24px',
                  height: '24px',
                  borderRadius: '50%',
                  background: 'rgba(99, 102, 241, 0.2)',
                  color: 'var(--accent-primary, #6366f1)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '0.78rem',
                  fontWeight: 700,
                  flexShrink: 0,
                  marginTop: '2px'
                }}>4</div>
                <div>
                  <h4 style={{ margin: '0 0 0.15rem 0', fontSize: '0.88rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                    Streamline Application & Q&A
                  </h4>
                  <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                    Answer screening questions and leverage 1-click apply assistance for ATS forms.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Privacy & Custom Submission Note */}
          <div style={{
            padding: '1rem 1.25rem',
            borderRadius: '12px',
            background: 'rgba(255, 255, 255, 0.03)',
            border: '1px solid var(--border-glass, rgba(255, 255, 255, 0.08))',
            fontSize: '0.82rem',
            color: 'var(--text-secondary)',
            lineHeight: 1.45
          }}>
            <strong style={{ color: 'var(--text-primary)' }}>Private & Secure:</strong> Jobs brought into Jahq belong to your personal workspace. You can revisit, tailor, or export your application assets anytime from your dashboard and tracker.
          </div>

        </div>

      </div>
    </div>
  );
}
