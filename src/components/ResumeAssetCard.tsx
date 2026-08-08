'use client';

import { useState, useEffect, useRef } from 'react';
import { Loader2, ThumbsUp, RefreshCw, CheckCircle, ChevronDown, Edit2, Save, X, RotateCcw, Pencil, Send, Settings } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { marked } from 'marked';
import { generateStyledPdfHtml, PdfStyleOptions } from '@/lib/pdfGeneratorHelper';
import ResumeActions from './ResumeActions';
import DownloadPdfButton from './DownloadPdfButton';
import CopyToClipboardButton from './CopyToClipboardButton';
import JitResumeUploadModal from '@/components/common/JitResumeUploadModal';
import { trackAssetAction } from '@/lib/analytics';

export default function ResumeAssetCard({
    jobId,
    initialContent,
    initialPreviousContent,
    initialRegensUsed,
    planTier,
    initialCustomization,
    initialPdfSettings
}: {
    jobId: string;
    initialContent: string;
    initialPreviousContent?: string;
    initialRegensUsed: number;
    planTier: string;
    initialCustomization: number;
    initialPdfSettings?: PdfStyleOptions;
}) {
    const router = useRouter();
    const [content, setContent] = useState(initialContent);
    const [previousContent, setPreviousContent] = useState<string | undefined>(initialPreviousContent);
    const [isReverting, setIsReverting] = useState(false);
    const [regensUsed, setRegensUsed] = useState(initialRegensUsed);
    const [customizationAmount, setCustomizationAmount] = useState(initialCustomization || 50);
    const [selectedColor, setSelectedColor] = useState('#06af9e');

    const [pdfSettings, setPdfSettings] = useState<PdfStyleOptions>({
        template: initialPdfSettings?.template || 'classic',
        fontFamily: initialPdfSettings?.fontFamily || 'Helvetica, Arial, sans-serif',
        fontSize: initialPdfSettings?.fontSize || '11pt',
        lineHeight: initialPdfSettings?.lineHeight || '1.5',
        primaryColor: initialPdfSettings?.primaryColor || '#1e3a8a',
        textColor: initialPdfSettings?.textColor || '#111827',
        margin: initialPdfSettings?.margin || '0.5in',
        headerLayout: initialPdfSettings?.headerLayout || 'left',
    });

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

        fetch('/api/settings')
            .then(res => res.json())
            .then(data => {
                if (data && data.resumePdfTemplate) {
                    setPdfSettings({
                        template: data.resumePdfTemplate,
                        fontFamily: data.resumePdfFontFamily,
                        fontSize: data.resumePdfFontSize,
                        lineHeight: data.resumePdfLineHeight,
                        primaryColor: data.resumePdfPrimaryColor,
                        textColor: data.resumePdfTextColor,
                        margin: data.resumePdfMargin,
                        headerLayout: data.resumePdfHeaderLayout,
                    });
                }
            })
            .catch(err => console.error("Could not fetch user PDF settings:", err));

        return () => {
            window.removeEventListener('theme-color-change', handleGlobalColorChange);
        };
    }, []);

    const [isLoading, setIsLoading] = useState(false);
    const [isSavingPref, setIsSavingPref] = useState(false);
    const [savedPref, setSavedPref] = useState(false);
    const [error, setError] = useState('');
    
    // Edit state
    const [isEditing, setIsEditing] = useState(false);
    const [editContent, setEditContent] = useState(initialContent);
    const [isSaving, setIsSaving] = useState(false);

    const isPro = planTier === 'PRO';
    const regensLeft = 5 - regensUsed;

    // Custom prompt state
    const [showCustomPrompt, setShowCustomPrompt] = useState(false);
    const [customPrompt, setCustomPrompt] = useState('');
    const customPromptInputRef = useRef<HTMLInputElement>(null);
    const MAX_CUSTOM_CHARS = 200;

    const cleanContent = (content: string) => {
        let cleaned = content.replace(/^"|"$/g, '').replace(/\\n/g, '\n').replace(/\\"/g, '"').trim();
        if (cleaned.startsWith('```')) {
            cleaned = cleaned.replace(/^```[a-zA-Z]*\n?/, '').replace(/\n?```$/, '').trim();
        }
        return cleaned;
    };

    const [showJitModal, setShowJitModal] = useState(false);
    const [pendingInstruction, setPendingInstruction] = useState<string>('different');

    const handleRegenerate = async (instruction: string = 'different') => {
        if (!isPro || regensLeft <= 0) return;
        setShowCustomPrompt(false);
        setCustomPrompt('');
        setIsLoading(true);
        setError('');
        setSavedPref(false);
        if (content) {
            setPreviousContent(content);
        }
        try {
            const res = await fetch(`/api/job/${jobId}/generate-resume`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ instruction, customizationAmount }),
            });
            
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                if (data.errorCode === 'MISSING_BASE_RESUME') {
                    setPendingInstruction(instruction);
                    setShowJitModal(true);
                    setIsLoading(false);
                    return;
                }
                throw new Error(data.error || 'Failed to regenerate');
            }
            
            const reader = res.body?.getReader();
            if (!reader) throw new Error('Failed to read stream');
            
            const decoder = new TextDecoder();
            let newContent = '';
            
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                newContent += decoder.decode(value, { stream: true });
                const cleanedContent = cleanContent(newContent);
                setContent(cleanedContent);
                setEditContent(cleanedContent);
            }
            
            setRegensUsed(prev => prev + 1);
            router.refresh();
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
            if (content) {
                setPreviousContent(content);
            }
            setContent(editContent);
            setIsEditing(false);
            router.refresh();
        } catch (err: any) {
            setError(err.message);
        } finally {
            setIsSaving(false);
        }
    };

    const handleRevert = async () => {
        if (!previousContent) return;
        setIsReverting(true);
        setError('');
        try {
            const res = await fetch(`/api/job/${jobId}/revert-asset`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ assetType: 'resume' }),
            });
            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || 'Failed to revert to previous version');
            }
            const data = await res.json();
            setContent(data.currentContent);
            setEditContent(data.currentContent);
            setPreviousContent(data.previousContent);
            router.refresh();
        } catch (err: any) {
            setError(err.message);
        } finally {
            setIsReverting(false);
        }
    };

    const cancelEdit = () => {
        setEditContent(content);
        setIsEditing(false);
        setError('');
    };

    let extractedName = 'My';
    const nameMatch = (content || '').match(/^#\s+([^\n]+)/);
    if (nameMatch && nameMatch[1]) {
        extractedName = nameMatch[1].trim().replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '');
    }
    const resumeFilename = `${extractedName}_Resume.pdf`;
    const styledResumeHtml = generateStyledPdfHtml(content || '', pdfSettings);

    return (
        <details className="glass-card" style={{ cursor: 'pointer' }}>
            <summary style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', listStyle: 'none' }}>
                <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--accent-primary)', margin: 0 }}>
                    <CheckCircle size={20} /> Tailored Resume Extract
                </h3>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }} onClick={(e) => e.stopPropagation()}>
                    <DownloadPdfButton markdownText={content} filename={resumeFilename} type="resume" styleOptions={pdfSettings} />
                    <CopyToClipboardButton textToCopy={content || ''} />
                    <ChevronDown className="accordion-chevron" size={20} style={{ color: 'var(--text-secondary)' }} />
                </div>
            </summary>
            <div className="asset-card-body" style={{ background: 'var(--bg-color)', padding: '1.5rem', borderRadius: '8px', border: '1px solid var(--border-glass)', marginTop: '1.5rem', cursor: 'auto', overflow: 'auto' }}>
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

                    <Link
                        href="/settings#pdf-styling-resume"
                        title="PDF Styling Settings"
                        style={{
                            padding: '0.4rem 0.6rem',
                            fontSize: '0.8rem',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '0.4rem',
                            background: 'transparent',
                            color: 'var(--text-secondary)',
                            border: '1px solid var(--border-glass)',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            textDecoration: 'none'
                        }}
                    >
                        <Settings size={14} />
                    </Link>
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
                        className="custom-resume-preview-container"
                        style={{ 
                            background: '#ffffff', 
                            borderRadius: '6px', 
                            border: '1px solid var(--border-glass)', 
                            overflow: 'hidden', 
                            marginBottom: '1.5rem',
                            boxShadow: '0 4px 16px rgba(0, 0, 0, 0.15)'
                        }}
                        dangerouslySetInnerHTML={{ __html: styledResumeHtml }}
                    />
                )}
                
                <ResumeActions jobId={jobId} markdownText={content} selectedColor={pdfSettings.primaryColor || selectedColor} pdfSettings={pdfSettings} />

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
                        Regenerations left: {isPro ? regensLeft : 0} / 5
                    </span>
                    <div style={{ flexGrow: 1 }} />
                    <button 
                        onClick={handleRevert} 
                        disabled={!previousContent || previousContent === content || isLoading || isReverting}
                        className="btn-outline" 
                        title={!previousContent || previousContent === content ? "No previous version available" : "Revert to previous version"}
                        style={{ 
                            padding: '0.4rem 0.8rem', 
                            fontSize: '0.8rem', 
                            display: 'flex', 
                            alignItems: 'center', 
                            gap: '0.4rem',
                            opacity: (!previousContent || previousContent === content || isLoading || isReverting) ? 0.5 : 1,
                            cursor: (!previousContent || previousContent === content || isLoading || isReverting) ? 'not-allowed' : 'pointer'
                        }}
                    >
                        {isReverting ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />} Previous Version
                    </button>
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
                        onClick={() => {
                            setShowCustomPrompt(v => !v);
                            if (!showCustomPrompt) {
                                setTimeout(() => customPromptInputRef.current?.focus(), 50);
                            }
                        }}
                        disabled={isLoading || !isPro || regensLeft <= 0}
                        className="btn-outline"
                        title={!isPro ? 'Pro account only' : showCustomPrompt ? 'Close custom prompt' : 'Enter a custom instruction'}
                        style={{
                            padding: '0.4rem 0.8rem',
                            fontSize: '0.8rem',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.4rem',
                            background: showCustomPrompt ? 'var(--accent-primary)' : undefined,
                            color: showCustomPrompt ? '#fff' : undefined,
                            borderColor: showCustomPrompt ? 'var(--accent-primary)' : undefined,
                        }}
                    >
                        <Pencil size={14} /> Custom
                    </button>
                </div>

                {/* Custom prompt inline row */}
                {showCustomPrompt && (
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        marginTop: '0.75rem',
                        padding: '0.75rem',
                        background: 'var(--glass-bg, rgba(255,255,255,0.04))',
                        border: '1px solid var(--border-color)',
                        borderRadius: '0.5rem',
                        flexWrap: 'wrap',
                    }}>
                        <input
                            ref={customPromptInputRef}
                            type="text"
                            value={customPrompt}
                            onChange={e => setCustomPrompt(e.target.value.slice(0, MAX_CUSTOM_CHARS))}
                            onKeyDown={e => {
                                if (e.key === 'Enter' && customPrompt.trim() && !isLoading && regensLeft > 0) {
                                    handleRegenerate(customPrompt.trim());
                                }
                                if (e.key === 'Escape') { setShowCustomPrompt(false); setCustomPrompt(''); }
                            }}
                            placeholder='e.g. "Highlight my cloud architecture achievements"'
                            maxLength={MAX_CUSTOM_CHARS}
                            disabled={isLoading}
                            style={{
                                flex: 1,
                                minWidth: '180px',
                                padding: '0.4rem 0.6rem',
                                fontSize: '0.82rem',
                                background: 'var(--input-bg, rgba(0,0,0,0.2))',
                                border: '1px solid var(--border-color)',
                                borderRadius: '0.375rem',
                                color: 'var(--text-primary)',
                                outline: 'none',
                            }}
                        />
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                            {customPrompt.length}/{MAX_CUSTOM_CHARS}
                        </span>
                        <button
                            onClick={() => { if (customPrompt.trim()) handleRegenerate(customPrompt.trim()); }}
                            disabled={isLoading || !customPrompt.trim() || regensLeft <= 0}
                            className="btn-primary"
                            style={{ padding: '0.4rem 0.75rem', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
                        >
                            {isLoading ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />} Generate
                        </button>
                        <button
                            onClick={() => { setShowCustomPrompt(false); setCustomPrompt(''); }}
                            className="btn-outline"
                            style={{ padding: '0.4rem 0.5rem', fontSize: '0.8rem', display: 'flex', alignItems: 'center' }}
                            title="Close"
                        >
                            <X size={14} />
                        </button>
                    </div>
                )}
            </div>
            <JitResumeUploadModal
                isOpen={showJitModal}
                onClose={() => setShowJitModal(false)}
                onSuccess={() => {
                    setShowJitModal(false);
                    handleRegenerate(pendingInstruction);
                }}
                title="Upload Base Resume to Generate Tailored Resume"
                description="Please upload or paste your master resume template. The AI will use it to craft a customized resume for this position."
            />
        </details>
    );
}
