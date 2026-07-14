"use client";

import { useEffect, useState } from 'react';
import { Save, FileText } from 'lucide-react';

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

            <div className="glass-card" style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--accent-primary)' }}>
                    <FileText size={20} /> base_resume.md
                </h3>
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
