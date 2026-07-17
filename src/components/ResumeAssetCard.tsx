'use client';

import { useState, useEffect } from 'react';
import { Loader2, ThumbsUp, RefreshCw, CheckCircle, ChevronDown, Edit2, Save, X } from 'lucide-react';
import { marked } from 'marked';
import ResumeActions from './ResumeActions';

export default function ResumeAssetCard({
    jobId,
    initialContent,
    initialRegensUsed,
    planTier,
    initialCustomization
}: {
    jobId: string;
    initialContent: string;
    initialRegensUsed: number;
    planTier: string;
    initialCustomization: number;
}) {
    const [content, setContent] = useState(initialContent);
    const [regensUsed, setRegensUsed] = useState(initialRegensUsed);
    const [customizationAmount, setCustomizationAmount] = useState(initialCustomization || 50);
    const [selectedColor, setSelectedColor] = useState('#06af9e');

    useEffect(() => {
        const storedColor = localStorage.getItem('theme-selected-color');
        if (storedColor) {
            setSelectedColor(storedColor);
        }

        const handleGlobalColorChange = (e: Event) => {
            const newColor = (e as CustomEvent).detail;
            setSelectedColor(newColor);
        };

        window.addEventListener('theme-color-change', handleGlobalColorChange);
        return () => {
            window.removeEventListener('theme-color-change', handleGlobalColorChange);
        };
    }, []);

    const handleColorChange = (color: string) => {
        setSelectedColor(color);
        localStorage.setItem('theme-selected-color', color);
        window.dispatchEvent(new CustomEvent('theme-color-change', { detail: color }));
    };
    const [isLoading, setIsLoading] = useState(false);
    const [isSavingPref, setIsSavingPref] = useState(false);
    const [savedPref, setSavedPref] = useState(false);
    const [error, setError] = useState('');
    
    // Edit state
    const [isEditing, setIsEditing] = useState(false);
    const [editContent, setEditContent] = useState(initialContent);
    const [isSaving, setIsSaving] = useState(false);

    const isPro = planTier === 'PRO';
    const regensLeft = 3 - regensUsed;

    const handleRegenerate = async () => {
        if (!isPro || regensLeft <= 0) return;
        setIsLoading(true);
        setError('');
        setSavedPref(false);
        try {
            const res = await fetch(`/api/job/${jobId}/generate-resume`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ instruction: 'different', customizationAmount }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to regenerate');
            setContent(data.newResume);
            setRegensUsed(data.regensUsed);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    };

    const savePreference = async () => {
        setIsSavingPref(true);
        try {
            await fetch('/api/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ resumeCustomizationMaxPercentage: customizationAmount })
            });
            setSavedPref(true);
        } catch (err) {
            console.error("Failed to save preference:", err);
        } finally {
            setIsSavingPref(false);
        }
    };

    const handleSaveEdit = async () => {
        setIsSaving(true);
        setError('');
        try {
            const res = await fetch(`/api/job/${jobId}/assets`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tailoredResumeMarkdown: editContent }),
            });
            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || 'Failed to save edits');
            }
            setContent(editContent);
            setIsEditing(false);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setIsSaving(false);
        }
    };

    const cancelEdit = () => {
        setEditContent(content);
        setIsEditing(false);
        setError('');
    };

    return (
        <details className="glass-card" style={{ cursor: 'pointer' }}>
            <summary style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', listStyle: 'none' }}>
                <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--accent-primary)', margin: 0 }}>
                    <CheckCircle size={20} /> Tailored Resume Extract
                </h3>
                <ChevronDown className="accordion-chevron" size={20} style={{ color: 'var(--text-secondary)' }} />
            </summary>
            <div style={{ background: 'var(--bg-color)', padding: '1.5rem', borderRadius: '8px', border: '1px solid var(--border-glass)', marginTop: '1.5rem', cursor: 'auto', overflow: 'auto' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexGrow: 1 }}>
                        <label style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Customization: {customizationAmount}%</label>
                        <input 
                            type="range" 
                            min="0" 
                            max="100" 
                            value={customizationAmount} 
                            onChange={(e) => setCustomizationAmount(Number(e.target.value))}
                            style={{ flexGrow: 1, maxWidth: '200px' }}
                        />
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        {['black', '#0155a1', '#06af9e', '#1d90f7'].map((color) => (
                            <button
                                key={color}
                                onClick={() => handleColorChange(color)}
                                style={{
                                    width: '18px',
                                    height: '18px',
                                    borderRadius: '50%',
                                    background: color,
                                    border: selectedColor === color ? '2px solid var(--accent-primary)' : '1px solid var(--border-glass)',
                                    cursor: 'pointer',
                                    padding: 0,
                                    outline: 'none',
                                    boxShadow: selectedColor === color ? '0 0 4px var(--accent-primary)' : 'none',
                                    transition: 'transform 0.1s ease',
                                    transform: selectedColor === color ? 'scale(1.1)' : 'none'
                                }}
                                title={color}
                            />
                        ))}
                    </div>

                    <button
                        onClick={savePreference}
                        disabled={isSavingPref || savedPref}
                        style={{
                            padding: '0.4rem 0.8rem',
                            fontSize: '0.8rem',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.4rem',
                            background: savedPref ? 'rgba(102, 252, 241, 0.1)' : 'transparent',
                            color: savedPref ? 'var(--accent-primary)' : 'var(--text-secondary)',
                            border: `1px solid ${savedPref ? 'rgba(102, 252, 241, 0.3)' : 'var(--border-glass)'}`,
                            borderRadius: '4px',
                            cursor: (isSavingPref || savedPref) ? 'default' : 'pointer'
                        }}
                    >
                        {isSavingPref ? <Loader2 size={14} className="animate-spin" /> : <ThumbsUp size={14} />}
                        {savedPref ? 'Saved to Preferences' : 'Save Preference'}
                    </button>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1rem' }}>
                    {!isEditing && (
                        <button 
                            onClick={() => setIsEditing(true)} 
                            className="btn-outline"
                            style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
                        >
                            <Edit2 size={14} /> Edit
                        </button>
                    )}
                </div>

                <style dangerouslySetInnerHTML={{ __html: `
                    .custom-resume-preview h1, 
                    .custom-resume-preview h2, 
                    .custom-resume-preview h3, 
                    .custom-resume-preview h4, 
                    .custom-resume-preview h5, 
                    .custom-resume-preview h6 {
                        color: ${selectedColor} !important;
                    }
                    .custom-resume-preview a {
                        color: ${selectedColor} !important;
                    }
                `}} />

                {isEditing ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '1rem' }}>
                        <textarea 
                            value={editContent} 
                            onChange={(e) => setEditContent(e.target.value)} 
                            style={{ 
                                width: '100%', 
                                minHeight: '300px', 
                                padding: '1rem', 
                                borderRadius: '8px', 
                                border: '1px solid var(--border-glass)', 
                                background: 'rgba(0,0,0,0.2)', 
                                color: 'var(--text-primary)', 
                                fontFamily: 'monospace',
                                fontSize: '0.9rem',
                                resize: 'vertical'
                            }} 
                        />
                        <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
                            <button onClick={cancelEdit} className="btn-outline" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                <X size={16} /> Cancel
                            </button>
                            <button onClick={handleSaveEdit} disabled={isSaving} className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Save Changes
                            </button>
                        </div>
                    </div>
                ) : (
                    <div 
                        className="markdown-body custom-resume-preview"
                        style={{ fontSize: '0.95rem', marginBottom: '1.5rem', lineHeight: 1.6 }}
                        dangerouslySetInnerHTML={{ __html: marked.parse(content || '') as string }}
                    />
                )}
                
                <ResumeActions jobId={jobId} markdownText={content} selectedColor={selectedColor} />

                {error && (
                    <div style={{ padding: '1rem', background: 'rgba(255, 77, 77, 0.1)', color: 'var(--danger)', borderRadius: '8px', fontSize: '0.9rem', marginBottom: '1rem', marginTop: '1rem' }}>
                        {error}
                    </div>
                )}

                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '1rem',
                    paddingTop: '1rem',
                    borderTop: '1px solid var(--border-glass)',
                    flexWrap: 'wrap',
                    marginTop: '1.5rem'
                }}>
                    <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                        Regenerations left: {isPro ? regensLeft : 0} / 3
                    </span>
                    <div style={{ flexGrow: 1 }} />
                    <button 
                        onClick={handleRegenerate} 
                        disabled={isLoading || !isPro || regensLeft <= 0} 
                        className="btn-outline" 
                        title={!isPro ? "Pro account only" : ""}
                        style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
                    >
                        {isLoading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} Different
                    </button>
                </div>
            </div>
        </details>
    );
}
