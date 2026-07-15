"use client";

import { useState, useEffect } from 'react';
import { Database, Key, Bot, Search, Layout, FileText, Save } from 'lucide-react';
import Link from 'next/link';

export default function SettingsPage() {
    const [settings, setSettings] = useState<any>({});
    const [saving, setSaving] = useState(false);
    const [loading, setLoading] = useState(true);

    const isSupabaseConfigured = !!process.env.NEXT_PUBLIC_SUPABASE_URL;
    const isAnthropicConfigured = !!process.env.NEXT_PUBLIC_ANTHROPIC_API_KEY || true; // Server-side env vars not exposed, mock for now
    const isRapidAPIConfigured = true; // Server-side env vars not exposed, mock for now

    useEffect(() => {
        fetch('/api/settings', { cache: 'no-store' })
            .then(res => res.json())
            .then(data => {
                setSettings(data);
                setLoading(false);
            })
            .catch(() => setLoading(false));
    }, []);

    const handleChange = (key: string, value: any) => {
        setSettings({ ...settings, [key]: value });
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            await fetch('/api/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(settings)
            });
            alert('Settings saved successfully!');
            // Dispatch event for theme update
            window.dispatchEvent(new Event('settingsUpdated'));
        } catch (e) {
            alert('Failed to save settings');
        } finally {
            setSaving(false);
        }
    };

    if (loading) return <div style={{ padding: '2rem' }}>Loading settings...</div>;

    return (
        <div className="animate-fade-in" style={{ paddingBottom: '4rem', maxWidth: '800px' }}>
            <div style={{ marginBottom: '3rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                    <h1 className="page-title">Settings</h1>
                    <p className="page-subtitle">Manage your connections and AI agent preferences</p>
                </div>
                <button 
                    onClick={handleSave} 
                    disabled={saving}
                    className="btn-primary" 
                    style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                >
                    <Save size={18} />
                    {saving ? 'Saving...' : 'Save Settings'}
                </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                
                {/* Global Preferences */}
                <div className="glass-card">
                    <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem' }}>
                        <Layout size={20} className="text-accent" /> Global Preferences
                    </h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                            <label style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>UI Theme</label>
                            <select 
                                value={settings.theme || 'light'} 
                                onChange={(e) => handleChange('theme', e.target.value)}
                                style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)', padding: '0.75rem', borderRadius: '8px' }}
                            >
                                <option value="dark">Dark Mode</option>
                                <option value="light">Light Mode</option>
                            </select>
                        </div>
                    </div>
                </div>

                {/* Job Discovery */}
                <div className="glass-card">
                    <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem' }}>
                        <Search size={20} className="text-accent" /> Job Discovery
                    </h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                        <div style={{ display: 'flex', gap: '1rem' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', flex: 1 }}>
                                <label style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Search Keyword</label>
                                <input 
                                    type="text"
                                    value={settings.searchKeyword || ''}
                                    onChange={(e) => handleChange('searchKeyword', e.target.value)}
                                    style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)', padding: '0.75rem', borderRadius: '8px' }}
                                />
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', flex: 1 }}>
                                <label style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Search Location</label>
                                <input 
                                    type="text"
                                    value={settings.searchLocation || ''}
                                    onChange={(e) => handleChange('searchLocation', e.target.value)}
                                    style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)', padding: '0.75rem', borderRadius: '8px' }}
                                />
                            </div>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', paddingTop: '1rem', borderTop: '1px solid var(--border-glass)' }}>
                            <label style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Active Scraper Sources</label>
                            <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
                                {['jsearch', 'weworkremotely', 'remoteco', 'remoteok', 'workingnomads', 'remotive', 'greenhouse', 'lever', 'ashby', 'workable', 'smartrecruiters', 'breezy'].map(source => (
                                    <label key={source} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                                        <input 
                                            type="checkbox" 
                                            checked={settings.sources?.[source] || false}
                                            onChange={(e) => {
                                                const newSources = { ...settings.sources, [source]: e.target.checked };
                                                handleChange('sources', newSources);
                                            }}
                                            style={{ cursor: 'pointer' }}
                                        />
                                        <span style={{ textTransform: 'capitalize' }}>
                                            {source === 'jsearch' ? 'JSearch (Indeed, LinkedIn, Glassdoor, ZipRecruiter)' : source}
                                        </span>
                                    </label>
                                ))}
                            </div>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                            <label style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Custom Career Pages (Greenhouse, Lever, Ashby, Workable, SmartRecruiters, Breezy)</label>
                            <textarea 
                                value={(settings.customCareerPages || []).join('\n')}
                                onChange={(e) => {
                                    const urls = e.target.value.split('\n').filter(u => u.trim() !== '');
                                    handleChange('customCareerPages', urls);
                                }}
                                placeholder="https://boards.greenhouse.io/anthropic&#10;https://jobs.lever.co/openai"
                                style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)', padding: '0.75rem', borderRadius: '8px', minHeight: '100px', resize: 'vertical', fontFamily: 'monospace' }}
                            />
                            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Put each URL on a new line. These bypass the generic Search Keyword and directly scrape the company page.</span>
                        </div>
                    </div>
                </div>

                {/* AI Configuration */}
                <div className="glass-card">
                    <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem' }}>
                        <Bot size={20} className="text-accent" /> AI Generation Preferences
                    </h3>
                    
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                            <label style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>AI Strictness</label>
                            <select 
                                value={settings.aiStrictness || 'Standard'}
                                onChange={(e) => handleChange('aiStrictness', e.target.value)}
                                style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)', padding: '0.75rem', borderRadius: '8px' }}
                            >
                                <option value="Strict">Strict (Focus purely on exact match facts)</option>
                                <option value="Standard">Standard (Balanced professional tone)</option>
                                <option value="Creative">Creative (More aggressive sales pitch)</option>
                            </select>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <label style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Resume Customization Maximum</label>
                                <span style={{ color: 'var(--accent-primary)', fontWeight: 600 }}>{settings.resumeCustomizationMaxPercentage || 50}%</span>
                            </div>
                            <input 
                                type="range" 
                                min="0" 
                                max="100" 
                                value={settings.resumeCustomizationMaxPercentage || 50}
                                onChange={(e) => handleChange('resumeCustomizationMaxPercentage', Number(e.target.value))}
                                style={{ width: '100%' }}
                            />
                            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Limits how much of your base resume the AI is allowed to rewrite.</span>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                            <label style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', display: 'flex', justifyContent: 'space-between' }}>
                                Target Profile & Scoring Rubric
                            </label>
                            <textarea 
                                value={settings.profile || ''}
                                onChange={(e) => handleChange('profile', e.target.value)}
                                style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)', padding: '0.75rem', borderRadius: '8px', minHeight: '200px', resize: 'vertical', fontFamily: 'monospace', fontSize: '0.9rem' }}
                            />
                            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>This exact text is used by the AI to score and rank jobs. Update it to reflect what you truly care about.</span>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', paddingTop: '1rem', borderTop: '1px solid var(--border-glass)' }}>
                            <label style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Base Assets</label>
                            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>To update the base resume the AI uses as a template, use the Assets editor.</p>
                            <Link href="/assets" className="btn-outline" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', width: 'fit-content' }}>
                                <FileText size={16} /> Manage Base Resume
                            </Link>
                        </div>
                    </div>
                </div>

                {/* API Connections */}
                <div className="glass-card">
                    <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem' }}>
                        <Database size={20} className="text-accent" /> API Connections
                    </h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        <ConnectionRow name="Supabase Database" status={isSupabaseConfigured ? 'Connected' : 'Missing'} connected={isSupabaseConfigured} />
                        <ConnectionRow name="Anthropic (Claude AI)" status={isAnthropicConfigured ? 'Connected' : 'Missing'} connected={isAnthropicConfigured} />
                        <ConnectionRow name="RapidAPI (JSearch)" status={isRapidAPIConfigured ? 'Connected' : 'Missing'} connected={isRapidAPIConfigured} />
                    </div>
                </div>

            </div>
        </div>
    );
}

function ConnectionRow({ name, status, connected }: { name: string, status: string, connected: boolean }) {
    return (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem', background: 'rgba(255,255,255,0.02)', borderRadius: '8px', border: '1px solid var(--border-glass)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <Key size={16} color="var(--text-secondary)" />
                <span style={{ fontSize: '0.95rem' }}>{name}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: connected ? '#10b981' : '#ef4444' }} />
                <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>{status}</span>
            </div>
        </div>
    );
}
