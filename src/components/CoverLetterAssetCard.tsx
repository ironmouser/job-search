'use client';

import { useState, useEffect, useRef } from 'react';
import { Loader2, ThumbsUp, RefreshCw, Minimize2, Maximize2, CheckCircle, ChevronDown, Edit2, Save, X, RotateCcw, Pencil, Send, Settings } from 'lucide-react';
import Link from 'next/link';
import { marked } from 'marked';
import { useRouter } from 'next/navigation';
import CopyToClipboardButton from './CopyToClipboardButton';
import DownloadPdfButton from './DownloadPdfButton';
import JitResumeUploadModal from '@/components/common/JitResumeUploadModal';
import { cleanCompanyName, cleanCompanyLocation } from '@/lib/cleaners';
import { PdfStyleOptions } from '@/lib/pdfGeneratorHelper';
import { trackAssetAction } from '@/lib/analytics';

const cleanContent = (text: string) => {
    if (!text) return '';
    let cleaned = text.replace(/^"|"$/g, '').replace(/\\n/g, '\n').replace(/\\"/g, '"').trim();
    if (cleaned.startsWith('```')) {
        cleaned = cleaned.replace(/^```[a-zA-Z]*\n?/, '').replace(/\n?```$/, '').trim();
    }
    return cleaned
        .replace(/^(?:#+\s*)?cover\s*letter\s*(?:\r?\n)+/i, '')
        .replace(/(?:\r?\n)+(?:sincerely|best regards|warm regards|warmly|regards|respectfully),?\s*(?:\r?\n+[\s\S]*)?$/i, '')
        .trim();
};

export default function CoverLetterAssetCard({
    jobId,
    initialContent,
    initialPreviousContent,
    initialRegensUsed,
    planTier,
    initialTone,
    userName = 'My',
    userLocation,
    userPhone,
    userEmail,
    companyName,
    companyLocation,
    initialPdfSettings,
}: {
    jobId: string;
    initialContent: string;
    initialPreviousContent?: string;
    initialRegensUsed: number;
    planTier: string;
    initialTone: string;
    userName?: string;
    userLocation?: string;
    userPhone?: string;
    userEmail?: string;
    companyName?: string;
    companyLocation?: string;
    initialPdfSettings?: PdfStyleOptions;
}) {
    const router = useRouter();
    const today = new Date().toLocaleDateString('en-US', { timeZone: 'UTC', year: 'numeric', month: 'long', day: 'numeric' });
    const initialCompany = cleanCompanyName(companyName);
    const initialLoc = cleanCompanyLocation(companyLocation);
    const initialSenderName = userName && userName !== 'My' ? userName : '';
    const initialSenderContact = [userLocation, userPhone, userEmail].filter(Boolean).join('  |  ');

    const [content, setContent] = useState(cleanContent(initialContent));
    const [previousContent, setPreviousContent] = useState<string | undefined>(initialPreviousContent ? cleanContent(initialPreviousContent) : undefined);
    const [isReverting, setIsReverting] = useState(false);
    const [regensUsed, setRegensUsed] = useState(initialRegensUsed);
    const [tone, setTone] = useState(initialTone || 'Confident and strategic');
    const [isLoading, setIsLoading] = useState(false);
    const [isSavingPref, setIsSavingPref] = useState(false);
    const [savedPref, setSavedPref] = useState(false);
    const [error, setError] = useState('');
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

    // Custom prompt state
    const [showCustomPrompt, setShowCustomPrompt] = useState(false);
    const [customPrompt, setCustomPrompt] = useState('');
    const customPromptInputRef = useRef<HTMLInputElement>(null);
    const MAX_CUSTOM_CHARS = 200;

    // Document header & footer fields
    const [headerDate, setHeaderDate] = useState(today);
    const [recipientDept, setRecipientDept] = useState('Recruiting Department');
    const [customCompany, setCustomCompany] = useState(initialCompany);
    const [customLocation, setCustomLocation] = useState(initialLoc || '');
    const [salutation, setSalutation] = useState('Dear Recruiting Team,');
    const [signOff, setSignOff] = useState('Sincerely,');
    const [senderName, setSenderName] = useState(initialSenderName);
    const [senderContact, setSenderContact] = useState(initialSenderContact);

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
                if (data && data.coverLetterPdfTemplate) {
                    setPdfSettings({
                        template: data.coverLetterPdfTemplate,
                        fontFamily: data.coverLetterPdfFontFamily,
                        fontSize: data.coverLetterPdfFontSize,
                        lineHeight: data.coverLetterPdfLineHeight,
                        primaryColor: data.coverLetterPdfPrimaryColor,
                        textColor: data.coverLetterPdfTextColor,
                        margin: data.coverLetterPdfMargin,
                        headerLayout: data.coverLetterPdfHeaderLayout,
                    });
                }
            })
            .catch(err => console.error("Could not fetch cover letter PDF settings:", err));

        return () => {
            window.removeEventListener('theme-color-change', handleGlobalColorChange);
        };
    }, []);
    
    // Edit states
    const [isEditing, setIsEditing] = useState(false);
    const [editContent, setEditContent] = useState(cleanContent(initialContent));
    const [editHeaderDate, setEditHeaderDate] = useState(headerDate);
    const [editRecipientDept, setEditRecipientDept] = useState(recipientDept);
    const [editCompanyName, setEditCompanyName] = useState(customCompany);
    const [editCompanyLocation, setEditCompanyLocation] = useState(customLocation);
    const [editSalutation, setEditSalutation] = useState(salutation);
    const [editSignOff, setEditSignOff] = useState(signOff);
    const [editSenderName, setEditSenderName] = useState(senderName);
    const [editSenderContact, setEditSenderContact] = useState(senderContact);
    const [isSaving, setIsSaving] = useState(false);

    const isPro = planTier === 'PRO';
    const regensLeft = 5 - regensUsed;

    const startEditing = () => {
        setEditContent(cleanContent(content));
        setEditHeaderDate(headerDate);
        setEditRecipientDept(recipientDept);
        setEditCompanyName(customCompany);
        setEditCompanyLocation(customLocation);
        setEditSalutation(salutation);
        setEditSignOff(signOff);
        setEditSenderName(senderName);
        setEditSenderContact(senderContact);
        setIsEditing(true);
    };

    const [showJitModal, setShowJitModal] = useState(false);
    const [pendingInstruction, setPendingInstruction] = useState<string>('different');

    const handleRegenerate = async (instruction: string) => {
        if (!isPro || regensLeft <= 0) return;
        setShowCustomPrompt(false);
        setCustomPrompt('');
        setIsLoading(true);
        setError('');
        setSavedPref(false);
        const contentBeforeRegen = content; // snapshot before we start
        if (content) {
            setPreviousContent(content);
        }
        try {
            const res = await fetch(`/api/job/${jobId}/generate-cover-letter`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ instruction, tone }),
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

            const finalContent = cleanContent(newContent).trim();

            // Warn if the AI returned empty or identical content (allocation guard)
            if (!finalContent) {
                setError('The regenerated cover letter appears to be empty. Please try again.');
                if (contentBeforeRegen) {
                    setContent(contentBeforeRegen);
                    setEditContent(contentBeforeRegen);
                }
                return; // don't increment counter
            }

            if (finalContent === contentBeforeRegen?.trim()) {
                setError('Content unchanged — the AI produced the same result. Try a different instruction.');
                return; // don't increment counter for identical output
            }

            // Only increment counter on genuine new content
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
            if (content) {
                setPreviousContent(content);
            }
            setContent(editContent);
            setHeaderDate(editHeaderDate);
            setRecipientDept(editRecipientDept);
            setCustomCompany(editCompanyName);
            setCustomLocation(editCompanyLocation);
            setSalutation(editSalutation);
            setSignOff(editSignOff);
            setSenderName(editSenderName);
            setSenderContact(editSenderContact);
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
                body: JSON.stringify({ assetType: 'coverLetter' }),
            });
            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || 'Failed to revert to previous version');
            }
            const data = await res.json();
            const newCurrent = cleanContent(data.currentContent);
            const newPrevious = cleanContent(data.previousContent);
            setContent(newCurrent);
            setEditContent(newCurrent);
            setPreviousContent(newPrevious);
            router.refresh();
        } catch (err: any) {
            setError(err.message);
        } finally {
            setIsReverting(false);
        }
    };

    const cancelEdit = () => {
        setEditContent(cleanContent(content));
        setIsEditing(false);
        setError('');
    };

    const nameParts = (senderName || '').split(' ');
    const senderFirstName = nameParts[0] || '';
    const senderLastName = nameParts.slice(1).join(' ') || '';
    const letterBodyHtml = marked.parse(content || '') as string;

    const activePrimaryColor = pdfSettings.primaryColor || selectedColor || '#1e3a8a';
    const activeTextColor = pdfSettings.textColor || '#111827';
    const activeFontFamily = pdfSettings.fontFamily || 'Helvetica, Arial, sans-serif';
    const activeFontSize = pdfSettings.fontSize || '11pt';
    const activeLineHeight = pdfSettings.lineHeight || '1.5';
    const activeMargin = pdfSettings.margin || '0.5in';
    const isHeaderCentered = pdfSettings.headerLayout === 'centered';

    const customCoverLetterHtml = `
    <div style="font-family: ${activeFontFamily}; line-height: ${activeLineHeight}; color: ${activeTextColor}; padding: ${activeMargin}; font-size: ${activeFontSize}; background-color: #ffffff; box-sizing: border-box; width: 100%;">
        <!-- Header: Name left, contact right -->
        <table style="width: 100%; border-bottom: 2px solid ${activePrimaryColor}; padding-bottom: 12px; margin-bottom: 20px;">
            <tr>
                <td style="vertical-align: top; ${isHeaderCentered ? 'text-align: center;' : ''}">
                    ${senderName ? `
                    <span style="font-size: 16pt; font-weight: bold; letter-spacing: 0.04em; font-family: ${activeFontFamily}; text-transform: uppercase;">
                        <span style="color: ${activePrimaryColor};">${senderFirstName}</span>
                        ${senderLastName ? `<span style="color: ${activeTextColor};"> ${senderLastName}</span>` : ''}
                    </span>
                    ` : ''}
                </td>
                <td style="text-align: right; vertical-align: top; font-size: 9pt; color: ${activeTextColor}; opacity: 0.85; line-height: 1.6; font-family: ${activeFontFamily};">
                    ${senderContact ? `<div>${senderContact}</div>` : ''}
                </td>
            </tr>
        </table>

        <!-- Date + recipient block -->
        <div style="margin-bottom: 20px; font-family: ${activeFontFamily}; font-size: 9.5pt; color: ${activeTextColor}; opacity: 0.9; line-height: 1.6; ${isHeaderCentered ? 'text-align: center;' : ''}">
            ${headerDate ? `<div style="margin-bottom: 10px;">${headerDate}</div>` : ''}
            ${recipientDept ? `<div>${recipientDept}</div>` : ''}
            ${customCompany ? `<div>${customCompany}</div>` : ''}
            ${customLocation ? `<div>${customLocation}</div>` : ''}
        </div>

        <!-- Salutation -->
        ${salutation ? `
        <div style="margin-bottom: 15px; font-family: ${activeFontFamily}; font-weight: bold; font-size: 10pt; color: ${activeTextColor};">
            ${salutation}
        </div>
        ` : ''}

        <!-- Body -->
        <div style="font-family: ${activeFontFamily}; font-size: ${activeFontSize}; line-height: ${activeLineHeight}; color: ${activeTextColor};">
            <style>
                h1, h2, h3, h4, h5, h6 { color: ${activePrimaryColor} !important; margin-top: 15px; margin-bottom: 10px; page-break-inside: avoid; break-inside: avoid; }
                p { margin-bottom: 15px; page-break-inside: avoid; break-inside: avoid; color: ${activeTextColor}; }
                ul { margin-bottom: 15px; padding-left: 20px; color: ${activeTextColor}; }
                li { margin-bottom: 5px; page-break-inside: avoid; break-inside: avoid; color: ${activeTextColor}; }
                a { color: ${activePrimaryColor} !important; }
            </style>
            ${letterBodyHtml}
            <div style="margin-top: 30px;">
                ${signOff ? `${signOff}<br />` : ''}
                ${senderName ? `${senderName}<br />` : ''}
            </div>
        </div>
    </div>
    `;

    // Full letter text for copy (includes header)
    const fullLetterText = [
        senderName || '',
        senderContact || '',
        '',
        headerDate || '',
        '',
        recipientDept || '',
        customCompany || '',
        customLocation || '',
        '',
        salutation || '',
        '',
        content || '',
        '',
        signOff || '',
        senderName || '',
    ].filter((line, i, arr) => line !== '' || (i > 0 && arr[i - 1] !== '')).join('\n');

    const inlineInputStyle: React.CSSProperties = {
        background: '#f4f4f5',
        border: '1px solid #d4d4d8',
        borderRadius: '4px',
        padding: '0.35rem 0.6rem',
        fontSize: '0.88rem',
        fontFamily: 'Arial, Helvetica, sans-serif',
        color: '#1a1a1a',
        width: '100%',
        boxSizing: 'border-box',
    };

    return (
        <details className="glass-card" style={{ cursor: 'pointer' }}>
            <summary style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', listStyle: 'none' }}>
                <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--accent-primary)', margin: 0 }}>
                    <CheckCircle size={20} /> Cover Letter
                </h3>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <DownloadPdfButton html={customCoverLetterHtml} filename={`CoverLetter_${(senderName || 'Document').replace(/\s+/g, '_')}.pdf`} type="coverLetter" jobId={jobId} styleOptions={pdfSettings} />
                    <CopyToClipboardButton textToCopy={fullLetterText} />
                    <ChevronDown className="accordion-chevron" size={20} style={{ color: 'var(--text-secondary)' }} />
                </div>
            </summary>
            <div className="asset-card-body" style={{ background: 'var(--bg-color)', padding: '1.5rem', borderRadius: '8px', border: '1px solid var(--border-glass)', marginTop: '1.5rem', cursor: 'auto' }}>
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

                    <Link
                        href="/settings#pdf-styling-cover-letter"
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

                    <div style={{ flexGrow: 1 }} />

                    {!isEditing && (
                        <button
                            onClick={startEditing}
                            className="btn-outline"
                            style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
                        >
                            <Edit2 size={14} /> Edit Cover Letter
                        </button>
                    )}
                </div>

                {/* Letter Document Paper */}
                <div className="cover-letter-document" style={{
                    background: '#fff',
                    color: '#1a1a1a',
                    borderRadius: '6px',
                    padding: '2.5rem 3rem',
                    fontFamily: 'Arial, Helvetica, sans-serif',
                    fontSize: '0.95rem',
                    lineHeight: 1.7,
                    marginBottom: '1.5rem',
                    boxShadow: '0 4px 24px rgba(0,0,0,0.18)',
                    border: '1px solid rgba(0,0,0,0.08)',
                }}>

                    {isEditing ? (
                        /* EDIT MODE */
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                            {/* Header row edit */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', paddingBottom: '1.25rem', borderBottom: '2px solid #e0e0e0' }}>
                                <div style={{ flex: '1 1 200px' }}>
                                    <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#666', display: 'block', marginBottom: '0.2rem' }}>Sender Name</label>
                                    <input
                                        type="text"
                                        value={editSenderName}
                                        onChange={(e) => setEditSenderName(e.target.value)}
                                        placeholder="Your Name"
                                        style={inlineInputStyle}
                                    />
                                </div>
                                <div style={{ flex: '1 1 200px', textAlign: 'right' }}>
                                    <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#666', display: 'block', marginBottom: '0.2rem' }}>Contact Info</label>
                                    <input
                                        type="text"
                                        value={editSenderContact}
                                        onChange={(e) => setEditSenderContact(e.target.value)}
                                        placeholder="Location | Phone | Email"
                                        style={{ ...inlineInputStyle, textAlign: 'right' }}
                                    />
                                </div>
                            </div>

                            {/* Recipient block edit */}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem' }}>
                                <div>
                                    <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#666', display: 'block', marginBottom: '0.2rem' }}>Date</label>
                                    <input
                                        type="text"
                                        value={editHeaderDate}
                                        onChange={(e) => setEditHeaderDate(e.target.value)}
                                        placeholder="Date"
                                        style={inlineInputStyle}
                                    />
                                </div>
                                <div>
                                    <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#666', display: 'block', marginBottom: '0.2rem' }}>Department</label>
                                    <input
                                        type="text"
                                        value={editRecipientDept}
                                        onChange={(e) => setEditRecipientDept(e.target.value)}
                                        placeholder="Recruiting Department"
                                        style={inlineInputStyle}
                                    />
                                </div>
                                <div>
                                    <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#666', display: 'block', marginBottom: '0.2rem' }}>Company Name</label>
                                    <input
                                        type="text"
                                        value={editCompanyName}
                                        onChange={(e) => setEditCompanyName(e.target.value)}
                                        placeholder="Company Name"
                                        style={inlineInputStyle}
                                    />
                                </div>
                                <div>
                                    <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#666', display: 'block', marginBottom: '0.2rem' }}>Company Location</label>
                                    <input
                                        type="text"
                                        value={editCompanyLocation}
                                        onChange={(e) => setEditCompanyLocation(e.target.value)}
                                        placeholder="City, State (leave blank if remote)"
                                        style={inlineInputStyle}
                                    />
                                </div>
                            </div>

                            {/* Salutation edit */}
                            <div>
                                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#666', display: 'block', marginBottom: '0.2rem' }}>Salutation</label>
                                <input
                                    type="text"
                                    value={editSalutation}
                                    onChange={(e) => setEditSalutation(e.target.value)}
                                    placeholder="Dear Hiring Team,"
                                    style={inlineInputStyle}
                                />
                            </div>

                            {/* Body edit */}
                            <div>
                                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#666', display: 'block', marginBottom: '0.2rem' }}>Letter Body</label>
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
                                        fontSize: '0.9rem',
                                        resize: 'vertical',
                                        boxSizing: 'border-box',
                                    }}
                                />
                            </div>

                            {/* Sign-off & Signature Name edit */}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem' }}>
                                <div>
                                    <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#666', display: 'block', marginBottom: '0.2rem' }}>Sign-off</label>
                                    <input
                                        type="text"
                                        value={editSignOff}
                                        onChange={(e) => setEditSignOff(e.target.value)}
                                        placeholder="Sincerely,"
                                        style={inlineInputStyle}
                                    />
                                </div>
                                <div>
                                    <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#666', display: 'block', marginBottom: '0.2rem' }}>Signature Name</label>
                                    <input
                                        type="text"
                                        value={editSenderName}
                                        onChange={(e) => setEditSenderName(e.target.value)}
                                        placeholder="Your Name"
                                        style={inlineInputStyle}
                                    />
                                </div>
                            </div>
                            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
                                <button onClick={cancelEdit} className="btn-outline" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                    <X size={16} /> Cancel
                                </button>
                                <button onClick={handleSaveEdit} disabled={isSaving} className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                    {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Save Changes
                                </button>
                            </div>
                        </div>
                    ) : (
                        /* VIEW MODE */
                        <div 
                            className="custom-coverletter-preview-container"
                            style={{ 
                                background: '#ffffff', 
                                borderRadius: '6px', 
                                border: '1px solid var(--border-glass)', 
                                overflow: 'hidden', 
                                boxShadow: '0 4px 16px rgba(0, 0, 0, 0.15)'
                            }}
                            dangerouslySetInnerHTML={{ __html: customCoverLetterHtml }}
                        />
                    )}
                </div>

                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1.5rem', marginBottom: '1.5rem' }}>
                    <CopyToClipboardButton textToCopy={fullLetterText} label="Copy Text" />
                    <DownloadPdfButton html={customCoverLetterHtml} filename={`CoverLetter_${(senderName || 'Document').replace(/\s+/g, '_')}.pdf`} label="Download PDF" type="coverLetter" jobId={jobId} styleOptions={pdfSettings} />
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
                            placeholder='e.g. "Emphasize my Python experience at Acme Corp"'
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
                title="Upload Base Resume to Generate Cover Letter"
                description="Please upload or paste your base resume so the AI can pull your experience and metrics to write a tailored cover letter."
            />
        </details>
    );
}
