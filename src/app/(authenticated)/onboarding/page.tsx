"use client";

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { 
    Bot, Search, FileText, Target, CheckCircle, CheckCircle2, ChevronRight, ChevronLeft, 
    Loader2, UploadCloud, Star, Sparkles, DollarSign, Clock, TrendingUp, Cpu, Users, 
    Compass, Edit3, Check, X, ArrowUpRight, Flame
} from 'lucide-react';
import { useSession } from 'next-auth/react';
import CloudResumePicker from '@/components/common/CloudResumePicker';
import { trackOnboardingStep, trackOnboardingResumeSkip, trackOnboardingComplete } from '@/lib/analytics';

interface CriteriaItem {
    id: string;
    label: string;
    fullLabel: string;
    desc: string;
    icon: React.ElementType;
}

export default function OnboardingPage() {
    const router = useRouter();
    const { update } = useSession();
    const [step, setStep] = useState(1);
    const [loading, setLoading] = useState(false);
    const [isDragging, setIsDragging] = useState(false);
    const [isParsing, setIsParsing] = useState(false);
    const [isExtractingRubric, setIsExtractingRubric] = useState(false);
    const [isAiSmartRubric, setIsAiSmartRubric] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const backgroundScrapeAbortControllerRef = useRef<AbortController | null>(null);

    // Step 3 Priority Tiers
    const [rubricPhase, setRubricPhase] = useState<1 | 2>(1);
    const [mustHaves, setMustHaves] = useState<string[]>([]);
    const [important, setImportant] = useState<string[]>([]);
    const [niceToHaves, setNiceToHaves] = useState<string[]>([
        'compensation', 'remoteFlexibility', 'growth', 'productFit', 
        'techStack', 'culture', 'leadership', 'aiMaturity'
    ]);

    useEffect(() => {
        trackOnboardingStep(1, "Target Search");
    }, []);
    
    const [formData, setFormData] = useState({
        searchKeyword: '',
        searchLocation: 'Remote',
        remoteOnly: false,
        resumeMarkdown: '',
    });
    const [titleError, setTitleError] = useState(false);
    const [goal, setGoal] = useState('I am looking for high-growth tech opportunities with strong engineering culture.');

    const criteriaList: CriteriaItem[] = [
        { 
            id: 'compensation', 
            label: 'Compensation', 
            fullLabel: 'Compensation & Benefits', 
            desc: 'Salary, bonus, equity & retirement packages', 
            icon: DollarSign 
        },
        { 
            id: 'remoteFlexibility', 
            label: 'Remote Flexibility', 
            fullLabel: 'Remote Flexibility', 
            desc: 'Work-from-home policy & flexible hours', 
            icon: Clock 
        },
        { 
            id: 'growth', 
            label: 'Career Growth', 
            fullLabel: 'Career Growth', 
            desc: 'Promotions, learning budgets & leadership scope', 
            icon: TrendingUp 
        },
        { 
            id: 'productFit', 
            label: 'Company Fit', 
            fullLabel: 'Company Fit', 
            desc: 'Company stability, market demand & domain alignment', 
            icon: Star 
        },
        { 
            id: 'techStack', 
            label: 'Tech Stack', 
            fullLabel: 'Tech Stack', 
            desc: 'Modern frameworks, tooling & developer velocity', 
            icon: Cpu 
        },
        { 
            id: 'culture', 
            label: 'Work Culture', 
            fullLabel: 'Work Culture', 
            desc: 'Work-life balance, diversity & team dynamics', 
            icon: Users 
        },
        { 
            id: 'leadership', 
            label: 'Leadership & Vision', 
            fullLabel: 'Leadership & Vision', 
            desc: 'Executive strength & mentorship quality', 
            icon: Compass 
        },
        { 
            id: 'aiMaturity', 
            label: 'AI Maturity', 
            fullLabel: 'AI Maturity & Tooling', 
            desc: 'Adoption of AI tools & modern infrastructure', 
            icon: Sparkles 
        }
    ];

    const getCriteriaById = (id: string) => {
        return criteriaList.find(c => c.id === id) || {
            id,
            label: id,
            fullLabel: id,
            desc: '',
            icon: Star
        };
    };

    const getCalculatedWeights = () => {
        const points: Record<string, number> = {};
        let totalPoints = 0;

        criteriaList.forEach(c => {
            let p = 1; // Nice-to-Have default = 1 pt
            if (mustHaves.includes(c.id)) {
                p = 5; // Must-Have = 5 pts (25% each when 2 selected)
            } else if (important.includes(c.id)) {
                p = 3; // High Priority = 3 pts (15% each when 2 selected)
            }
            points[c.id] = p;
            totalPoints += p;
        });

        const calculated: Record<string, number> = {};
        criteriaList.forEach(c => {
            calculated[c.id] = Math.round((points[c.id] / (totalPoints || 1)) * 100);
        });
        
        const sum = Object.values(calculated).reduce((a, b) => a + b, 0);
        if (sum !== 100 && Object.keys(calculated).length > 0) {
            const diff = 100 - sum;
            calculated[Object.keys(calculated)[0]] += diff;
        }
        
        return calculated;
    };

    // Manual 2-Phase Selection Handlers
    const handleToggleMustHave = (id: string) => {
        if (mustHaves.includes(id)) {
            setMustHaves(prev => prev.filter(item => item !== id));
        } else {
            let next: string[];
            if (mustHaves.length >= 2) {
                next = [mustHaves[0], id];
            } else {
                next = [...mustHaves, id];
            }
            setMustHaves(next);
            if (important.includes(id)) {
                setImportant(prev => prev.filter(item => item !== id));
            }
            if (next.length === 2) {
                setTimeout(() => {
                    setRubricPhase(2);
                }, 200);
            }
        }
    };

    const handleToggleImportant = (id: string) => {
        if (important.includes(id)) {
            setImportant(prev => prev.filter(item => item !== id));
        } else {
            if (important.length >= 2) {
                setImportant([important[0], id]);
            } else {
                setImportant(prev => [...prev, id]);
            }
        }
    };

    // Smart Rubric Interactive Handlers
    const handleRemoveNonNegotiable = (id: string) => {
        setMustHaves(prev => prev.filter(item => item !== id));
        setNiceToHaves(prev => prev.includes(id) ? prev : [...prev, id]);
    };

    const handleRemoveHighPriority = (id: string) => {
        setImportant(prev => prev.filter(item => item !== id));
        setNiceToHaves(prev => prev.includes(id) ? prev : [...prev, id]);
    };

    const handlePromoteToNonNegotiable = (id: string) => {
        if (mustHaves.length >= 2) return;
        setNiceToHaves(prev => prev.filter(item => item !== id));
        setImportant(prev => prev.filter(item => item !== id));
        setMustHaves(prev => [...prev, id]);
    };

    const handlePromoteToHighPriority = (id: string) => {
        if (important.length >= 2) return;
        setNiceToHaves(prev => prev.filter(item => item !== id));
        setMustHaves(prev => prev.filter(item => item !== id));
        setImportant(prev => [...prev, id]);
    };

    const handleChange = (key: string, value: any) => {
        setFormData({ ...formData, [key]: value });
    };

    const runAiRubricExtraction = async (resumeText: string) => {
        setIsExtractingRubric(true);
        try {
            const res = await fetch('/api/extract-rubric', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    resumeMarkdown: resumeText,
                    searchKeyword: formData.searchKeyword,
                    searchLocation: formData.searchLocation
                })
            });
            const data = await res.json();
            if (data?.success && Array.isArray(data?.mustHaves) && Array.isArray(data?.important)) {
                setMustHaves(data.mustHaves);
                setImportant(data.important);
                setNiceToHaves(data.niceToHaves || criteriaList.map(c => c.id).filter(id => !data.mustHaves.includes(id) && !data.important.includes(id)));
                if (data.goal) {
                    setGoal(data.goal);
                }
                setIsAiSmartRubric(true);
            } else {
                setIsAiSmartRubric(false);
            }
        } catch (err) {
            console.warn('AI Rubric extraction failed, falling back to manual UX:', err);
            setIsAiSmartRubric(false);
        } finally {
            setIsExtractingRubric(false);
        }
    };

    const handleNext = async () => {
        if (step === 2) {
            const hasResume = Boolean(formData.resumeMarkdown.trim());
            if (hasResume) {
                await runAiRubricExtraction(formData.resumeMarkdown);
            } else {
                setIsAiSmartRubric(false);
                trackOnboardingResumeSkip();
            }
            trackOnboardingStep(3, "Scoring Rubric");
            setStep(3);
        } else if (step === 1) {
            if (!formData.searchKeyword.trim()) {
                setTitleError(true);
                return;
            }
            setTitleError(false);
            trackOnboardingStep(2, "Base Resume");

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

            // Speculative background omni-scrape + DB pool matching
            fetch('/api/scrape', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    keyword: formData.searchKeyword,
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
        if (step === 3) {
            if (!isAiSmartRubric && rubricPhase === 2) {
                setRubricPhase(1);
            } else {
                setStep(2);
            }
        } else {
            setStep(s => Math.max(s - 1, 1));
        }
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

    const handleSubmit = async () => {
        setLoading(true);
        try {
            const calculatedWeights = getCalculatedWeights();
            const finalProfile = `# Job Search Goal
${goal}

# Evaluation Criteria Weights
- Compensation: ${calculatedWeights.compensation || 15}%
- Company Fit: ${calculatedWeights.productFit || 15}% (Company business viability and overall role alignment)
- Remote Flexibility: ${calculatedWeights.remoteFlexibility || 15}%
- AI Maturity: ${calculatedWeights.aiMaturity || 10}%
- Leadership: ${calculatedWeights.leadership || 10}%
- Growth: ${calculatedWeights.growth || 15}%
- Culture: ${calculatedWeights.culture || 10}%
- Tech Stack: ${calculatedWeights.techStack || 10}%`;

            const res = await fetch('/api/onboarding', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...formData,
                    profile: finalProfile
                })
            });
            
            if (res.ok) {
                trackOnboardingComplete({
                    has_resume: Boolean(formData.resumeMarkdown.trim()),
                    search_keyword: formData.searchKeyword,
                    search_location: formData.searchLocation,
                    remote_only: formData.remoteOnly,
                    smart_rubric_used: isAiSmartRubric
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

    const phase2AvailableItems = criteriaList.filter(c => !mustHaves.includes(c.id));

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
            <style jsx global>{`
                @keyframes pulseBadge {
                    0%, 100% {
                        opacity: 0.85;
                        transform: scale(1);
                    }
                    50% {
                        opacity: 1;
                        transform: scale(1.03);
                    }
                }
                @keyframes fadeSlideUp {
                    from {
                        opacity: 0;
                        transform: translateY(8px);
                    }
                    to {
                        opacity: 1;
                        transform: translateY(0);
                    }
                }
                .rubric-card {
                    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
                    cursor: pointer;
                    user-select: none;
                }
                .rubric-card:hover {
                    transform: translateY(-2px);
                }
                .smart-chip {
                    transition: all 0.2s ease;
                }
                .smart-chip:hover {
                    border-color: rgba(255, 255, 255, 0.3);
                }
                .animate-rubric-enter {
                    animation: fadeSlideUp 0.25s ease-out forwards;
                }
            `}</style>

            <div className="glass-card animate-fade-in" style={{ 
                width: '100%', 
                maxWidth: '740px', 
                padding: 'clamp(1.25rem, 4vw, 2.25rem)', 
                boxSizing: 'border-box' 
            }}>
                
                {/* Progress Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 'clamp(1.25rem, 3vw, 2rem)', position: 'relative' }}>
                    <div style={{ position: 'absolute', top: '50%', left: 0, right: 0, height: '2px', background: 'var(--border-glass)', zIndex: 0 }} />
                    <div style={{ position: 'absolute', top: '50%', left: 0, width: `${(step - 1) * 50}%`, height: '2px', background: 'var(--accent-primary)', zIndex: 0, transition: 'width 0.3s ease' }} />
                    
                    {[1, 2, 3].map(i => (
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
                            {step > i ? <CheckCircle size={18} /> : i}
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
                                <input 
                                    type="text"
                                    value={formData.searchKeyword}
                                    onChange={(e) => {
                                        handleChange('searchKeyword', e.target.value);
                                        if (titleError && e.target.value.trim()) setTitleError(false);
                                    }}
                                    placeholder="e.g. Senior Software Engineer, Product Manager"
                                    style={{ 
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
                                    placeholder='e.g. "Remote", "Austin, TX", "United Kingdom"'
                                    style={{ width: '100%', boxSizing: 'border-box', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)', padding: '0.85rem 1rem', borderRadius: '8px', fontSize: '1rem' }}
                                />
                                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                                    Examples: "Remote", a specific city ("Austin, TX"), a state/country ("United Kingdom"), or a region ("EMEA").
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
                            <span>Base Resume</span>
                        </h2>
                        <p style={{ color: 'var(--text-secondary)', marginBottom: '1.25rem', fontSize: '0.95rem' }}>Upload a PDF/Word doc or paste your resume. The AI will automatically tailor your scoring priorities based on your background.</p>
                        
                        <div style={{
                            background: 'rgba(99, 102, 241, 0.1)',
                            border: '1px solid rgba(99, 102, 241, 0.3)',
                            borderRadius: '8px',
                            padding: '1rem',
                            marginBottom: '1.5rem',
                            display: 'flex',
                            alignItems: 'flex-start',
                            gap: '0.75rem'
                        }}>
                            <Sparkles className="text-accent" size={20} style={{ flexShrink: 0, marginTop: '2px' }} />
                            <div style={{ fontSize: '0.88rem', color: 'var(--text-primary)', lineHeight: 1.5 }}>
                                <strong>Instant AI Priority Matching:</strong> Uploading your resume allows the AI to automatically analyze your experience, level, and preferences to recommend your priority rubric!
                                <span style={{ display: 'block', marginTop: '0.25rem', color: 'var(--text-secondary)', fontSize: '0.82rem' }}>
                                    Don't have your resume ready? You can skip this step and configure your priorities manually.
                                </span>
                            </div>
                        </div>

                        <div 
                            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                            onDragLeave={() => setIsDragging(false)}
                            onDrop={handleDrop}
                            onClick={() => fileInputRef.current?.click()}
                            style={{ 
                                border: `2px dashed ${isDragging ? 'var(--accent-primary)' : 'var(--border-glass)'}`, 
                                background: isDragging ? 'rgba(99, 102, 241, 0.1)' : 'rgba(0,0,0,0.2)', 
                                padding: 'clamp(1.25rem, 4vw, 2rem)', 
                                borderRadius: '8px', 
                                textAlign: 'center',
                                cursor: 'pointer',
                                transition: 'all 0.3s ease',
                                marginBottom: '1.5rem',
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
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem', color: 'var(--text-secondary)' }}>
                                    <Loader2 className="animate-spin" size={32} />
                                    <span>Parsing with AI...</span>
                                </div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem', color: 'var(--text-secondary)' }}>
                                    <UploadCloud size={32} style={{ color: isDragging ? 'var(--accent-primary)' : 'inherit' }} />
                                    <span style={{ fontWeight: 500, color: 'var(--text-primary)' }}>Drag & Drop PDF or Word Doc</span>
                                    <span style={{ fontSize: '0.85rem' }}>or click to browse</span>
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
                            <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', fontWeight: 500 }}>OR PASTE TEXT</span>
                            <div style={{ flex: 1, height: '1px', background: 'var(--border-glass)' }} />
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', width: '100%' }}>
                            <textarea 
                                value={formData.resumeMarkdown}
                                onChange={(e) => handleChange('resumeMarkdown', e.target.value)}
                                placeholder="Paste your resume here (Markdown, plain text, or rich text)..."
                                style={{ width: '100%', boxSizing: 'border-box', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)', padding: '1rem', borderRadius: '8px', minHeight: '220px', resize: 'vertical', fontSize: '0.9rem' }}
                            />
                        </div>
                    </div>
                )}

                {/* Step 3: AI Scoring Rubric */}
                {step === 3 && (
                    <div className="animate-fade-in" style={{ width: '100%' }}>
                        
                        {/* Loading State during AI priority extrapolation */}
                        {isExtractingRubric ? (
                            <div style={{ 
                                padding: '3.5rem 1.5rem', 
                                textAlign: 'center', 
                                display: 'flex', 
                                flexDirection: 'column', 
                                alignItems: 'center', 
                                justifyContent: 'center',
                                gap: '1.25rem' 
                            }}>
                                <div style={{
                                    width: '56px',
                                    height: '56px',
                                    borderRadius: '50%',
                                    background: 'rgba(99, 102, 241, 0.15)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    color: 'var(--accent-primary)'
                                }}>
                                    <Sparkles size={30} className="animate-spin" />
                                </div>
                                <div>
                                    <h3 style={{ fontSize: '1.25rem', fontWeight: 600, margin: '0 0 0.5rem 0' }}>
                                        Analyzing Your Resume with AI...
                                    </h3>
                                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', maxWidth: '420px', margin: '0 auto', lineHeight: 1.5 }}>
                                        Matching your career level, work preferences, and background to recommend your top priorities.
                                    </p>
                                </div>
                            </div>
                        ) : isAiSmartRubric ? (
                            /* SMART RUBRIC VIEW (Resume Uploaded) */
                            <div className="animate-rubric-enter" style={{ width: '100%' }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                                    <h2 style={{ fontSize: 'clamp(1.3rem, 3.5vw, 1.7rem)', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        <Sparkles className="text-accent" size={22} />
                                        <span>AI-Matched Priorities</span>
                                    </h2>
                                    <span style={{
                                        background: 'rgba(16, 185, 129, 0.12)',
                                        color: '#10b981',
                                        fontSize: '0.75rem',
                                        fontWeight: 600,
                                        padding: '0.2rem 0.65rem',
                                        borderRadius: '20px',
                                        border: '1px solid rgba(16, 185, 129, 0.3)',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '0.3rem'
                                    }}>
                                        <CheckCircle2 size={13} /> Matched from Resume
                                    </span>
                                </div>
                                <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem', fontSize: '0.9rem', lineHeight: 1.4 }}>
                                    Based on your background and career experience, the AI recommended these priorities. Use the <strong>X</strong> and promotion buttons to customize anytime.
                                </p>

                                {/* 1. Non-Negotiables Section */}
                                <div style={{ 
                                    background: 'rgba(16, 185, 129, 0.04)', 
                                    border: '1px solid rgba(16, 185, 129, 0.25)', 
                                    borderRadius: '12px', 
                                    padding: '1rem', 
                                    marginBottom: '1rem' 
                                }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                            <Flame size={18} style={{ color: '#10b981' }} />
                                            <span style={{ fontWeight: 600, fontSize: '0.92rem', color: 'var(--text-primary)' }}>
                                                Non-Negotiables
                                            </span>
                                            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                                                ({mustHaves.length} / 2)
                                            </span>
                                        </div>
                                        <span style={{ fontSize: '0.72rem', color: '#10b981', fontWeight: 600, background: 'rgba(16, 185, 129, 0.12)', padding: '0.15rem 0.5rem', borderRadius: '4px' }}>
                                            25% Weight Each
                                        </span>
                                    </div>

                                    <div style={{ display: 'flex', gap: '0.65rem', flexWrap: 'wrap', minHeight: '44px', alignItems: 'center' }}>
                                        {mustHaves.length === 0 ? (
                                            <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                                                No non-negotiables selected. Add from Nice to Have below.
                                            </span>
                                        ) : (
                                            mustHaves.map(id => {
                                                const c = getCriteriaById(id);
                                                const IconComp = c.icon;
                                                return (
                                                    <div 
                                                        key={id}
                                                        className="smart-chip"
                                                        style={{
                                                            display: 'inline-flex',
                                                            alignItems: 'center',
                                                            gap: '0.5rem',
                                                            background: 'rgba(16, 185, 129, 0.15)',
                                                            border: '1px solid rgba(16, 185, 129, 0.4)',
                                                            color: 'var(--text-primary)',
                                                            padding: '0.45rem 0.95rem',
                                                            borderRadius: '20px',
                                                            fontSize: '0.88rem',
                                                            fontWeight: 600
                                                        }}
                                                    >
                                                        <IconComp size={16} style={{ color: '#10b981' }} />
                                                        <span>{c.label}</span>
                                                        <button 
                                                            type="button"
                                                            onClick={() => handleRemoveNonNegotiable(id)}
                                                            title="Move to Nice to Have"
                                                            style={{
                                                                background: 'rgba(0, 0, 0, 0.2)',
                                                                border: 'none',
                                                                borderRadius: '50%',
                                                                width: '18px',
                                                                height: '18px',
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                justifyContent: 'center',
                                                                cursor: 'pointer',
                                                                color: 'var(--text-secondary)',
                                                                marginLeft: '0.2rem'
                                                            }}
                                                        >
                                                            <X size={12} />
                                                        </button>
                                                    </div>
                                                );
                                            })
                                        )}
                                    </div>
                                </div>

                                {/* 2. High Priorities Section */}
                                <div style={{ 
                                    background: 'rgba(245, 158, 11, 0.04)', 
                                    border: '1px solid rgba(245, 158, 11, 0.25)', 
                                    borderRadius: '12px', 
                                    padding: '1rem', 
                                    marginBottom: '1rem' 
                                }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                            <Star size={18} style={{ color: '#f59e0b' }} />
                                            <span style={{ fontWeight: 600, fontSize: '0.92rem', color: 'var(--text-primary)' }}>
                                                High Priorities
                                            </span>
                                            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                                                ({important.length} / 2)
                                            </span>
                                        </div>
                                        <span style={{ fontSize: '0.72rem', color: '#f59e0b', fontWeight: 600, background: 'rgba(245, 158, 11, 0.12)', padding: '0.15rem 0.5rem', borderRadius: '4px' }}>
                                            15% Weight Each
                                        </span>
                                    </div>

                                    <div style={{ display: 'flex', gap: '0.65rem', flexWrap: 'wrap', minHeight: '44px', alignItems: 'center' }}>
                                        {important.length === 0 ? (
                                            <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                                                No high priorities selected. Add from Nice to Have below.
                                            </span>
                                        ) : (
                                            important.map(id => {
                                                const c = getCriteriaById(id);
                                                const IconComp = c.icon;
                                                return (
                                                    <div 
                                                        key={id}
                                                        className="smart-chip"
                                                        style={{
                                                            display: 'inline-flex',
                                                            alignItems: 'center',
                                                            gap: '0.5rem',
                                                            background: 'rgba(245, 158, 11, 0.15)',
                                                            border: '1px solid rgba(245, 158, 11, 0.4)',
                                                            color: 'var(--text-primary)',
                                                            padding: '0.45rem 0.95rem',
                                                            borderRadius: '20px',
                                                            fontSize: '0.88rem',
                                                            fontWeight: 600
                                                        }}
                                                    >
                                                        <IconComp size={16} style={{ color: '#f59e0b' }} />
                                                        <span>{c.label}</span>
                                                        <button 
                                                            type="button"
                                                            onClick={() => handleRemoveHighPriority(id)}
                                                            title="Move to Nice to Have"
                                                            style={{
                                                                background: 'rgba(0, 0, 0, 0.2)',
                                                                border: 'none',
                                                                borderRadius: '50%',
                                                                width: '18px',
                                                                height: '18px',
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                justifyContent: 'center',
                                                                cursor: 'pointer',
                                                                color: 'var(--text-secondary)',
                                                                marginLeft: '0.2rem'
                                                            }}
                                                        >
                                                            <X size={12} />
                                                        </button>
                                                    </div>
                                                );
                                            })
                                        )}
                                    </div>
                                </div>

                                {/* 3. Nice to Have Section */}
                                <div style={{ 
                                    background: 'rgba(255, 255, 255, 0.02)', 
                                    border: '1px solid var(--border-glass)', 
                                    borderRadius: '12px', 
                                    padding: '1rem', 
                                    marginBottom: '1.25rem' 
                                }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                            <Sparkles size={18} style={{ color: 'var(--text-secondary)' }} />
                                            <span style={{ fontWeight: 600, fontSize: '0.92rem', color: 'var(--text-primary)' }}>
                                                Nice to Have
                                            </span>
                                            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                                                ({niceToHaves.length} items)
                                            </span>
                                        </div>
                                        <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
                                            5% Weight Each
                                        </span>
                                    </div>

                                    <div style={{ display: 'flex', gap: '0.65rem', flexWrap: 'wrap', alignItems: 'center' }}>
                                        {niceToHaves.map(id => {
                                            const c = getCriteriaById(id);
                                            const IconComp = c.icon;
                                            const canPromoteMustHave = mustHaves.length < 2;
                                            const canPromoteHighPriority = important.length < 2;
                                            const showPromotionButtons = niceToHaves.length > 4 || canPromoteMustHave || canPromoteHighPriority;

                                            return (
                                                <div 
                                                    key={id}
                                                    className="smart-chip"
                                                    style={{
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        gap: '0.5rem',
                                                        background: 'rgba(255, 255, 255, 0.04)',
                                                        border: '1px solid var(--border-glass)',
                                                        color: 'var(--text-secondary)',
                                                        padding: showPromotionButtons ? '0.35rem 0.75rem' : '0.45rem 0.95rem',
                                                        borderRadius: '20px',
                                                        fontSize: '0.85rem',
                                                        fontWeight: 500
                                                    }}
                                                >
                                                    <IconComp size={15} />
                                                    <span>{c.label}</span>

                                                    {/* Promotion Buttons when slots are open (> 4 in nice-to-have or vacancies) */}
                                                    {showPromotionButtons && (
                                                        <div style={{ display: 'flex', gap: '0.3rem', marginLeft: '0.25rem' }}>
                                                            {canPromoteMustHave && (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handlePromoteToNonNegotiable(id)}
                                                                    style={{
                                                                        background: 'rgba(16, 185, 129, 0.2)',
                                                                        border: '1px solid rgba(16, 185, 129, 0.4)',
                                                                        color: '#10b981',
                                                                        fontSize: '0.68rem',
                                                                        fontWeight: 700,
                                                                        padding: '0.15rem 0.5rem',
                                                                        borderRadius: '12px',
                                                                        cursor: 'pointer',
                                                                        display: 'flex',
                                                                        alignItems: 'center',
                                                                        gap: '0.15rem'
                                                                    }}
                                                                    title="Promote to Non-Negotiable"
                                                                >
                                                                    + Non-Negotiable
                                                                </button>
                                                            )}
                                                            {canPromoteHighPriority && (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handlePromoteToHighPriority(id)}
                                                                    style={{
                                                                        background: 'rgba(245, 158, 11, 0.2)',
                                                                        border: '1px solid rgba(245, 158, 11, 0.4)',
                                                                        color: '#f59e0b',
                                                                        fontSize: '0.68rem',
                                                                        fontWeight: 700,
                                                                        padding: '0.15rem 0.5rem',
                                                                        borderRadius: '12px',
                                                                        cursor: 'pointer',
                                                                        display: 'flex',
                                                                        alignItems: 'center',
                                                                        gap: '0.15rem'
                                                                    }}
                                                                    title="Promote to High Priority"
                                                                >
                                                                    + High Priority
                                                                </button>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>

                                {/* Tailored Overall Search Goal */}
                                <div style={{ 
                                    marginTop: '1.25rem', 
                                    paddingTop: '1rem', 
                                    borderTop: '1px solid var(--border-glass)',
                                    width: '100%' 
                                }}>
                                    <label style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--text-primary)', display: 'block', marginBottom: '0.4rem' }}>
                                        Personalized Job Search Goal
                                    </label>
                                    <textarea 
                                        value={goal}
                                        onChange={(e) => setGoal(e.target.value)}
                                        placeholder="Example: I am looking for high-growth tech opportunities with strong engineering culture..."
                                        style={{ 
                                            width: '100%', 
                                            boxSizing: 'border-box', 
                                            background: 'rgba(0,0,0,0.2)', 
                                            border: '1px solid var(--border-glass)', 
                                            color: 'var(--text-primary)', 
                                            padding: '0.75rem 1rem', 
                                            borderRadius: '8px', 
                                            minHeight: '65px', 
                                            resize: 'vertical', 
                                            fontSize: '0.88rem' 
                                        }}
                                    />
                                </div>

                            </div>
                        ) : (
                            /* MANUAL 2-PHASE TAP VIEW (When No Resume Uploaded) */
                            <div className="animate-rubric-enter" style={{ width: '100%' }}>
                                
                                {/* Pinned Mini-Summary Bar in Phase 2 */}
                                {rubricPhase === 2 && (
                                    <div 
                                        onClick={() => setRubricPhase(1)}
                                        role="button"
                                        tabIndex={0}
                                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setRubricPhase(1); }}
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'space-between',
                                            padding: '0.65rem 1rem',
                                            borderRadius: '10px',
                                            background: 'rgba(16, 185, 129, 0.08)',
                                            border: '1px solid rgba(16, 185, 129, 0.3)',
                                            cursor: 'pointer',
                                            marginBottom: '1.25rem',
                                            transition: 'all 0.2s ease',
                                            width: '100%',
                                            boxSizing: 'border-box'
                                        }}
                                        title="Click to edit Non-Negotiables"
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                                            <span style={{ 
                                                display: 'inline-flex', 
                                                alignItems: 'center', 
                                                gap: '0.35rem', 
                                                color: '#10b981', 
                                                fontWeight: 600, 
                                                fontSize: '0.85rem' 
                                            }}>
                                                <CheckCircle2 size={16} /> Non-Negotiables:
                                            </span>
                                            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                                                {mustHaves.map(id => {
                                                    const item = criteriaList.find(c => c.id === id);
                                                    return (
                                                        <span key={id} style={{
                                                            background: 'rgba(16, 185, 129, 0.15)',
                                                            color: 'var(--text-primary)',
                                                            fontSize: '0.8rem',
                                                            fontWeight: 600,
                                                            padding: '0.2rem 0.7rem',
                                                            borderRadius: '20px',
                                                            border: '1px solid rgba(16, 185, 129, 0.25)'
                                                        }}>
                                                            {item?.label || id}
                                                        </span>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                        <span style={{
                                            color: '#10b981',
                                            fontSize: '0.8rem',
                                            fontWeight: 600,
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '0.25rem',
                                            flexShrink: 0
                                        }}>
                                            <Edit3 size={13} /> Edit
                                        </span>
                                    </div>
                                )}

                                {/* Phase 1: Non-Negotiables */}
                                {rubricPhase === 1 && (
                                    <div>
                                        <h2 style={{ fontSize: 'clamp(1.35rem, 4vw, 1.75rem)', marginBottom: '0.35rem', display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                                            <Target className="text-accent" size={24} style={{ flexShrink: 0 }} />
                                            <span>Select 2 Non-Negotiables</span>
                                        </h2>
                                        <p style={{ color: 'var(--text-secondary)', marginBottom: '1.25rem', fontSize: '0.92rem' }}>
                                            What 2 things must a job have for you to even consider it?
                                        </p>

                                        <div style={{ 
                                            display: 'grid', 
                                            gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', 
                                            gap: '0.85rem', 
                                            width: '100%',
                                            marginBottom: '1.25rem'
                                        }}>
                                            {criteriaList.map(c => {
                                                const isSelected = mustHaves.includes(c.id);
                                                const IconComp = c.icon;
                                                return (
                                                    <div 
                                                        key={c.id}
                                                        onClick={() => handleToggleMustHave(c.id)}
                                                        className="rubric-card"
                                                        style={{
                                                            position: 'relative',
                                                            display: 'flex',
                                                            flexDirection: 'column',
                                                            alignItems: 'center',
                                                            justifyContent: 'center',
                                                            textAlign: 'center',
                                                            padding: '1.25rem 0.75rem',
                                                            borderRadius: '12px',
                                                            border: isSelected 
                                                                ? '2px solid #10b981' 
                                                                : '1px solid var(--border-glass)',
                                                            background: isSelected 
                                                                ? 'rgba(16, 185, 129, 0.08)' 
                                                                : 'rgba(255, 255, 255, 0.03)',
                                                            boxShadow: isSelected 
                                                                ? '0 6px 20px rgba(16, 185, 129, 0.18)' 
                                                                : 'none',
                                                            minHeight: '115px',
                                                            boxSizing: 'border-box'
                                                        }}
                                                    >
                                                        {isSelected && (
                                                            <div style={{
                                                                position: 'absolute',
                                                                top: '8px',
                                                                right: '8px',
                                                                width: '20px',
                                                                height: '20px',
                                                                borderRadius: '50%',
                                                                background: '#10b981',
                                                                color: '#ffffff',
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                justifyContent: 'center',
                                                                boxShadow: '0 2px 6px rgba(16, 185, 129, 0.4)'
                                                            }}>
                                                                <Check size={13} strokeWidth={3} />
                                                            </div>
                                                        )}

                                                        <div style={{
                                                            width: '42px',
                                                            height: '42px',
                                                            borderRadius: '10px',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            justifyContent: 'center',
                                                            marginBottom: '0.6rem',
                                                            background: isSelected ? 'rgba(16, 185, 129, 0.15)' : 'rgba(255, 255, 255, 0.06)',
                                                            color: isSelected ? '#10b981' : 'var(--text-primary)',
                                                            transition: 'all 0.2s ease'
                                                        }}>
                                                            <IconComp size={22} />
                                                        </div>

                                                        <span style={{ 
                                                            fontWeight: 600, 
                                                            fontSize: '0.88rem', 
                                                            color: isSelected ? 'var(--text-primary)' : 'var(--text-secondary)',
                                                            lineHeight: 1.2
                                                        }}>
                                                            {c.label}
                                                        </span>
                                                    </div>
                                                );
                                            })}
                                        </div>

                                        <div style={{ 
                                            display: 'flex', 
                                            justifyContent: 'center', 
                                            alignItems: 'center', 
                                            gap: '0.35rem', 
                                            color: 'var(--text-secondary)', 
                                            fontSize: '0.9rem', 
                                            fontWeight: 600,
                                            marginBottom: '1rem'
                                        }}>
                                            <span style={{ color: mustHaves.length === 2 ? '#10b981' : 'var(--text-primary)', fontSize: '1rem' }}>
                                                {mustHaves.length}
                                            </span>
                                            <span>/</span>
                                            <span>2</span>
                                        </div>
                                    </div>
                                )}

                                {/* Phase 2: High Priorities */}
                                {rubricPhase === 2 && (
                                    <div>
                                        <h2 style={{ fontSize: 'clamp(1.35rem, 4vw, 1.75rem)', marginBottom: '0.35rem', display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                                            <Star className="text-accent" size={24} style={{ flexShrink: 0 }} />
                                            <span>Select 2 High Priorities</span>
                                        </h2>
                                        <p style={{ color: 'var(--text-secondary)', marginBottom: '1.25rem', fontSize: '0.92rem' }}>
                                            Great! Now pick 2 things that are important to you, but not dealbreakers.
                                        </p>

                                        <div style={{ 
                                            display: 'grid', 
                                            gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', 
                                            gap: '0.85rem', 
                                            width: '100%',
                                            marginBottom: '1.25rem'
                                        }}>
                                            {phase2AvailableItems.map(c => {
                                                const isSelected = important.includes(c.id);
                                                const isNiceToHave = important.length === 2 && !isSelected;
                                                const IconComp = c.icon;
                                                return (
                                                    <div 
                                                        key={c.id}
                                                        onClick={() => handleToggleImportant(c.id)}
                                                        className="rubric-card"
                                                        style={{
                                                            position: 'relative',
                                                            display: 'flex',
                                                            flexDirection: 'column',
                                                            alignItems: 'center',
                                                            justifyContent: 'center',
                                                            textAlign: 'center',
                                                            padding: '1.25rem 0.75rem',
                                                            borderRadius: '12px',
                                                            border: isSelected 
                                                                ? '2px solid #10b981' 
                                                                : isNiceToHave 
                                                                    ? '1px dashed rgba(99, 102, 241, 0.4)' 
                                                                    : '1px solid var(--border-glass)',
                                                            background: isSelected 
                                                                ? 'rgba(16, 185, 129, 0.08)' 
                                                                : isNiceToHave 
                                                                    ? 'rgba(99, 102, 241, 0.04)' 
                                                                    : 'rgba(255, 255, 255, 0.03)',
                                                            boxShadow: isSelected 
                                                                ? '0 6px 20px rgba(16, 185, 129, 0.18)' 
                                                                : 'none',
                                                            minHeight: '115px',
                                                            boxSizing: 'border-box'
                                                        }}
                                                    >
                                                        {isSelected && (
                                                            <div style={{
                                                                position: 'absolute',
                                                                top: '8px',
                                                                right: '8px',
                                                                width: '20px',
                                                                height: '20px',
                                                                borderRadius: '50%',
                                                                background: '#10b981',
                                                                color: '#ffffff',
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                justifyContent: 'center',
                                                                boxShadow: '0 2px 6px rgba(16, 185, 129, 0.4)'
                                                            }}>
                                                                <Check size={13} strokeWidth={3} />
                                                            </div>
                                                        )}

                                                        {isNiceToHave && (
                                                            <div style={{
                                                                position: 'absolute',
                                                                top: '6px',
                                                                right: '6px',
                                                                background: 'rgba(99, 102, 241, 0.15)',
                                                                color: '#818cf8',
                                                                fontSize: '0.62rem',
                                                                fontWeight: 700,
                                                                padding: '0.15rem 0.4rem',
                                                                borderRadius: '4px',
                                                                border: '1px solid rgba(99, 102, 241, 0.3)',
                                                                animation: 'pulseBadge 2.5s infinite ease-in-out'
                                                            }}>
                                                                Nice-to-Have
                                                            </div>
                                                        )}

                                                        <div style={{
                                                            width: '42px',
                                                            height: '42px',
                                                            borderRadius: '10px',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            justifyContent: 'center',
                                                            marginBottom: '0.6rem',
                                                            background: isSelected 
                                                                ? 'rgba(16, 185, 129, 0.15)' 
                                                                : isNiceToHave 
                                                                    ? 'rgba(99, 102, 241, 0.08)' 
                                                                    : 'rgba(255, 255, 255, 0.06)',
                                                            color: isSelected 
                                                                ? '#10b981' 
                                                                : isNiceToHave 
                                                                    ? '#818cf8' 
                                                                    : 'var(--text-primary)',
                                                            transition: 'all 0.2s ease'
                                                        }}>
                                                            <IconComp size={22} />
                                                        </div>

                                                        <span style={{ 
                                                            fontWeight: 600, 
                                                            fontSize: '0.88rem', 
                                                            color: isSelected ? 'var(--text-primary)' : 'var(--text-secondary)',
                                                            lineHeight: 1.2
                                                        }}>
                                                            {c.label}
                                                        </span>
                                                    </div>
                                                );
                                            })}
                                        </div>

                                        <div style={{ 
                                            display: 'flex', 
                                            justifyContent: 'center', 
                                            alignItems: 'center', 
                                            gap: '0.35rem', 
                                            color: 'var(--text-secondary)', 
                                            fontSize: '0.9rem', 
                                            fontWeight: 600,
                                            marginBottom: '0.5rem'
                                        }}>
                                            <span style={{ color: important.length === 2 ? '#10b981' : 'var(--text-primary)', fontSize: '1rem' }}>
                                                {important.length}
                                            </span>
                                            <span>/</span>
                                            <span>2</span>
                                        </div>

                                        <p style={{ 
                                            textAlign: 'center', 
                                            color: 'var(--text-secondary)', 
                                            fontSize: '0.82rem', 
                                            margin: '0.5rem 0 1rem 0',
                                            lineHeight: 1.4
                                        }}>
                                            The rest will be set as Nice-to-Haves (you can change these anytime in Settings).
                                        </p>
                                    </div>
                                )}

                                {/* Manual Mode Search Goal Textarea */}
                                <div style={{ 
                                    marginTop: '1.25rem', 
                                    paddingTop: '1rem', 
                                    borderTop: '1px solid var(--border-glass)',
                                    width: '100%' 
                                }}>
                                    <label style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--text-primary)', display: 'block', marginBottom: '0.4rem' }}>
                                        Overall Job Search Goal
                                    </label>
                                    <textarea 
                                        value={goal}
                                        onChange={(e) => setGoal(e.target.value)}
                                        placeholder="Example: I am looking for high-growth tech opportunities with strong engineering culture..."
                                        style={{ 
                                            width: '100%', 
                                            boxSizing: 'border-box', 
                                            background: 'rgba(0,0,0,0.2)', 
                                            border: '1px solid var(--border-glass)', 
                                            color: 'var(--text-primary)', 
                                            padding: '0.75rem 1rem', 
                                            borderRadius: '8px', 
                                            minHeight: '65px', 
                                            resize: 'vertical', 
                                            fontSize: '0.88rem' 
                                        }}
                                    />
                                </div>

                            </div>
                        )}

                    </div>
                )}

                {/* Footer Controls */}
                <div style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'center', 
                    marginTop: 'clamp(1.25rem, 3vw, 2rem)', 
                    paddingTop: '1.25rem', 
                    borderTop: '1px solid var(--border-glass)', 
                    width: '100%' 
                }}>
                    <button 
                        onClick={handlePrev} 
                        disabled={step === 1 || loading || isExtractingRubric}
                        className="btn-outline" 
                        style={{ 
                            display: 'flex', 
                            alignItems: 'center', 
                            gap: '0.5rem', 
                            opacity: step === 1 ? 0 : 1, 
                            pointerEvents: step === 1 ? 'none' : 'auto', 
                            padding: '0.65rem 1.15rem' 
                        }}
                    >
                        <ChevronLeft size={18} /> Back
                    </button>
                    
                    {step < 3 ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            {step === 2 && (
                                <button 
                                    onClick={handleNext} 
                                    disabled={isExtractingRubric}
                                    className="btn-outline" 
                                    style={{ padding: '0.65rem 1.15rem', fontSize: '0.9rem' }}
                                >
                                    Skip for now
                                </button>
                            )}
                            <button 
                                onClick={handleNext} 
                                disabled={isExtractingRubric || isParsing || (step === 1 && !formData.searchKeyword.trim())}
                                className="btn-primary" 
                                style={{ 
                                    display: 'flex', 
                                    alignItems: 'center', 
                                    gap: '0.5rem', 
                                    padding: '0.65rem 1.25rem',
                                    opacity: (step === 1 && !formData.searchKeyword.trim()) ? 0.6 : 1,
                                    cursor: (step === 1 && !formData.searchKeyword.trim()) ? 'not-allowed' : 'pointer'
                                }}
                            >
                                {isExtractingRubric ? (
                                    <>
                                        <Loader2 size={16} className="animate-spin" /> Matching Priorities...
                                    </>
                                ) : (
                                    <>
                                        Next <ChevronRight size={18} />
                                    </>
                                )}
                            </button>
                        </div>
                    ) : (
                        <div>
                            {isAiSmartRubric ? (
                                <button 
                                    onClick={handleSubmit} 
                                    disabled={loading || mustHaves.length !== 2 || important.length !== 2}
                                    className="btn-primary" 
                                    style={{ 
                                        display: 'flex', 
                                        alignItems: 'center', 
                                        gap: '0.5rem', 
                                        background: '#10b981', 
                                        padding: '0.65rem 1.25rem',
                                        opacity: (mustHaves.length !== 2 || important.length !== 2) ? 0.6 : 1,
                                        cursor: (loading || mustHaves.length !== 2 || important.length !== 2) ? 'not-allowed' : 'pointer'
                                    }}
                                >
                                    {loading ? <Loader2 size={18} className="animate-spin" /> : <Bot size={18} />}
                                    {loading ? 'Initializing Agent...' : 'Looks good, Complete Setup'}
                                </button>
                            ) : rubricPhase === 1 ? (
                                <button 
                                    onClick={() => setRubricPhase(2)} 
                                    disabled={mustHaves.length < 2 || loading}
                                    className="btn-primary" 
                                    style={{ 
                                        display: 'flex', 
                                        alignItems: 'center', 
                                        gap: '0.5rem', 
                                        padding: '0.65rem 1.25rem',
                                        opacity: mustHaves.length < 2 ? 0.5 : 1,
                                        cursor: mustHaves.length < 2 ? 'not-allowed' : 'pointer'
                                    }}
                                >
                                    Next <ChevronRight size={18} />
                                </button>
                            ) : (
                                <button 
                                    onClick={handleSubmit} 
                                    disabled={loading || important.length < 2}
                                    className="btn-primary" 
                                    style={{ 
                                        display: 'flex', 
                                        alignItems: 'center', 
                                        gap: '0.5rem', 
                                        background: '#10b981', 
                                        padding: '0.65rem 1.25rem',
                                        opacity: important.length < 2 ? 0.6 : 1,
                                        cursor: (loading || important.length < 2) ? 'not-allowed' : 'pointer'
                                    }}
                                >
                                    {loading ? <Loader2 size={18} className="animate-spin" /> : <Bot size={18} />}
                                    {loading ? 'Initializing Agent...' : 'Complete Setup'}
                                </button>
                            )}
                        </div>
                    )}
                </div>

            </div>
        </div>
    );
}
