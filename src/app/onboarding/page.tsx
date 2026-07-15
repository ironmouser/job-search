"use client";

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Bot, MapPin, Search, FileText, Target, CheckCircle, ChevronRight, ChevronLeft, Loader2, UploadCloud } from 'lucide-react';
import { useSession } from 'next-auth/react';

export default function OnboardingPage() {
    const router = useRouter();
    const { update } = useSession();
    const [step, setStep] = useState(1);
    const [loading, setLoading] = useState(false);
    const [isDragging, setIsDragging] = useState(false);
    const [isParsing, setIsParsing] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    
    const [formData, setFormData] = useState({
        searchKeyword: 'Senior Product Manager',
        searchLocation: 'Remote',
        remoteOnly: true,
        resumeMarkdown: '',
    });
    const [goal, setGoal] = useState('I am looking for high-growth tech opportunities.');
    const [weights, setWeights] = useState({
        compensation: 20,
        productFit: 20,
        remoteFlexibility: 15,
        aiMaturity: 10,
        leadership: 10,
        growth: 10,
        culture: 10,
        techStack: 5
    });

    const handleChange = (key: string, value: any) => {
        setFormData({ ...formData, [key]: value });
    };

    const handleNext = () => setStep(s => Math.min(s + 1, 3));
    const handlePrev = () => setStep(s => Math.max(s - 1, 1));

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
            const finalProfile = `# Job Search Goal
${goal}

# Evaluation Criteria Weights
- Compensation: ${weights.compensation}%
- Product Fit: ${weights.productFit}% (Company business viability and overall role alignment)
- Remote Flexibility: ${weights.remoteFlexibility}%
- AI Maturity: ${weights.aiMaturity}%
- Leadership: ${weights.leadership}%
- Growth: ${weights.growth}%
- Culture: ${weights.culture}%
- Tech Stack: ${weights.techStack}%`;

            const res = await fetch('/api/onboarding', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...formData,
                    profile: finalProfile
                })
            });
            
            if (res.ok) {
                // Update NextAuth session to trigger token update with new isOnboarded flag
                await update({ isOnboarded: true });
                // Hard navigate to dashboard to bypass any cached layout/middleware state
                window.location.href = '/';
            } else {
                alert('Failed to save settings. Please try again.');
            }
        } catch (e) {
            alert('An error occurred. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '2rem', background: 'var(--bg-main)' }}>
            <div className="glass-card animate-fade-in" style={{ width: '100%', maxWidth: '800px', padding: '3rem' }}>
                
                {/* Progress Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3rem', position: 'relative' }}>
                    <div style={{ position: 'absolute', top: '50%', left: 0, right: 0, height: '2px', background: 'var(--border-glass)', zIndex: 0 }} />
                    <div style={{ position: 'absolute', top: '50%', left: 0, width: `${(step - 1) * 50}%`, height: '2px', background: 'var(--accent-primary)', zIndex: 0, transition: 'width 0.3s ease' }} />
                    
                    {[1, 2, 3].map(i => (
                        <div key={i} style={{ 
                            position: 'relative', zIndex: 1, 
                            width: '40px', height: '40px', borderRadius: '50%', 
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            background: step >= i ? 'var(--accent-primary)' : 'var(--bg-surface)',
                            color: step >= i ? '#fff' : 'var(--text-secondary)',
                            fontWeight: 600,
                            border: `2px solid ${step >= i ? 'var(--accent-primary)' : 'var(--border-glass)'}`,
                            transition: 'all 0.3s ease'
                        }}>
                            {step > i ? <CheckCircle size={20} /> : i}
                        </div>
                    ))}
                </div>

                {/* Step 1 */}
                {step === 1 && (
                    <div className="animate-fade-in">
                        <h2 style={{ fontSize: '2rem', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            <Search className="text-accent" /> What are you looking for?
                        </h2>
                        <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem' }}>Let's set up your primary job search criteria so the agent knows what to hunt for.</p>
                        
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                <label style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Target Job Title / Keyword</label>
                                <input 
                                    type="text"
                                    value={formData.searchKeyword}
                                    onChange={(e) => handleChange('searchKeyword', e.target.value)}
                                    placeholder="e.g. Senior Software Engineer"
                                    style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)', padding: '1rem', borderRadius: '8px', fontSize: '1rem' }}
                                />
                            </div>
                            
                            <div style={{ display: 'flex', gap: '1rem' }}>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', flex: 1 }}>
                                    <label style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Location</label>
                                    <div style={{ position: 'relative' }}>
                                        <MapPin size={18} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
                                        <input 
                                            type="text"
                                            value={formData.searchLocation}
                                            onChange={(e) => handleChange('searchLocation', e.target.value)}
                                            placeholder="e.g. San Francisco, CA"
                                            style={{ width: '100%', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)', padding: '1rem 1rem 1rem 2.5rem', borderRadius: '8px', fontSize: '1rem' }}
                                        />
                                    </div>
                                </div>
                                
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', justifyContent: 'center' }}>
                                    <label style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Remote Only?</label>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', padding: '1rem', background: 'rgba(0,0,0,0.2)', borderRadius: '8px', border: '1px solid var(--border-glass)' }}>
                                        <input 
                                            type="checkbox" 
                                            checked={formData.remoteOnly}
                                            onChange={(e) => handleChange('remoteOnly', e.target.checked)}
                                            style={{ cursor: 'pointer', width: '18px', height: '18px' }}
                                        />
                                        <span>Must be remote</span>
                                    </label>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Step 2 */}
                {step === 2 && (
                    <div className="animate-fade-in">
                        <h2 style={{ fontSize: '2rem', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            <FileText className="text-accent" /> Base Resume
                        </h2>
                        <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem' }}>Upload a PDF/Word doc or paste your resume. The AI will convert it to Markdown to use as a template.</p>
                        
                        <div 
                            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                            onDragLeave={() => setIsDragging(false)}
                            onDrop={handleDrop}
                            onClick={() => fileInputRef.current?.click()}
                            style={{ 
                                border: `2px dashed ${isDragging ? 'var(--accent-primary)' : 'var(--border-glass)'}`, 
                                background: isDragging ? 'rgba(99, 102, 241, 0.1)' : 'rgba(0,0,0,0.2)', 
                                padding: '2rem', 
                                borderRadius: '8px', 
                                textAlign: 'center',
                                cursor: 'pointer',
                                transition: 'all 0.3s ease',
                                marginBottom: '1.5rem',
                                position: 'relative'
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
                                    <span>or click to browse</span>
                                </div>
                            )}
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', margin: '1rem 0' }}>
                            <div style={{ flex: 1, height: '1px', background: 'var(--border-glass)' }} />
                            <span style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>OR PASTE TEXT</span>
                            <div style={{ flex: 1, height: '1px', background: 'var(--border-glass)' }} />
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                            <textarea 
                                value={formData.resumeMarkdown}
                                onChange={(e) => handleChange('resumeMarkdown', e.target.value)}
                                placeholder="Paste your resume here (Markdown, plain text, or rich text)..."
                                style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)', padding: '1rem', borderRadius: '8px', minHeight: '250px', resize: 'vertical', fontFamily: 'monospace', fontSize: '0.9rem' }}
                            />
                        </div>
                    </div>
                )}

                {/* Step 3 */}
                {step === 3 && (
                    <div className="animate-fade-in">
                        <h2 style={{ fontSize: '2rem', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            <Target className="text-accent" /> AI Scoring Rubric
                        </h2>
                        <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>Define exactly how the AI should score and rank jobs. Be specific about your priorities.</p>
                        
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '2rem' }}>
                            <label style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)' }}>1. What is your overall job search goal?</label>
                            <textarea 
                                value={goal}
                                onChange={(e) => setGoal(e.target.value)}
                                placeholder="Example: I am looking for high-growth tech opportunities with strong engineering culture..."
                                style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)', padding: '1rem', borderRadius: '8px', minHeight: '100px', resize: 'vertical', fontSize: '0.9rem' }}
                            />
                        </div>

                        <div style={{ marginBottom: '1.5rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.5rem' }}>
                                <label style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)' }}>2. Adjust Evaluation Weights</label>
                                <span style={{ 
                                    fontSize: '0.9rem', 
                                    fontWeight: 'bold', 
                                    color: Object.values(weights).reduce((a, b) => a + b, 0) === 100 ? '#10b981' : '#f59e0b'
                                }}>
                                    Total Weight: {Object.values(weights).reduce((a, b) => a + b, 0)}%
                                    {Object.values(weights).reduce((a, b) => a + b, 0) !== 100 && ' (will be normalized)'}
                                </span>
                            </div>
                            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '1.5rem' }}>Drag the sliders to prioritize the criteria you care most about.</p>

                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem' }}>
                                {[
                                    { key: 'compensation', label: 'Compensation & Benefits', desc: 'Salary, equity, health, retirement packages' },
                                    { key: 'productFit', label: 'Business Viability & Role Fit', desc: 'Company/business stability, market demand, and role alignment' },
                                    { key: 'remoteFlexibility', label: 'Remote Flexibility', desc: 'Work-from-home policy, flexible hours' },
                                    { key: 'aiMaturity', label: 'AI Maturity & Tooling', desc: 'Use of AI tools, modern infrastructure' },
                                    { key: 'leadership', label: 'Leadership & Vision', desc: 'Executive strength, mentorship quality' },
                                    { key: 'growth', label: 'Career Growth', desc: 'Promotions, learning budgets, responsibilities' },
                                    { key: 'culture', label: 'Work Culture', desc: 'Work-life balance, diversity, collaboration' },
                                    { key: 'techStack', label: 'Tech Stack', desc: 'Modern frameworks, developer tooling' }
                                ].map(({ key, label, desc }) => (
                                    <div key={key} style={{ background: 'rgba(255,255,255,0.02)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--border-glass)' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.25rem' }}>
                                            <span style={{ fontWeight: 500, fontSize: '0.95rem' }}>{label}</span>
                                            <span style={{ fontWeight: 'bold', color: 'var(--accent-primary)', fontSize: '0.9rem' }}>{weights[key as keyof typeof weights]}%</span>
                                        </div>
                                        <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>{desc}</p>
                                        <input 
                                            type="range"
                                            min="0"
                                            max="100"
                                            step="5"
                                            value={weights[key as keyof typeof weights]}
                                            onChange={(e) => setWeights(prev => ({ ...prev, [key]: parseInt(e.target.value) }))}
                                            style={{ width: '100%', accentColor: 'var(--accent-primary)', cursor: 'pointer' }}
                                        />
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                {/* Footer Controls */}
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '3rem', paddingTop: '2rem', borderTop: '1px solid var(--border-glass)' }}>
                    <button 
                        onClick={handlePrev} 
                        disabled={step === 1 || loading}
                        className="btn-outline" 
                        style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', opacity: step === 1 ? 0 : 1, pointerEvents: step === 1 ? 'none' : 'auto' }}
                    >
                        <ChevronLeft size={18} /> Back
                    </button>
                    
                    {step < 3 ? (
                        <button 
                            onClick={handleNext} 
                            className="btn-primary" 
                            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                        >
                            Next <ChevronRight size={18} />
                        </button>
                    ) : (
                        <button 
                            onClick={handleSubmit} 
                            disabled={loading}
                            className="btn-primary" 
                            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: '#10b981' }}
                        >
                            {loading ? <Loader2 size={18} className="animate-spin" /> : <Bot size={18} />}
                            {loading ? 'Initializing Agent...' : 'Complete Setup'}
                        </button>
                    )}
                </div>

            </div>
        </div>
    );
}
