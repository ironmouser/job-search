'use client';

import { useState } from 'react';
import { Copy, Loader2, ThumbsUp, RefreshCw, Minimize2, Maximize2, CheckCircle, ChevronDown } from 'lucide-react';
import CopyToClipboardButton from './CopyToClipboardButton';
import DownloadTextButton from './DownloadTextButton';

export default function CoverLetterAssetCard({
    jobId,
    initialContent,
    initialRegensUsed,
    planTier,
    initialTone
}: {
    jobId: string;
    initialContent: string;
    initialRegensUsed: number;
    planTier: string;
    initialTone: string;
}) {
    const [content, setContent] = useState(initialContent);
    const [regensUsed, setRegensUsed] = useState(initialRegensUsed);
    const [tone, setTone] = useState(initialTone || 'Confident and strategic');
    const [isLoading, setIsLoading] = useState(false);
    const [isSavingPref, setIsSavingPref] = useState(false);
    const [savedPref, setSavedPref] = useState(false);
    const [error, setError] = useState('');

    const isPro = planTier === 'PRO';
    const regensLeft = 3 - regensUsed;

    const handleRegenerate = async (instruction: string) => {
        if (!isPro || regensLeft <= 0) return;
        setIsLoading(true);
        setError('');
        setSavedPref(false);
        try {
            const res = await fetch(`/api/job/${jobId}/generate-cover-letter`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ instruction, tone }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to regenerate');
            setContent(data.newCoverLetter);
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
                body: JSON.stringify({ coverLetterTone: tone })
            });
            setSavedPref(true);
        } catch (err) {
            console.error("Failed to save preference:", err);
        } finally {
            setIsSavingPref(false);
        }
    };

    return (
        <details className="glass-card" style={{ cursor: 'pointer' }}>
            <summary style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', listStyle: 'none' }}>
                <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--accent-primary)', margin: 0 }}>
                    <CheckCircle size={20} /> Cover Letter
                </h3>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <DownloadTextButton textToDownload={content || ''} filename={`CoverLetter_${jobId.slice(0,8)}.txt`} />
                    <CopyToClipboardButton textToCopy={content || ''} />
                    <ChevronDown className="accordion-chevron" size={20} style={{ color: 'var(--text-secondary)' }} />
                </div>
            </summary>
            <div style={{ background: 'var(--bg-color)', padding: '1.5rem', borderRadius: '8px', border: '1px solid var(--border-glass)', marginTop: '1.5rem', cursor: 'auto' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
                    <select
                        value={tone}
                        onChange={(e) => setTone(e.target.value)}
                        style={{
                            padding: '0.5rem 1rem',
                            background: 'var(--bg-color)',
                            border: '1px solid var(--border-glass)',
                            borderRadius: '8px',
                            color: 'var(--text-primary)',
                            fontSize: '0.9rem'
                        }}
                    >
                        <option value="Confident and strategic">Confident and Strategic (Default)</option>
                        <option value="Professional and direct">Professional and Direct</option>
                        <option value="Creative and bold">Creative and Bold</option>
                        <option value="Highly technical and detailed">Highly Technical</option>
                    </select>

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
                        {savedPref ? 'Saved to Preferences' : 'Save as Preference'}
                    </button>
                </div>

                <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6, marginBottom: '1.5rem' }}>
                    {content}
                </div>

                {error && (
                    <div style={{ padding: '1rem', background: 'rgba(255, 77, 77, 0.1)', color: 'var(--danger)', borderRadius: '8px', fontSize: '0.9rem', marginBottom: '1rem' }}>
                        {error}
                    </div>
                )}

                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '1rem',
                    paddingTop: '1rem',
                    borderTop: '1px solid var(--border-glass)',
                    flexWrap: 'wrap'
                }}>
                    <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                        Regenerations left: {isPro ? regensLeft : 0} / 3
                    </span>
                    <div style={{ flexGrow: 1 }} />
                    <button 
                        onClick={() => handleRegenerate('different')} 
                        disabled={isLoading || !isPro || regensLeft <= 0} 
                        className="btn-outline" 
                        title={!isPro ? "Pro account only" : ""}
                        style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
                    >
                        {isLoading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} Different
                    </button>
                    <button 
                        onClick={() => handleRegenerate('shorter')} 
                        disabled={isLoading || !isPro || regensLeft <= 0} 
                        className="btn-outline" 
                        title={!isPro ? "Pro account only" : ""}
                        style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
                    >
                        {isLoading ? <Loader2 size={14} className="animate-spin" /> : <Minimize2 size={14} />} Shorter
                    </button>
                    <button 
                        onClick={() => handleRegenerate('longer')} 
                        disabled={isLoading || !isPro || regensLeft <= 0} 
                        className="btn-outline" 
                        title={!isPro ? "Pro account only" : ""}
                        style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
                    >
                        {isLoading ? <Loader2 size={14} className="animate-spin" /> : <Maximize2 size={14} />} Expand
                    </button>
                </div>
            </div>
        </details>
    );
}
