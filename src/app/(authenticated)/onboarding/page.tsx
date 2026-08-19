"use client";

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { 
    Bot, Search, FileText, CheckCircle, ChevronRight, ChevronLeft, 
    Loader2, UploadCloud, Sparkles, Check, ArrowRight
} from 'lucide-react';
import { useSession } from 'next-auth/react';
import CloudResumePicker from '@/components/common/CloudResumePicker';
import JobTitleTypeahead from '@/components/common/JobTitleTypeahead';
import { trackOnboardingStep, trackOnboardingResumeSkip, trackOnboardingComplete } from '@/lib/analytics';

export default function OnboardingPage() {
    const router = useRouter();
    const { update } = useSession();
    const [step, setStep] = useState(1);
    const [loading, setLoading] = useState(false);
    const [isDragging, setIsDragging] = useState(false);
    const [isParsing, setIsParsing] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const keywordInputRef = useRef<HTMLInputElement>(null);
    const backgroundScrapeAbortControllerRef = useRef<AbortController | null>(null);

    useEffect(() => {
        trackOnboardingStep(1, "Target Search");
        keywordInputRef.current?.focus();

        // Load existing draft preferences if user is returning
        fetch('/api/onboarding')
            .then(res => res.json())
            .then(data => {
                if (data.preferences) {
                    setFormData(prev => ({
                        searchKeyword: prev.searchKeyword || data.preferences.searchKeyword || '',
                        searchLocation: prev.searchLocation || data.preferences.searchLocation || '',
                        remoteOnly: prev.remoteOnly || Boolean(data.preferences.remoteOnly),
                        resumeMarkdown: prev.resumeMarkdown || data.preferences.resumeMarkdown || '',
                    }));
                }
            })
            .catch(() => {});
    }, []);
    
    const [formData, setFormData] = useState({
        searchKeyword: '',
        searchLocation: '',
        remoteOnly: false,
        resumeMarkdown: '',
    });
    const [titleError, setTitleError] = useState(false);

    const handleChange = (key: string, value: any) => {
        setFormData(prev => ({ ...prev, [key]: value }));
    };

    const handleNext = () => {
        if (step === 1) {
            if (!formData.searchKeyword.trim()) {
                setTitleError(true);
                keywordInputRef.current?.focus();
                return;
            }
            setTitleError(false);
            trackOnboardingStep(2, "Base Resume");

            // Immediately persist Step 1 search parameters as draft to DB so job title is never lost
            fetch('/api/onboarding', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    searchKeyword: formData.searchKeyword.trim(),
                    searchLocation: formData.searchLocation,
                    remoteOnly: formData.remoteOnly,
                    isDraft: true,
                })
            }).catch((err) => {
                console.warn('[Onboarding] Draft auto-save notice:', err);
            });

            // Abort previous in-flight background scrape if user backtracked and changed search params
            if (backgroundScrapeAbortControllerRef.current) {
                backgroundScrapeAbortControllerRef.current.abort();
            }
            const controller = new AbortController();
            backgroundScrapeAbortControllerRef.current = controller;

            // Mark sync activity in localStorage for dashboard handoff
            try {
                localStorage.setItem('job_agent_onboarding_sync_started', String(Date.now()));
                localStorage.setItem('job_agent_just_completed_job_sync', 'true');
                localStorage.setItem('job_agent_has_completed_job_sync', 'true');
            } catch (e) {}

            // Speculative background scrape + DB pool matching
            fetch('/api/scrape', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    keyword: formData.searchKeyword.trim(),
                    location: formData.searchLocation,
                    remoteOnly: formData.remoteOnly,
                }),
                signal: controller.signal
            }).then(() => {
                console.log('[Onboarding] Speculative background job search finished');
            }).catch((err) => {
                if (err?.name !== 'AbortError') {
                    console.warn('[Onboarding] Speculative background job search notice:', err);
                }
            });

            setStep(2);
        }
    };
    
    const handlePrev = () => {
        setStep(s => Math.max(s - 1, 1));
    };

    const handleFileParse = async (file: File) => {
        setIsParsing(true);
        try {
            const form = new FormData();
            form.append('file', file);
            
            const res = await fetch('/api/parse-resume', {
                method: 'POST',
                body: form
            });
            const data = await res.json();
            if (data.markdown) {
                handleChange('resumeMarkdown', data.markdown);
            } else {
                alert(data.error || 'Failed to parse file.');
            }
        } catch (e) {
            alert('Error parsing file.');
        } finally {
            setIsParsing(false);
        }
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            handleFileParse(e.dataTransfer.files[0]);
        }
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            handleFileParse(e.target.files[0]);
        }
    };

    const handleSubmit = async (skipResume: boolean = false) => {
        if (!formData.searchKeyword.trim()) {
            setStep(1);
            setTitleError(true);
            keywordInputRef.current?.focus();
            return;
        }

        setLoading(true);
        try {
            const hasResume = !skipResume && Boolean(formData.resumeMarkdown.trim());
            const resumeToSend = hasResume ? formData.resumeMarkdown.trim() : '';

            if (skipResume || !hasResume) {
                trackOnboardingResumeSkip();
            }

            const defaultProfile = `# Job Search Goal
Seeking high-growth opportunities as a ${formData.searchKeyword.trim()}.

# Evaluation Criteria Weights
- Compensation: 20%
- Company Fit: 20%
- Remote Flexibility: 15%
- AI Maturity: 10%
- Leadership: 10%
- Growth: 10%
- Culture: 10%
- Tech Stack: 5%`;

            const res = await fetch('/api/onboarding', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...formData,
                    searchKeyword: formData.searchKeyword.trim(),
                    resumeMarkdown: resumeToSend,
                    profile: defaultProfile
                })
            });
            
            if (res.ok) {
                trackOnboardingComplete({
                    has_resume: hasResume,
                    search_keyword: formData.searchKeyword.trim(),
                    search_location: formData.searchLocation,
                    remote_only: formData.remoteOnly,
                });
                await update({ isOnboarded: true });
                try {
                    localStorage.setItem('job_agent_auto_sync_on_mount', 'true');
                } catch (e) {}
                window.location.href = '/dashboard?autoSync=true';
            } else {
                const errorData = await res.json().catch(() => ({}));
                alert(`Failed to save settings: ${errorData.error || 'Please try again.'}`);
            }
        } catch (e: any) {
            alert(`An error occurred: ${e?.message || 'Please try again.'}`);
        } finally {
            setLoading(false);
        }
    };

    const hasResumeUploaded = Boolean(formData.resumeMarkdown.trim());

    return (
        <div style={{ 
            minHeight: '100vh', 
            display: 'flex', 
            flexDirection: 'column', 
            alignItems: 'center', 
            justifyContent: 'center', 
            padding: 'clamp(0.75rem, 3vw, 2rem)', 
            background: 'var(--bg-main)', 
            width: '100%', 
            boxSizing: 'border-box' 
        }}>
            <div className="glass-card animate-fade-in" style={{ 
                width: '100%', 
                maxWidth: '680px', 
                padding: 'clamp(1.25rem, 4vw, 2.25rem)', 
                boxSizing: 'border-box' 
            }}>
                
                {/* 2-Step Progress Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 'clamp(1.25rem, 3vw, 2rem)', position: 'relative', maxWidth: '300px', margin: '0 auto clamp(1.25rem, 3vw, 2rem) auto' }}>
                    <div style={{ position: 'absolute', top: '50%', left: 0, right: 0, height: '2px', background: 'var(--border-glass)', zIndex: 0 }} />
                    <div style={{ position: 'absolute', top: '50%', left: 0, width: `${(step - 1) * 100}%`, height: '2px', background: 'var(--accent-primary)', zIndex: 0, transition: 'width 0.3s ease' }} />
                    
                    {[1, 2].map(i => (
                        <div key={i} style={{ 
                            position: 'relative', zIndex: 1, 
                            width: '38px', height: '38px', borderRadius: '50%', 
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            background: step >= i ? 'var(--accent-primary)' : 'var(--bg-surface)',
                            color: step >= i ? '#fff' : 'var(--text-secondary)',
                            fontWeight: 600,
                            fontSize: '0.9rem',
                            border: `2px solid ${step >= i ? 'var(--accent-primary)' : 'var(--border-glass)'}`,
                            transition: 'all 0.3s ease'
                        }}>
                            {step > i ? <Check size={18} /> : i}
                        </div>
                    ))}
                </div>

                {/* Step 1: Target Search */}
                {step === 1 && (
                    <div className="animate-fade-in" style={{ width: '100%' }}>
                        <h2 style={{ fontSize: 'clamp(1.35rem, 4vw, 1.85rem)', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                            <Search className="text-accent" size={24} style={{ flexShrink: 0 }} />
                            <span>What are you looking for?</span>
                        </h2>
                        <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem', fontSize: '0.95rem' }}>Let's set up your primary job search criteria so the agent knows what to hunt for.</p>
                        
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', width: '100%' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', width: '100%' }}>
                                <label style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                    Target Job Title / Keyword <span style={{ color: '#ef4444', fontWeight: 'bold' }}>*</span>
                                </label>
                                <JobTitleTypeahead 
                                    inputRef={keywordInputRef}
                                    required
                                    value={formData.searchKeyword}
                                    onChange={(val) => {
                                        handleChange('searchKeyword', val);
                                        if (titleError && val.trim()) setTitleError(false);
                                    }}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                            e.preventDefault();
                                            handleNext();
                                        }
                                    }}
                                    placeholder="e.g. Account Manager, Full Stack Engineer"
                                    hasError={titleError}
                                    inputStyle={{ 
                                        width: '100%', 
                                        boxSizing: 'border-box', 
                                        background: 'rgba(0,0,0,0.2)', 
                                        border: `1px solid ${titleError ? '#ef4444' : 'var(--border-glass)'}`, 
                                        color: 'var(--text-primary)', 
                                        padding: '0.85rem 1rem', 
                                        borderRadius: '8px', 
                                        fontSize: '1rem',
                                        outline: titleError ? '1px solid #ef4444' : 'none'
                                    }}
                                />
                                {titleError && (
                                    <span style={{ fontSize: '0.8rem', color: '#ef4444', marginTop: '-0.2rem' }}>
                                        Please enter a target job title to continue.
                                    </span>
                                )}
                            </div>
                            
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', width: '100%' }}>
                                <label style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Enter a location preference</label>
                                <input 
                                    type="text"
                                    value={formData.searchLocation}
                                    onChange={(e) => handleChange('searchLocation', e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                            e.preventDefault();
                                            handleNext();
                                        }
                                    }}
                                    placeholder="Remote, Austin TX, London, etc."
                                    style={{ width: '100%', boxSizing: 'border-box', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)', padding: '0.85rem 1rem', borderRadius: '8px', fontSize: '1rem' }}
                                />
                                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                                    Leave blank to search Remote / Anywhere, or specify a city, state, or region.
                                </span>
                            </div>
                        </div>
                    </div>
                )}

                {/* Step 2: Base Resume */}
                {step === 2 && (
                    <div className="animate-fade-in" style={{ width: '100%' }}>
                        <h2 style={{ fontSize: 'clamp(1.35rem, 4vw, 1.85rem)', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                            <FileText className="text-accent" size={24} style={{ flexShrink: 0 }} />
                            <span>Base Resume (Optional)</span>
                        </h2>
                        <p style={{ color: 'var(--text-secondary)', marginBottom: '1.25rem', fontSize: '0.95rem' }}>
                            Upload your resume now to enable personalized AI opportunity scoring and 1-click tailored applications. You can also skip this and upload it later.
                        </p>
                        
                        <div style={{
                            background: hasResumeUploaded ? 'rgba(16, 185, 129, 0.08)' : 'rgba(99, 102, 241, 0.08)',
                            border: `1px solid ${hasResumeUploaded ? 'rgba(16, 185, 129, 0.3)' : 'rgba(99, 102, 241, 0.25)'}`,
                            borderRadius: '8px',
                            padding: '0.9rem 1rem',
                            marginBottom: '1.25rem',
                            display: 'flex',
                            alignItems: 'flex-start',
                            gap: '0.75rem'
                        }}>
                            <Sparkles className={hasResumeUploaded ? 'text-success' : 'text-accent'} size={20} style={{ flexShrink: 0, marginTop: '2px', color: hasResumeUploaded ? '#10b981' : undefined }} />
                            <div style={{ fontSize: '0.86rem', color: 'var(--text-primary)', lineHeight: 1.45 }}>
                                {hasResumeUploaded ? (
                                    <>
                                        <strong style={{ color: '#10b981' }}>Resume Loaded:</strong> Your resume is ready. The AI will score opportunities and generate custom tailored applications automatically.
                                    </>
                                ) : (
                                    <>
                                        <strong>Instant AI Scoring:</strong> Uploading your resume allows the AI to score incoming jobs against your exact background. Don't have it on hand? Skip now and upload anytime from your dashboard!
                                    </>
                                )}
                            </div>
                        </div>

                        <div 
                            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                            onDragLeave={() => setIsDragging(false)}
                            onDrop={handleDrop}
                            onClick={() => fileInputRef.current?.click()}
                            style={{ 
                                border: `2px dashed ${isDragging ? 'var(--accent-primary)' : hasResumeUploaded ? 'rgba(16, 185, 129, 0.4)' : 'var(--border-glass)'}`, 
                                background: isDragging ? 'rgba(99, 102, 241, 0.1)' : hasResumeUploaded ? 'rgba(16, 185, 129, 0.04)' : 'rgba(0,0,0,0.2)', 
                                padding: 'clamp(1.25rem, 3.5vw, 1.75rem)', 
                                borderRadius: '8px', 
                                textAlign: 'center',
                                cursor: 'pointer',
                                transition: 'all 0.3s ease',
                                marginBottom: '1.25rem',
                                position: 'relative',
                                width: '100%',
                                boxSizing: 'border-box'
                            }}
                        >
                            <input 
                                type="file" 
                                accept=".pdf,.doc,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" 
                                style={{ display: 'none' }} 
                                ref={fileInputRef}
                                onChange={handleFileChange}
                            />
                            {isParsing ? (
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem', color: 'var(--text-secondary)' }}>
                                    <Loader2 className="animate-spin" size={28} />
                                    <span style={{ fontSize: '0.9rem' }}>Parsing resume text...</span>
                                </div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.4rem', color: 'var(--text-secondary)' }}>
                                    <UploadCloud size={28} style={{ color: hasResumeUploaded ? '#10b981' : isDragging ? 'var(--accent-primary)' : 'inherit' }} />
                                    <span style={{ fontWeight: 500, color: 'var(--text-primary)', fontSize: '0.92rem' }}>
                                        {hasResumeUploaded ? 'Replace PDF or Word Doc' : 'Drag & Drop PDF or Word Doc'}
                                    </span>
                                    <span style={{ fontSize: '0.8rem' }}>or click to browse from files</span>
                                </div>
                            )}
                        </div>

                        <CloudResumePicker
                            onParseStart={() => setIsParsing(true)}
                            onParseEnd={() => setIsParsing(false)}
                            onParseSuccess={(markdown) => handleChange('resumeMarkdown', markdown)}
                            onError={(err) => alert(err)}
                        />

                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', margin: '1rem 0' }}>
                            <div style={{ flex: 1, height: '1px', background: 'var(--border-glass)' }} />
                            <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', fontWeight: 500 }}>OR PASTE RESUME TEXT</span>
                            <div style={{ flex: 1, height: '1px', background: 'var(--border-glass)' }} />
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', width: '100%' }}>
                            <textarea 
                                value={formData.resumeMarkdown}
                                onChange={(e) => handleChange('resumeMarkdown', e.target.value)}
                                placeholder="Paste resume text or markdown here..."
                                style={{ 
                                    width: '100%', 
                                    boxSizing: 'border-box', 
                                    background: 'rgba(0,0,0,0.2)', 
                                    border: '1px solid var(--border-glass)', 
                                    color: 'var(--text-primary)', 
                                    padding: '0.85rem 1rem', 
                                    borderRadius: '8px', 
                                    minHeight: '130px', 
                                    resize: 'vertical', 
                                    fontSize: '0.88rem' 
                                }}
                            />
                        </div>
                    </div>
                )}

                {/* Footer Navigation Bar */}
                <div style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'center', 
                    marginTop: 'clamp(1.5rem, 4vw, 2.25rem)', 
                    paddingTop: '1.25rem', 
                    borderTop: '1px solid var(--border-glass)',
                    flexWrap: 'wrap',
                    gap: '0.75rem'
                }}>
                    <div>
                        {step > 1 ? (
                            <button 
                                onClick={handlePrev} 
                                disabled={loading || isParsing}
                                className="btn-outline" 
                                style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.65rem 1rem', fontSize: '0.9rem' }}
                            >
                                <ChevronLeft size={16} /> Back
                            </button>
                        ) : <div />}
                    </div>

                    <div>
                        {step === 1 ? (
                            <button 
                                type="button"
                                onClick={handleNext} 
                                className="btn-primary" 
                                style={{ 
                                    display: 'flex', 
                                    alignItems: 'center', 
                                    gap: '0.5rem', 
                                    padding: '0.65rem 1.25rem'
                                }}
                            >
                                Next <ChevronRight size={18} />
                            </button>
                        ) : (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                                <button 
                                    onClick={() => handleSubmit(true)} 
                                    disabled={loading || isParsing}
                                    className="btn-outline" 
                                    style={{ padding: '0.65rem 1rem', fontSize: '0.88rem', color: 'var(--text-secondary)' }}
                                >
                                    Skip for now & browse
                                </button>

                                <button 
                                    onClick={() => handleSubmit(false)} 
                                    disabled={loading || isParsing}
                                    className="btn-primary" 
                                    style={{ 
                                        display: 'flex', 
                                        alignItems: 'center', 
                                        gap: '0.5rem', 
                                        background: hasResumeUploaded ? '#10b981' : undefined,
                                        padding: '0.65rem 1.25rem' 
                                    }}
                                >
                                    {loading ? <Loader2 size={16} className="animate-spin" /> : hasResumeUploaded ? <Check size={16} /> : <ArrowRight size={16} />}
                                    {loading ? 'Setting up Dashboard...' : hasResumeUploaded ? 'Complete Setup & View Jobs' : 'Continue to Dashboard'}
                                </button>
                            </div>
                        )}
                    </div>
                </div>

            </div>
        </div>
    );
}
