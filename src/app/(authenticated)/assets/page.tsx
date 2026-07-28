"use client";

import { useEffect, useState, useRef } from 'react';
import { Save, FileText, Upload, Clipboard, Target } from 'lucide-react';

export default function AssetsPage() {
    const [content, setContent] = useState('');
    const [profile, setProfile] = useState('');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        fetch('/api/assets/base')
            .then(res => res.json())
            .then(data => {
                if (data.content !== undefined) setContent(data.content);
                if (data.profile !== undefined) setProfile(data.profile);
                setLoading(false);
            })
            .catch(console.error);
    }, []);

    useEffect(() => {
        if (!loading && typeof window !== 'undefined' && window.location.hash === '#target-profile') {
            const el = document.getElementById('target-profile');
            if (el) {
                el.scrollIntoView({ behavior: 'smooth' });
            }
        }
    }, [loading]);

    const handleSave = async () => {
        setSaving(true);
        try {
            const res = await fetch('/api/assets/base', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content, profile })
            });
            if (res.ok) {
                alert('Target profile and base resume saved successfully!');
            } else {
                throw new Error('Failed to save');
            }
        } catch (e: any) {
            console.error(e);
            alert('Error saving profile.');
        } finally {
            setSaving(false);
        }
    };

    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setLoading(true);
        const formData = new FormData();
        formData.append('file', file);

        try {
            const res = await fetch('/api/parse-resume', {
                method: 'POST',
                body: formData
            });
            const data = await res.json();
            if (res.ok && data.markdown) {
                setContent(data.markdown);
            } else {
                throw new Error(data.error || 'Failed to parse resume');
            }
        } catch (err: any) {
            console.error(err);
            alert(err.message || 'Error parsing file.');
        } finally {
            setLoading(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const handlePaste = async () => {
        try {
            const text = await navigator.clipboard.readText();
            if (text) {
                setContent(text);
            }
        } catch (err) {
            console.error('Failed to read clipboard', err);
            alert('Could not read from clipboard. Please ensure you have granted permission, or manually paste into the text area.');
        }
    };

    if (loading) return <div style={{ padding: '2rem' }}>Loading profile...</div>;

    return (
        <div className="animate-fade-in" style={{ paddingBottom: '4rem', display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                    <h1 className="page-title">My Profile</h1>
                    <p className="page-subtitle">Manage your target profile, scoring rubric, and base resume used by AI automation.</p>
                </div>
                <button 
                    onClick={handleSave} 
                    disabled={saving}
                    className="btn-primary" 
                    style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                >
                    <Save size={18} />
                    {saving ? 'Saving...' : 'Save Changes'}
                </button>
            </div>

            {/* Target Profile & Scoring Rubric Section (Above Base Resume) */}
            <div className="glass-card" id="target-profile" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }} data-tour="target-profile">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--accent-primary)', margin: 0 }}>
                        <Target size={20} /> Target Profile & Scoring Rubric
                    </h3>
                </div>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: 0 }}>
                    This exact text is used by the AI to score and rank jobs. Update it to reflect what you truly care about in your target roles.
                </p>
                <textarea
                    value={profile}
                    onChange={(e) => setProfile(e.target.value)}
                    placeholder="Enter target job titles, key skills, industry preferences, and scoring rubric..."
                    style={{
                        width: '100%',
                        minHeight: '200px',
                        background: 'rgba(0,0,0,0.2)',
                        border: '1px solid var(--border-glass)',
                        borderRadius: '8px',
                        color: 'var(--text-primary)',
                        padding: '1rem',
                        fontSize: '0.9rem',
                        resize: 'vertical'
                    }}
                />
            </div>

            {/* Base Resume Section */}
            <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }} data-tour="assets-editor">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--accent-primary)', margin: 0 }}>
                        <FileText size={20} /> Base Resume
                    </h3>
                    <div style={{ display: 'flex', gap: '0.5rem' }} data-tour="assets-upload">
                        <button 
                            onClick={() => fileInputRef.current?.click()}
                            className="btn-outline"
                            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                        >
                            <Upload size={16} /> Upload PDF/DOC
                        </button>
                        <input 
                            type="file" 
                            accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" 
                            style={{ display: 'none' }} 
                            ref={fileInputRef}
                            onChange={handleFileUpload}
                        />
                        <button 
                            onClick={handlePaste}
                            className="btn-outline"
                            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                        >
                            <Clipboard size={16} /> Paste
                        </button>
                    </div>
                </div>
                <textarea
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    placeholder="Paste or write your base resume in Markdown..."
                    style={{
                        width: '100%',
                        minHeight: '450px',
                        background: 'rgba(0,0,0,0.2)',
                        border: '1px solid var(--border-glass)',
                        borderRadius: '8px',
                        color: 'var(--text-primary)',
                        padding: '1.5rem',
                        fontSize: '0.95rem',
                        resize: 'vertical'
                    }}
                />
            </div>
        </div>
    );
}
