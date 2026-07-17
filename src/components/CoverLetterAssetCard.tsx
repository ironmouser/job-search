'use client';

import { useState, useEffect } from 'react';
import { Loader2, ThumbsUp, RefreshCw, Minimize2, Maximize2, CheckCircle, ChevronDown, Edit2, Save, X } from 'lucide-react';
import { marked } from 'marked';
import CopyToClipboardButton from './CopyToClipboardButton';
import DownloadPdfButton from './DownloadPdfButton';

export default function CoverLetterAssetCard({
    jobId,
    initialContent,
    initialRegensUsed,
    planTier,
    initialTone,
    userName = 'My',
    userLocation,
    userPhone,
    userEmail,
    companyName,
    companyLocation,
}: {
    jobId: string;
    initialContent: string;
    initialRegensUsed: number;
    planTier: string;
    initialTone: string;
    userName?: string;
    userLocation?: string;
    userPhone?: string;
    userEmail?: string;
    companyName?: string;
    companyLocation?: string;
}) {
    const [content, setContent] = useState(initialContent);
    const [regensUsed, setRegensUsed] = useState(initialRegensUsed);
    const [tone, setTone] = useState(initialTone || 'Confident and strategic');
    const [isLoading, setIsLoading] = useState(false);
    const [isSavingPref, setIsSavingPref] = useState(false);
    const [savedPref, setSavedPref] = useState(false);
    const [error, setError] = useState('');
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
    
    // Edit state
    const [isEditing, setIsEditing] = useState(false);
    const [editContent, setEditContent] = useState(initialContent);
    const [isSaving, setIsSaving] = useState(false);

    const isPro = planTier === 'PRO';
    const regensLeft = 3 - regensUsed;
    const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

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
            setEditContent(data.newCoverLetter);
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

    const handleSaveEdit = async () => {
        setIsSaving(true);
        setError('');
        try {
            const res = await fetch(`/api/job/${jobId}/assets`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ coverLetterMarkdown: editContent }),
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

    const nameParts = userName.split(' ');
    const firstName = nameParts[0];
    const lastName = nameParts.slice(1).join(' ');
    const letterBodyHtml = marked.parse(content || '') as string;

    const customCoverLetterHtml = `
    <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; line-height: 1.5; color: #000; padding: 40px; font-size: 11pt;">
        <!-- Header: Name left, contact right -->
        <table style="width: 100%; border-bottom: 2px solid #e0e0e0; padding-bottom: 12px; margin-bottom: 20px;">
            <tr>
                <td style="vertical-align: top;">
                    ${userName && userName !== 'My' ? `
                    <span style="font-size: 16pt; font-weight: bold; letter-spacing: 0.04em; font-family: Arial, sans-serif; text-transform: uppercase;">
                        <span style="color: ${selectedColor};">${firstName}</span>
                        ${lastName ? `<span style="color: #1a1a1a;"> ${lastName}</span>` : ''}
                    </span>
                    ` : ''}
                </td>
                <td style="text-align: right; vertical-align: top; font-size: 9pt; color: #444; line-height: 1.6; font-family: Arial, sans-serif;">
                    ${userLocation ? `<div>${userLocation}</div>` : ''}
                    ${userPhone ? `<div>${userPhone}</div>` : ''}
                    ${userEmail ? `<div style="color: ${selectedColor}; text-decoration: none;">${userEmail}</div>` : ''}
                </td>
            </tr>
        </table>

        <!-- Date + recipient block -->
        <div style="margin-bottom: 20px; font-family: Arial, sans-serif; font-size: 9.5pt; color: #333; line-height: 1.6;">
            <div style="margin-bottom: 10px;">${today}</div>
            <div>Recruiting Department</div>
            ${companyName ? `<div>${companyName}</div>` : ''}
            ${companyLocation ? `<div>${companyLocation}</div>` : ''}
        </div>

        <!-- Salutation -->
        <div style="margin-bottom: 15px; font-family: Arial, sans-serif; font-weight: bold; font-size: 10pt; color: #1a1a1a;">
            Dear Recruiting Team,
        </div>

        <!-- Body -->
        <div style="font-family: Georgia, serif; font-size: 10.5pt; line-height: 1.7; color: #1a1a1a;">
            <style>
                h1, h2, h3, h4, h5, h6 { color: ${selectedColor} !important; margin-top: 15px; margin-bottom: 10px; }
                p { margin-bottom: 15px; }
                ul { margin-bottom: 15px; padding-left: 20px; }
                li { margin-bottom: 5px; }
                a { color: ${selectedColor} !important; }
            </style>
            ${letterBodyHtml}
        </div>
    </div>
    `;

    // Full letter text for copy (includes header)
    const fullLetterText = [
        userName && userName !== 'My' ? userName : '',
        [userLocation, userPhone, userEmail].filter(Boolean).join('  |  '),
        '',
        today,
        '',
        'Recruiting Department',
        companyName || '',
        companyLocation || '',
        '',
        'Dear Recruiting Team,',
        '',
        content,
    ].filter((line, i, arr) => !(line === '' && arr[i - 1] === '')).join('\n');

    return (
        <details className="glass-card" style={{ cursor: 'pointer' }}>
            <summary style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', listStyle: 'none' }}>
                <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--accent-primary)', margin: 0 }}>
                    <CheckCircle size={20} /> Cover Letter
                </h3>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <DownloadPdfButton html={customCoverLetterHtml} filename={`CoverLetter_${userName.replace(/\s+/g, '_')}.pdf`} />
                    <CopyToClipboardButton textToCopy={fullLetterText} />
                    <ChevronDown className="accordion-chevron" size={20} style={{ color: 'var(--text-secondary)' }} />
                </div>
            </summary>
            <div style={{ background: 'var(--bg-color)', padding: '1.5rem', borderRadius: '8px', border: '1px solid var(--border-glass)', marginTop: '1.5rem', cursor: 'auto' }}>

                {/* Tone + Edit Controls */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
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

                    <div style={{ flexGrow: 1 }} />

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

                {/* Letter Document */}
                <div style={{
                    background: '#fff',
                    color: '#1a1a1a',
                    borderRadius: '6px',
                    padding: '2.5rem 3rem',
                    fontFamily: 'Georgia, "Times New Roman", serif',
                    fontSize: '0.95rem',
                    lineHeight: 1.7,
                    marginBottom: '1.5rem',
                    boxShadow: '0 4px 24px rgba(0,0,0,0.18)',
                    border: '1px solid rgba(0,0,0,0.08)',
                }}>
                    {/* Header row: name left, contact right */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem', paddingBottom: '1.25rem', borderBottom: '2px solid #e0e0e0' }}>
                        <div>
                            {userName && userName !== 'My' && (
                                <div style={{ fontSize: '1.5rem', fontWeight: 700, letterSpacing: '0.04em', color: '#1a1a1a', fontFamily: 'Arial, Helvetica, sans-serif', textTransform: 'uppercase' }}>
                                    <span style={{ color: selectedColor }}>{firstName}</span>
                                    {lastName ? <span style={{ color: '#1a1a1a' }}> {lastName}</span> : null}
                                </div>
                            )}
                        </div>
                        <div style={{ textAlign: 'right', fontSize: '0.82rem', color: '#444', lineHeight: 1.8, fontFamily: 'Arial, Helvetica, sans-serif' }}>
                            {userLocation && <div>{userLocation}</div>}
                            {userPhone && <div>{userPhone}</div>}
                            {userEmail && <div style={{ color: selectedColor }}>{userEmail}</div>}
                        </div>
                    </div>

                    {/* Date + recipient block */}
                    <div style={{ marginBottom: '1.5rem', fontFamily: 'Arial, Helvetica, sans-serif', fontSize: '0.88rem', color: '#333', lineHeight: 1.7 }}>
                        <div style={{ marginBottom: '0.75rem' }}>{today}</div>
                        <div>Recruiting Department</div>
                        {companyName && <div>{companyName}</div>}
                        {companyLocation && <div>{companyLocation}</div>}
                    </div>

                    {/* Salutation */}
                    <div style={{ marginBottom: '1rem', fontFamily: 'Arial, Helvetica, sans-serif', fontWeight: 600, fontSize: '0.95rem', color: '#1a1a1a' }}>
                        Dear Recruiting Team,
                    </div>

                    {/* Letter body */}
                    <style dangerouslySetInnerHTML={{ __html: `
                        .custom-coverletter-preview h1, 
                        .custom-coverletter-preview h2, 
                        .custom-coverletter-preview h3, 
                        .custom-coverletter-preview h4, 
                        .custom-coverletter-preview h5, 
                        .custom-coverletter-preview h6 {
                            color: ${selectedColor} !important;
                        }
                        .custom-coverletter-preview a {
                            color: ${selectedColor} !important;
                        }
                    `}} />

                    {isEditing ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            <textarea
                                value={editContent}
                                onChange={(e) => setEditContent(e.target.value)}
                                style={{
                                    width: '100%',
                                    minHeight: '260px',
                                    padding: '1rem',
                                    borderRadius: '6px',
                                    border: '1px solid #ccc',
                                    background: '#f9f9f9',
                                    color: '#1a1a1a',
                                    fontFamily: 'monospace',
                                    fontSize: '0.9rem',
                                    resize: 'vertical',
                                    boxSizing: 'border-box',
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
                            className="custom-coverletter-preview"
                            style={{ fontFamily: 'Georgia, "Times New Roman", serif', fontSize: '0.95rem', lineHeight: 1.8, color: '#1a1a1a' }}
                            dangerouslySetInnerHTML={{ __html: marked.parse(content || '') as string }}
                        />
                    )}
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
