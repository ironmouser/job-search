"use client";

import { useEffect, useState, useRef } from 'react';
import { Save, FileText, Upload, Clipboard } from 'lucide-react';

export default function AssetsPage() {
    const [content, setContent] = useState('');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        fetch('/api/assets/base')
            .then(res => res.json())
            .then(data => {
                if (data.content) setContent(data.content);
                setLoading(false);
            })
            .catch(console.error);
    }, []);

    const handleSave = async () => {
        setSaving(true);
        try {
            const res = await fetch('/api/assets/base', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content })
            });
            if (res.ok) {
                alert('Base resume saved successfully!');
            } else {
                throw new Error('Failed to save');
            }
        } catch (e: any) {
            console.error(e);
            alert('Error saving base resume.');
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

    if (loading) return <div style={{ padding: '2rem' }}>Loading assets...</div>;

    return (
        <div className="animate-fade-in" style={{ paddingBottom: '4rem', height: '100%', display: 'flex', flexDirection: 'column' }}>
            <div style={{ marginBottom: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                    <h1 className="page-title">Base Assets</h1>
                    <p className="page-subtitle">Manage your base resume. Claude uses this context to generate tailored assets.</p>
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

            <div className="glass-card" style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '1rem' }} data-tour="assets-editor">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--accent-primary)' }}>
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
                    style={{
                        flex: 1,
                        width: '100%',
                        minHeight: '500px',
                        background: 'rgba(0,0,0,0.2)',
                        border: '1px solid var(--border-glass)',
                        borderRadius: '8px',
                        color: 'var(--text-primary)',
                        padding: '1.5rem',
                        fontFamily: 'monospace',
                        fontSize: '0.95rem',
                        resize: 'vertical'
                    }}
                />
            </div>
        </div>
    );
}
