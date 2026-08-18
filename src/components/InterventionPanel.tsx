'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, Check, ShieldAlert, Smartphone, HelpCircle, FileText, Paperclip, Key, ClipboardList, ExternalLink, Save, ArrowRight, Zap } from 'lucide-react';

interface InterventionPanelProps {
  interventionId: string;
  reason: string;
  description: string;
  screenshotUrl?: string | null;
  pageUrl?: string | null;
  jobId?: string | null;
  onResolved: () => void;
}

const REASON_LABELS: Record<string, string> = {
  captcha:              'CAPTCHA Verification Required',
  mfa_required:         'Two-Factor Authentication Required',
  unknown_question:     'Application Question Required',
  unexpected_page:      'Unsupported ATS or Custom Page Layout',
  job_closed:           'Job No Longer Accepting Applications',
  resume_rejected:      'Resume Format Rejected by ATS',
  attachment_missing:   'Required Attachment Missing',
  login_required:       'Account Login Required',
  assessment_required:  'Candidate Assessment Required',
};

function getReasonIcon(reason: string, isClosed: boolean, isUnsupportedOrFatal: boolean) {
  if (isClosed || reason === 'job_closed') return <ShieldAlert size={16} color="#ef4444" />;
  if (isUnsupportedOrFatal) return <AlertTriangle size={16} color="#f97316" />;
  switch (reason) {
    case 'captcha': return <ShieldAlert size={16} color="#fbbf24" />;
    case 'mfa_required': return <Smartphone size={16} color="#fbbf24" />;
    case 'unknown_question': return <HelpCircle size={16} color="#fbbf24" />;
    case 'resume_rejected': return <FileText size={16} color="#fbbf24" />;
    case 'attachment_missing': return <Paperclip size={16} color="#fbbf24" />;
    case 'login_required': return <Key size={16} color="#fbbf24" />;
    case 'assessment_required': return <ClipboardList size={16} color="#fbbf24" />;
    default: return <AlertTriangle size={16} color="#fbbf24" />;
  }
}

export function InterventionPanel({
  interventionId,
  reason,
  description,
  screenshotUrl,
  pageUrl,
  jobId,
  onResolved,
}: InterventionPanelProps) {
  const [resolving, setResolving] = useState(false);
  const [resolution, setResolution] = useState<'completed' | 'skipped' | 'cancelled' | null>(null);

  const [settings, setSettings] = useState<any>(null);
  const [loadingSettings, setLoadingSettings] = useState(true);

  useEffect(() => {
    fetch('/api/settings', { cache: 'no-store' })
      .then(res => res.json())
      .then(data => {
        setSettings(data);
        setLoadingSettings(false);
      })
      .catch(() => setLoadingSettings(false));
  }, []);

  const isMissingAuth = settings && (
    !settings.usWorkAuthorization || 
    !settings.visaSponsorship || 
    !settings.workingRemotelyFrom || 
    !settings.country || 
    !settings.eeocGender || 
    !settings.eeocRace || 
    !settings.eeocVeteran || 
    !settings.eeocDisability ||
    !settings.phone ||
    (!settings.location && !settings.city) ||
    !settings.linkedinUrl
  );

  const showAuthForm = reason === 'unknown_question' || isMissingAuth;

  const handleSettingsChange = (key: string, value: any) => {
    setSettings((prev: any) => ({ ...prev, [key]: value }));
  };

  async function saveSettings() {
    if (!settings) return;
    try {
      await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings)
      });
    } catch (e) {
      console.error('[InterventionPanel] Failed to save settings:', e);
    }
  }

  const isClosed =
    reason === 'job_closed' ||
    description.toLowerCase().includes('no longer accepting') ||
    description.toLowerCase().includes('no longer available') ||
    description.toLowerCase().includes('position closed') ||
    description.toLowerCase().includes('job closed') ||
    description.toLowerCase().includes('has expired') ||
    description.toLowerCase().includes('been filled') ||
    description.toLowerCase().includes('applications are closed') ||
    description.toLowerCase().includes('publication is closed') ||
    description.toLowerCase().includes('opening has been closed') ||
    description.toLowerCase().includes('not accepting applications');

  const isUnsupportedOrFatal =
    !isClosed && (
      reason === 'unexpected_page' ||
      reason === 'resume_rejected' ||
      reason === 'assessment_required' ||
      description.toLowerCase().includes('not currently supported') ||
      description.toLowerCase().includes('apply manually') ||
      description.toLowerCase().includes('cannot automate')
    );

  async function resolve(res: 'completed' | 'skipped' | 'cancelled') {
    setResolving(true);
    setResolution(res);
    try {
      if (res === 'completed' && settings) {
        await saveSettings();
      }
      await fetch(`/api/auto-apply/interventions/${interventionId}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resolution: res }),
      });
      onResolved();
    } finally {
      setResolving(false);
    }
  }

  async function handleDismissAndArchive() {
    setResolving(true);
    setResolution('skipped');
    try {
      if (jobId) {
        await fetch(`/api/jobs/${jobId}/archive`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ isArchived: true }),
        }).catch(() => {});
      }
      await fetch(`/api/auto-apply/interventions/${interventionId}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resolution: 'skipped' }),
      });
      onResolved();
    } finally {
      setResolving(false);
    }
  }

  function handleManualContinue() {
    if (pageUrl) {
      window.open(pageUrl, '_blank', 'noopener,noreferrer');
    }
    resolve('skipped');
  }

  const badgeColor = isClosed ? '#f87171' : isUnsupportedOrFatal ? '#fbbf24' : '#818cf8';
  const borderColor = isClosed
    ? 'rgba(239, 68, 68, 0.35)'
    : isUnsupportedOrFatal
    ? 'rgba(245, 158, 11, 0.35)'
    : 'rgba(99, 102, 241, 0.35)';
  const bgCard = isClosed
    ? 'rgba(239, 68, 68, 0.06)'
    : isUnsupportedOrFatal
    ? 'rgba(245, 158, 11, 0.06)'
    : 'rgba(99, 102, 241, 0.06)';

  return (
    <div
      style={{
        background: bgCard,
        border: `1.5px solid ${borderColor}`,
        borderRadius: '12px',
        padding: '1.25rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '1rem',
        boxShadow: '0 8px 24px rgba(0, 0, 0, 0.15)',
      }}
      id={`intervention-panel-${interventionId}`}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        {getReasonIcon(reason, isClosed, isUnsupportedOrFatal)}
        <span style={{ fontWeight: 700, color: badgeColor, fontSize: '0.95rem', letterSpacing: '-0.01em' }}>
          {isClosed ? REASON_LABELS.job_closed : (REASON_LABELS[reason] ?? reason)}
        </span>
      </div>

      {(() => {
        let displayDesc = description;
        if (reason === 'unknown_question') {
          const match = description.match(/(?:requires your input|question):\s*["'“]?([^"'”\n]+)["'”]?/i);
          if (match && match[1]) {
            displayDesc = `I did not have enough information to answer: "${match[1].trim()}"`;
          }
        } else if (isClosed) {
          displayDesc = 'This job posting has been closed, filled, or is no longer accepting applications on the employer website.';
        }
        return (
          <p style={{ margin: 0, fontSize: '0.88rem', color: 'var(--text-primary)', lineHeight: 1.5, fontWeight: 500 }}>
            {displayDesc}
          </p>
        );
      })()}

      {screenshotUrl && (
        <img
          src={screenshotUrl}
          alt="Screenshot of the job application screen"
          style={{ borderRadius: '8px', border: '1px solid var(--border-glass)', maxHeight: '200px', objectFit: 'contain' }}
        />
      )}

      {isClosed ? (
        <>
          <div
            style={{
              fontSize: '0.85rem',
              color: 'var(--text-primary)',
              background: 'rgba(239, 68, 68, 0.08)',
              border: '1px solid rgba(239, 68, 68, 0.25)',
              borderRadius: '8px',
              padding: '0.9rem 1.1rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.5rem',
              lineHeight: 1.5,
            }}
          >
            <div>
              <strong style={{ color: '#f87171', display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.88rem', marginBottom: '0.15rem' }}>
                <ShieldAlert size={16} /> Posting Status
              </strong>
              <span style={{ fontSize: '0.84rem', color: 'var(--text-secondary)' }}>
                The employer is no longer accepting submissions for this opening. You can archive this job to keep your tracker organized.
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '0.65rem', flexWrap: 'wrap' }}>
            <button
              className="btn-primary"
              onClick={handleDismissAndArchive}
              disabled={resolving}
              style={{
                flex: 2,
                minWidth: '180px',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.45rem',
                padding: '0.65rem 1.25rem',
                fontSize: '0.88rem',
                fontWeight: 600,
                background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                color: '#ffffff',
                border: 'none',
                boxShadow: '0 4px 12px rgba(239, 68, 68, 0.3)',
              }}
              id={`intervention-archive-${interventionId}`}
            >
              {resolving ? 'Archiving…' : 'Dismiss & Archive Job'}
            </button>
            {pageUrl && (
              <button
                className="btn-outline"
                onClick={() => window.open(pageUrl, '_blank', 'noopener,noreferrer')}
                style={{
                  flex: 1,
                  minWidth: '140px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.35rem',
                  padding: '0.65rem 1rem',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  border: '1px solid var(--border-glass)',
                  color: 'var(--text-primary)',
                  background: 'var(--background-card)',
                }}
                id={`intervention-view-page-${interventionId}`}
              >
                <ExternalLink size={14} /> View Posting
              </button>
            )}
            <button
              className="btn-outline"
              onClick={() => resolve('skipped')}
              disabled={resolving}
              style={{
                flex: 1,
                minWidth: '100px',
                padding: '0.65rem 1rem',
                fontSize: '0.85rem',
                fontWeight: 600,
                border: '1px solid var(--border-glass)',
                color: 'var(--text-primary)',
                background: 'var(--background-card)',
              }}
              id={`intervention-dismiss-${interventionId}`}
            >
              Dismiss
            </button>
          </div>
        </>
      ) : isUnsupportedOrFatal ? (
        <>
          <div
            style={{
              fontSize: '0.85rem',
              color: 'var(--text-primary)',
              background: 'rgba(245, 158, 11, 0.08)',
              border: '1px solid rgba(245, 158, 11, 0.25)',
              borderRadius: '8px',
              padding: '0.9rem 1.1rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.65rem',
              lineHeight: 1.5,
            }}
          >
            <div>
              <strong style={{ color: '#fbbf24', display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.88rem', marginBottom: '0.15rem' }}>
                <ArrowRight size={16} /> What to do next
              </strong>
              <span style={{ fontSize: '0.84rem', color: 'var(--text-primary)' }}>
                Click <strong>Open Job & Finish Manually</strong> below to open this application directly in your browser.
              </span>
            </div>

            <div>
              <strong style={{ color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.88rem', marginBottom: '0.15rem' }}>
                <Zap size={16} color="#818cf8" /> What will happen next
              </strong>
              <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                The job application will launch in a new tab so you can complete the application directly. The automated runner will step aside and mark this task as completed.
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '0.65rem', flexWrap: 'wrap' }}>
            <button
              className="btn-primary"
              onClick={handleManualContinue}
              disabled={resolving}
              style={{
                flex: 2,
                minWidth: '200px',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.45rem',
                padding: '0.65rem 1.25rem',
                fontSize: '0.88rem',
                fontWeight: 600,
                background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
                color: '#ffffff',
                border: 'none',
                boxShadow: '0 4px 12px rgba(99, 102, 241, 0.3)',
              }}
              id={`intervention-manual-continue-${interventionId}`}
            >
              {resolving && resolution === 'skipped' ? 'Opening Job…' : <><ExternalLink size={16} color="#ffffff" /> Open Job & Finish Manually</>}
            </button>
            <button
              className="btn-outline"
              onClick={() => resolve('cancelled')}
              disabled={resolving}
              style={{
                flex: 1,
                minWidth: '130px',
                padding: '0.65rem 1rem',
                fontSize: '0.85rem',
                fontWeight: 600,
                border: '1px solid var(--border-glass)',
                color: 'var(--text-primary)',
                background: 'var(--background-card)',
              }}
              id={`intervention-cancel-${interventionId}`}
            >
              {resolving && resolution === 'cancelled' ? '…' : 'Cancel Auto Apply'}
            </button>
          </div>
        </>
      ) : (
        <>
          <div
            style={{
              fontSize: '0.85rem',
              color: 'var(--text-primary)',
              background: 'rgba(99, 102, 241, 0.08)',
              border: '1px solid rgba(99, 102, 241, 0.25)',
              borderRadius: '8px',
              padding: '0.9rem 1.1rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.65rem',
              lineHeight: 1.5,
            }}
          >
            <div>
              <strong style={{ color: '#818cf8', display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.88rem', marginBottom: '0.15rem' }}>
                <ArrowRight size={16} /> What to do next
              </strong>
              <span style={{ fontSize: '0.84rem', color: 'var(--text-primary)' }}>
                {reason === 'login_required'
                  ? 'Enter your desired account email and password below so the AI agent can create or sign into your candidate account.'
                  : showAuthForm 
                  ? 'Fill out your missing authorization details below or complete verification directly on the company site.' 
                  : 'Complete the verification or login directly on the job application page.'}
              </span>
            </div>

            <div>
              <strong style={{ color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.88rem', marginBottom: '0.15rem' }}>
                <Zap size={16} color="#818cf8" /> What will happen next
              </strong>
              <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                Once submitted, click <strong>Create Account & Resume</strong> so the AI agent can automatically fill out and submit your application.
              </span>
            </div>
          </div>

          {(reason === 'login_required' || showAuthForm) && !loadingSettings && (
            <div style={{ background: 'var(--background-card)', borderRadius: '8px', padding: '1rem', border: '1px solid var(--border-glass)', marginTop: '0.5rem' }}>
              <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '0.9rem', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <Key size={16} color="#818cf8" /> {reason === 'login_required' ? 'Candidate Account Credentials' : 'Complete Authorization Settings'}
              </h4>
              <p style={{ margin: '0 0 1rem 0', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                {reason === 'login_required'
                  ? 'Provide the password you would like the AI agent to use to create or log into your candidate account for this job portal.'
                  : 'You are missing required authorization and demographic data. Please fill this out so the AI can answer related application questions. This will be saved to your profile for future applications.'}
              </p>
              
              {reason === 'login_required' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1rem' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                      <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-primary)' }}>Account Email</label>
                      <input
                        type="email"
                        value={settings?.emailAddress || ''}
                        onChange={(e) => handleSettingsChange('emailAddress', e.target.value)}
                        placeholder="e.g. user@example.com"
                        style={{ padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border-glass)', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}
                      />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                      <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-primary)' }}>Account Password</label>
                      <input
                        type="password"
                        value={settings?.defaultAccountPassword || ''}
                        onChange={(e) => handleSettingsChange('defaultAccountPassword', e.target.value)}
                        placeholder="Enter password for portal account"
                        style={{ padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border-glass)', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}
                      />
                    </div>
                  </div>
                  <div style={{ fontSize: '0.73rem', color: 'var(--text-secondary)', background: 'rgba(99, 102, 241, 0.08)', padding: '0.5rem 0.75rem', borderRadius: '6px', border: '1px solid rgba(99, 102, 241, 0.2)' }}>
                    💡 <strong>Password Requirements:</strong> Workday requires 8+ characters including an uppercase letter, lowercase letter, number, and special character (e.g. <code>!</code>, <code>@</code>, <code>#</code>, <code>$</code>, <code>%</code>).
                  </div>
                </div>
              )}

              {showAuthForm && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-primary)' }}>US Work Authorization</label>
                    <select value={settings?.usWorkAuthorization || ''} onChange={(e) => handleSettingsChange('usWorkAuthorization', e.target.value)} style={{ padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border-glass)', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
                        <option value="">Select...</option>
                        <option value="Yes">Yes, I am authorized to work in the US</option>
                        <option value="No">No, I am not authorized</option>
                    </select>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-primary)' }}>Visa Sponsorship</label>
                    <select value={settings?.visaSponsorship || ''} onChange={(e) => handleSettingsChange('visaSponsorship', e.target.value)} style={{ padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border-glass)', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
                        <option value="">Select...</option>
                        <option value="Yes">Yes, I require sponsorship</option>
                        <option value="No">No, I do not require sponsorship</option>
                    </select>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-primary)' }}>Working Remotely From</label>
                    <input type="text" value={settings?.workingRemotelyFrom || ''} onChange={(e) => handleSettingsChange('workingRemotelyFrom', e.target.value)} placeholder="e.g. New York, NY" style={{ padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border-glass)', background: 'var(--bg-primary)', color: 'var(--text-primary)' }} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-primary)' }}>Country</label>
                    <input type="text" value={settings?.country || ''} onChange={(e) => handleSettingsChange('country', e.target.value)} placeholder="e.g. United States" style={{ padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border-glass)', background: 'var(--bg-primary)', color: 'var(--text-primary)' }} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-primary)' }}>Gender</label>
                    <select value={settings?.eeocGender || ''} onChange={(e) => handleSettingsChange('eeocGender', e.target.value)} style={{ padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border-glass)', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
                        <option value="">Select...</option>
                        <option value="Male">Male</option>
                        <option value="Female">Female</option>
                        <option value="Decline">Decline</option>
                    </select>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-primary)' }}>Race/Ethnicity</label>
                    <select value={settings?.eeocRace || ''} onChange={(e) => handleSettingsChange('eeocRace', e.target.value)} style={{ padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border-glass)', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
                        <option value="">Select...</option>
                        <option value="Hispanic or Latino">Hispanic or Latino</option>
                        <option value="White">White</option>
                        <option value="Black or African American">Black or African American</option>
                        <option value="Asian">Asian</option>
                        <option value="Native Hawaiian or Other Pacific Islander">Native Hawaiian or Other Pacific Islander</option>
                        <option value="American Indian or Alaska Native">American Indian or Alaska Native</option>
                        <option value="Two or More Races">Two or More Races</option>
                        <option value="Decline">Decline</option>
                    </select>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-primary)' }}>Veteran Status</label>
                    <select value={settings?.eeocVeteran || ''} onChange={(e) => handleSettingsChange('eeocVeteran', e.target.value)} style={{ padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border-glass)', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
                        <option value="">Select...</option>
                        <option value="Yes">Yes, protected veteran</option>
                        <option value="No">No, not a veteran</option>
                        <option value="Decline">Decline</option>
                    </select>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-primary)' }}>Disability Status</label>
                    <select value={settings?.eeocDisability || ''} onChange={(e) => handleSettingsChange('eeocDisability', e.target.value)} style={{ padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border-glass)', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
                        <option value="">Select...</option>
                        <option value="Yes">Yes</option>
                        <option value="No">No</option>
                        <option value="Decline">Decline</option>
                    </select>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-primary)' }}>Phone Number</label>
                    <input type="tel" value={settings?.phone || ''} onChange={(e) => handleSettingsChange('phone', e.target.value)} placeholder="e.g. +1 (555) 000-0000" style={{ padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border-glass)', background: 'var(--bg-primary)', color: 'var(--text-primary)' }} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-primary)' }}>Street Address</label>
                    <input type="text" value={settings?.streetAddress || ''} onChange={(e) => handleSettingsChange('streetAddress', e.target.value)} placeholder="e.g. 123 Main St, Apt 4B" style={{ padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border-glass)', background: 'var(--bg-primary)', color: 'var(--text-primary)' }} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-primary)' }}>City</label>
                    <input type="text" value={settings?.city || ''} onChange={(e) => {
                      const newCity = e.target.value;
                      handleSettingsChange('city', newCity);
                      const st = settings?.state || '';
                      if (newCity || st) handleSettingsChange('location', [newCity, st].filter(Boolean).join(', '));
                    }} placeholder="e.g. San Francisco" style={{ padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border-glass)', background: 'var(--bg-primary)', color: 'var(--text-primary)' }} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-primary)' }}>State / Province</label>
                    <input type="text" value={settings?.state || ''} onChange={(e) => {
                      const newSt = e.target.value;
                      handleSettingsChange('state', newSt);
                      const ct = settings?.city || '';
                      if (ct || newSt) handleSettingsChange('location', [ct, newSt].filter(Boolean).join(', '));
                    }} placeholder="e.g. CA" style={{ padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border-glass)', background: 'var(--bg-primary)', color: 'var(--text-primary)' }} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-primary)' }}>ZIP / Postal Code</label>
                    <input type="text" value={settings?.postalCode || ''} onChange={(e) => handleSettingsChange('postalCode', e.target.value)} placeholder="e.g. 94105" style={{ padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border-glass)', background: 'var(--bg-primary)', color: 'var(--text-primary)' }} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-primary)' }}>LinkedIn URL</label>
                    <input type="url" value={settings?.linkedinUrl || ''} onChange={(e) => handleSettingsChange('linkedinUrl', e.target.value)} placeholder="e.g. https://linkedin.com/in/username" style={{ padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border-glass)', background: 'var(--bg-primary)', color: 'var(--text-primary)' }} />
                </div>
              </div>
              )}
            </div>
          )}

          <div style={{ display: 'flex', gap: '0.65rem', flexWrap: 'wrap' }}>
            <button
              className="btn-primary"
              onClick={() => resolve('completed')}
              disabled={resolving || (reason === 'login_required' && !settings?.defaultAccountPassword)}
              style={{
                flex: 2,
                minWidth: '160px',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.4rem',
                padding: '0.65rem 1.25rem',
                fontSize: '0.88rem',
                fontWeight: 600,
                background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
                color: '#ffffff',
                border: 'none',
                boxShadow: '0 4px 12px rgba(99, 102, 241, 0.3)',
              }}
              id={`intervention-resolve-${interventionId}`}
            >
              {resolving && resolution === 'completed' ? 'Resuming…' : <><Check size={16} color="#ffffff" /> {reason === 'login_required' ? 'Create Account & Resume' : 'Resume Automation'}</>}
            </button>
            {pageUrl && (
              <button
                className="btn-outline"
                onClick={handleManualContinue}
                disabled={resolving}
                style={{
                  flex: 1,
                  minWidth: '150px',
                  padding: '0.65rem 1rem',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.35rem',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  border: '1px solid var(--border-glass)',
                  color: 'var(--text-primary)',
                  background: 'var(--background-card)',
                }}
                title="Stop automated execution and apply directly in your browser"
                id={`intervention-switch-manual-${interventionId}`}
              >
                {resolving && resolution === 'skipped' ? 'Opening Job…' : <><ExternalLink size={14} /> Finish Manually</>}
              </button>
            )}
            <button
              className="btn-outline"
              onClick={() => resolve('cancelled')}
              disabled={resolving}
              style={{
                flex: 1,
                minWidth: '100px',
                padding: '0.65rem 1rem',
                border: '1px solid rgba(239, 68, 68, 0.35)',
                color: '#f87171',
                background: 'rgba(239, 68, 68, 0.08)',
                fontSize: '0.85rem',
                fontWeight: 600,
              }}
              id={`intervention-cancel-${interventionId}`}
            >
              {resolving && resolution === 'cancelled' ? '…' : 'Cancel'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
