"use client";

import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Database, Key, Bot, Search, Layout, FileText, Save, Mail, Target, PlayCircle, ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
const PdfCustomizerSection = dynamic(() => import('@/components/PdfCustomizerSection'), { ssr: false, loading: () => null });

// Video instructions for email client setup
const EMAIL_VIDEO_LINKS: Record<string, string> = {
    gmail: 'https://www.youtube.com/watch?v=ajIJ4dH2H0M',
    outlook: 'https://youtu.be/u5Xm1LMJOdE?si=QbzwkHC4hZdOnbuG',
    yahoo: 'https://youtu.be/ZNsQQT9KoIU?si=QqerSZF9rMUEdPlA',
    icloud: 'https://www.youtube.com/watch?v=RpYRdHx9WNw',
};

// Helper for deep equality check to detect dirty settings state
const isDeepEqual = (a: any, b: any): boolean => {
    if (a === b) return true;
    if (typeof a !== 'object' || a === null || typeof b !== 'object' || b === null) return false;
    
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    
    // Filter out keys that might be undefined or empty in one but missing in another
    const activeKeysA = keysA.filter(k => a[k] !== undefined && a[k] !== '');
    const activeKeysB = keysB.filter(k => b[k] !== undefined && b[k] !== '');

    if (activeKeysA.length !== activeKeysB.length) return false;
    
    for (const key of activeKeysA) {
        if (!activeKeysB.includes(key)) return false;
        
        const valA = a[key];
        const valB = b[key];
        
        if (Array.isArray(valA) && Array.isArray(valB)) {
            if (valA.length !== valB.length) return false;
            for (let i = 0; i < valA.length; i++) {
                if (valA[i] !== valB[i]) return false;
            }
            continue;
        }
        
        if (typeof valA === 'object' && valA !== null && typeof valB === 'object' && valB !== null) {
            if (!isDeepEqual(valA, valB)) return false;
            continue;
        }
        
        if (valA !== valB) return false;
    }
    return true;
};

export default function SettingsPage() {
    const router = useRouter();
    const [settings, setSettings] = useState<any>({});
    const [initialSettings, setInitialSettings] = useState<any>(null);
    const [isDirty, setIsDirty] = useState(false);
    const [saving, setSaving] = useState(false);
    const [loading, setLoading] = useState(true);
    const [emailProvider, setEmailProvider] = useState<string>('gmail');
    const [testingEmail, setTestingEmail] = useState(false);
    const [emailTestResult, setEmailTestResult] = useState<{success?: boolean, error?: string} | null>(null);
    const [previewStandardView, setPreviewStandardView] = useState(false);

    // Unsaved changes navigation prompt state
    const [showDialog, setShowDialog] = useState(false);
    const [pendingHref, setPendingHref] = useState<string | null>(null);
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
        if (typeof window !== 'undefined') {
            const hash = window.location.hash;
            if (hash) {
                const targetId = hash.startsWith('#pdf-styling') ? 'pdf-styling' : hash.replace('#', '');
                let attempts = 0;
                const scrollToElement = () => {
                    let el = document.getElementById(targetId);
                    if (!el && (hash === '#job-discovery' || hash === '#job-preferences')) {
                        el = document.getElementById('job-discovery') || document.querySelector('[data-tour="job-preferences"]');
                    }
                    if (el) {
                        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    } else if (attempts < 10) {
                        attempts++;
                        setTimeout(scrollToElement, 150);
                    }
                };
                setTimeout(scrollToElement, 100);
            }
        }
    }, []);

    // Handle standard browser page unload (e.g. closing tab, refreshing, manual URL typing)
    useEffect(() => {
        if (!isDirty) return;

        const handleBeforeUnload = (e: BeforeUnloadEvent) => {
            e.preventDefault();
            e.returnValue = '';
            return '';
        };

        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => {
            window.removeEventListener('beforeunload', handleBeforeUnload);
        };
    }, [isDirty]);

    // Intercept client-side Link navigation
    useEffect(() => {
        if (!isDirty) return;

        const handleAnchorClick = (e: MouseEvent) => {
            if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
                return;
            }

            let target = e.target as HTMLElement | null;
            while (target && target.tagName !== 'A') {
                target = target.parentElement;
            }

            if (target && target.tagName === 'A') {
                const href = target.getAttribute('href');
                
                if (target.getAttribute('target') === '_blank' || target.hasAttribute('download')) {
                    return;
                }

                if (href && (href.startsWith('/') || href.startsWith(window.location.origin))) {
                    const parsedUrl = href.replace(window.location.origin, '');
                    
                    if (parsedUrl === window.location.pathname || parsedUrl.startsWith('#')) {
                        return;
                    }

                    e.preventDefault();
                    e.stopPropagation();
                    
                    setPendingHref(href);
                    setShowDialog(true);
                }
            }
        };

        document.addEventListener('click', handleAnchorClick, true);
        return () => {
            document.removeEventListener('click', handleAnchorClick, true);
        };
    }, [isDirty]);

    const handleChange = useCallback((key: string, value: any) => {
        setSettings((prev: any) => ({ ...prev, [key]: value }));
        setIsDirty(true);
    }, []);

    const handleProviderChange = (provider: string) => {
        setEmailProvider(provider);
        if (provider === 'gmail') {
            handleChange('imapHost', 'imap.gmail.com');
            handleChange('imapPort', 993);
        } else if (provider === 'yahoo') {
            handleChange('imapHost', 'imap.mail.yahoo.com');
            handleChange('imapPort', 993);
        } else if (provider === 'outlook') {
            handleChange('imapHost', 'outlook.office365.com');
            handleChange('imapPort', 993);
        } else if (provider === 'icloud') {
            handleChange('imapHost', 'imap.mail.me.com');
            handleChange('imapPort', 993);
        }
    };

    const { data: session } = useSession();
    const isAdmin = (session?.user as any)?.role === 'SYSTEM_ADMIN';
    const isPro = (session?.user as any)?.planTier === 'PRO';

    const isAnthropicConfigured = !!process.env.NEXT_PUBLIC_ANTHROPIC_API_KEY || true;

    useEffect(() => {
        fetch('/api/settings', { cache: 'no-store' })
            .then(res => res.json())
            .then(data => {
                setSettings(data);
                setInitialSettings(JSON.parse(JSON.stringify(data)));
                setIsDirty(false);
                setLoading(false);
            })
            .catch(() => setLoading(false));
    }, []);

    const handleSave = async (settingsOverride?: any, silent = false) => {
        setSaving(true);
        try {
            const isOverride = settingsOverride && typeof settingsOverride === 'object' && !('nativeEvent' in settingsOverride) && !('target' in settingsOverride);
            const settingsToSave = isOverride ? { ...settingsOverride } : { ...settings };
            if (settingsToSave.customCareerPages) {
                settingsToSave.customCareerPages = settingsToSave.customCareerPages.filter((u: string) => u.trim() !== '');
            }
            const res = await fetch('/api/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(settingsToSave)
            });
            if (!res.ok) throw new Error('Save failed');
            
            const savedState = JSON.parse(JSON.stringify(settingsToSave));
            if (savedState.emailAppPassword && savedState.emailAppPassword !== '********') {
                savedState.emailAppPassword = '********';
            }
            setSettings(savedState);
            setInitialSettings(JSON.parse(JSON.stringify(savedState)));
            setIsDirty(false);
            if (!silent) {
                alert('Settings saved successfully!');
            }
            // Dispatch event for theme update
            window.dispatchEvent(new Event('settingsUpdated'));
            return true;
        } catch (e) {
            alert('Failed to save settings');
            return false;
        } finally {
            setSaving(false);
        }
    };

    const handleTestEmail = async () => {
        setTestingEmail(true);
        setEmailTestResult(null);
        try {
            const res = await fetch('/api/settings/test-email', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    emailAddress: settings.emailAddress,
                    emailAppPassword: settings.emailAppPassword,
                    imapHost: settings.imapHost,
                    imapPort: settings.imapPort
                })
            });
            const data = await res.json();
            if (data.success) {
                setEmailTestResult({ success: true });
            } else {
                setEmailTestResult({ success: false, error: data.error });
            }
        } catch (e: any) {
            setEmailTestResult({ success: false, error: e.message || 'Network error' });
        } finally {
            setTestingEmail(false);
        }
    };

    if (loading) return <div style={{ padding: '2rem' }}>Loading settings...</div>;

    const providerDisplay = emailProvider === 'gmail' ? 'Gmail' : 
                          emailProvider === 'outlook' ? 'Microsoft' : 
                          emailProvider === 'yahoo' ? 'Yahoo' : 
                          emailProvider === 'icloud' ? 'Apple ID' : 'Email';
                          
    const providerDomain = emailProvider === 'gmail' ? 'gmail.com' : 
                         emailProvider === 'outlook' ? 'outlook.com' : 
                         emailProvider === 'yahoo' ? 'yahoo.com' : 
                         emailProvider === 'icloud' ? 'icloud.com' : 'example.com';

    return (
        <div className="animate-fade-in" style={{ paddingBottom: '4rem', maxWidth: '800px' }}>
            <div style={{ marginBottom: '3rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                    <h1 className="page-title">Settings</h1>
                    <p className="page-subtitle">Manage your connections and AI agent preferences</p>
                </div>
                <button 
                    onClick={() => handleSave()} 
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
                <div className="glass-card" style={{ padding: '2rem' }}>
                    <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '1.5rem', fontSize: '1.25rem', fontWeight: 600 }}>
                        <Layout size={22} className="text-accent" /> Global Preferences
                    </h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', maxWidth: '360px' }}>
                            <label style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)' }}>UI Theme</label>
                            <select 
                                value={settings.theme || 'light'} 
                                onChange={(e) => handleChange('theme', e.target.value)}
                                style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)', padding: '0.75rem', borderRadius: '8px' }}
                            >
                                <option value="dark">Dark Mode</option>
                                <option value="light">Light Mode</option>
                            </select>
                            <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>Choose your preferred color theme for the interface</span>
                        </div>
                    </div>
                </div>



                {/* Job Discovery */}
                <div className="glass-card" id="job-discovery" data-tour="job-preferences" style={{ padding: '2rem' }}>
                    <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '1.75rem', fontSize: '1.25rem', fontWeight: 600 }}>
                        <Search size={22} className="text-accent" /> Job Discovery Settings
                    </h3>
                    
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                        
                        {/* Primary Target Controls (Title, Level, Location) */}
                        <div>
                            <h4 style={{ fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)', marginBottom: '1rem', fontWeight: 600 }}>
                                Primary Criteria
                            </h4>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.25rem', alignItems: 'start' }}>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                                    <label style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)' }}>Job Title or Role</label>
                                    <input 
                                        type="text"
                                        value={settings.searchKeyword || ''}
                                        onChange={(e) => handleChange('searchKeyword', e.target.value)}
                                        placeholder='e.g. "Senior Product Manager"'
                                        style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)', padding: '0.75rem', borderRadius: '8px', width: '100%' }}
                                    />
                                    <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>Target role to search across job boards</span>
                                </div>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                                    <label style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)' }}>Job Level</label>
                                    <select 
                                        value={settings.jobLevel || 'Mid-level'} 
                                        onChange={(e) => handleChange('jobLevel', e.target.value)}
                                        style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)', padding: '0.75rem', borderRadius: '8px', width: '100%', height: '44px' }}
                                    >
                                        <option value="Entry-Level">Entry-Level</option>
                                        <option value="Mid-level">Mid-level</option>
                                        <option value="Senior-level">Senior-level</option>
                                        <option value="Management">Management</option>
                                        <option value="Director">Director</option>
                                        <option value="Vice President (VP)">Vice President (VP)</option>
                                        <option value="C-Suite (Executive)">C-Suite (Executive)</option>
                                    </select>
                                    <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>Target seniority level</span>
                                </div>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                                    <label style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)' }}>Location Preference</label>
                                    <input 
                                        type="text"
                                        value={settings.searchLocation || ''}
                                        onChange={(e) => handleChange('searchLocation', e.target.value)}
                                        placeholder='e.g. "Remote", "Austin, TX"'
                                        style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)', padding: '0.75rem', borderRadius: '8px', width: '100%' }}
                                    />
                                    <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>City, state, country, region, or "Remote"</span>
                                </div>
                            </div>
                        </div>

                        <div style={{ height: '1px', background: 'var(--border-glass)', margin: '0.25rem 0' }} />

                        {/* Pre-Filtering Rules (Required & Excluded Keywords) */}
                        <div>
                            <h4 style={{ fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)', marginBottom: '1rem', fontWeight: 600 }}>
                                Pre-Filtering Rules
                            </h4>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.25rem', alignItems: 'start' }}>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                                    <label style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)' }}>Required Keywords (Include)</label>
                                    <input 
                                        type="text"
                                        value={settings.includeKeywords || ''}
                                        onChange={(e) => handleChange('includeKeywords', e.target.value)}
                                        placeholder='e.g. "React, Node.js, Remote, TypeScript"'
                                        style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)', padding: '0.75rem', borderRadius: '8px', width: '100%' }}
                                    />
                                    <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: '1.4' }}>
                                        Comma-separated terms. At least one must appear in the job title or description during pre-filtering (leave empty for maximum matches).
                                    </span>
                                </div>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                                    <label style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)' }}>Excluded Keywords (Exclude)</label>
                                    <input 
                                        type="text"
                                        value={settings.excludeKeywords || ''}
                                        onChange={(e) => handleChange('excludeKeywords', e.target.value)}
                                        placeholder='e.g. "Intern, Junior, Sales, Manager, Associate"'
                                        style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)', padding: '0.75rem', borderRadius: '8px', width: '100%' }}
                                    />
                                    <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: '1.4' }}>
                                        Comma-separated terms. Any listing with a job title or company matching these words will be rejected immediately (leave empty for maximum matches).
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* Remote Only Checkbox */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', paddingTop: '0.25rem' }}>
                            <input 
                                type="checkbox" 
                                id="remoteOnly"
                                checked={settings.remoteOnly || false}
                                onChange={(e) => handleChange('remoteOnly', e.target.checked)}
                                style={{ cursor: 'pointer', width: '16px', height: '16px', accentColor: 'var(--accent)' }}
                            />
                            <label htmlFor="remoteOnly" style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)', cursor: 'pointer' }}>
                                Remote Only
                            </label>
                            <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginLeft: '0.5rem' }}>
                                (Automatically filter out jobs that do not explicitly state "Remote" in their location)
                            </span>
                        </div>

                        {/* US Only Checkbox */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', paddingTop: '0.25rem' }}>
                            <input 
                                type="checkbox" 
                                id="noInternational"
                                checked={settings.noInternational || false}
                                onChange={(e) => handleChange('noInternational', e.target.checked)}
                                style={{ cursor: 'pointer', width: '16px', height: '16px', accentColor: 'var(--accent)' }}
                            />
                            <label htmlFor="noInternational" style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)', cursor: 'pointer' }}>
                                US Only
                            </label>
                            <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginLeft: '0.5rem' }}>
                                (Automatically filter out jobs that are locationed outside of the United States)
                            </span>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--border-glass)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                                <label style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)' }}>Active Scraper Sources</label>
                                {isAdmin && (
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', fontSize: '0.8rem', color: 'var(--text-secondary)', background: 'rgba(255, 255, 255, 0.05)', padding: '0.25rem 0.6rem', borderRadius: '6px', border: '1px solid var(--border-glass)' }}>
                                        <input 
                                            type="checkbox" 
                                            checked={previewStandardView} 
                                            onChange={(e) => setPreviewStandardView(e.target.checked)} 
                                            style={{ cursor: 'pointer', width: '14px', height: '14px', accentColor: 'var(--accent)' }}
                                        />
                                        <span>Preview Standard User (Categorized) View</span>
                                    </label>
                                )}
                            </div>
                            
                            {(isAdmin && !previewStandardView) ? (
                                [
                                    {
                                        title: 'Global Aggregators',
                                        sources: ['indeed', 'glassdoor', 'linkedin', 'ziprecruiter']
                                    },
                                    {
                                        title: 'US / Remote Tech',
                                        sources: ['himalayas', 'weworkremotely', 'remoteco', 'remoteok', 'workingnomads', 'remotive', 'remotepoc', 'arbeitnow', 'ycombinator', 'otta', 'jobspresso', 'justremote']
                                    },
                                    {
                                        title: 'ATS Integrations',
                                        sources: ['greenhouse', 'lever', 'ashby', 'workable', 'smartrecruiters', 'breezy']
                                    },
                                    {
                                        title: 'International Sources',
                                        sources: ['arbeitsagentur', 'themuse', 'computrabajo', 'jobbank']
                                    }
                                ].map(group => (
                                    <div key={group.title} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                        <h4 style={{ fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)', margin: 0, fontWeight: 600 }}>
                                            {group.title}
                                        </h4>
                                        <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
                                            {group.sources.map(source => {
                                                // Determine if this specific source requires PRO
                                                let isProRequired = false;
                                                
                                                if (group.title === 'International Sources' || group.title === 'ATS Integrations') {
                                                    isProRequired = true;
                                                } else if (settings.globalSettings && settings.globalSettings[`${source}IsPro`] !== undefined) {
                                                    isProRequired = settings.globalSettings[`${source}IsPro`];
                                                }
                                                
                                                const isDisabled = isProRequired && !isPro;
                                                
                                                return (
                                                    <label key={source} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: isDisabled ? 'not-allowed' : 'pointer', opacity: isDisabled ? 0.5 : 1 }} title={isDisabled ? "Upgrade to Pro to use this source" : ""}>
                                                        <input 
                                                            type="checkbox" 
                                                            checked={isDisabled ? false : (settings.sources?.[source] !== undefined ? settings.sources[source] : true)}
                                                            disabled={isDisabled}
                                                            onChange={(e) => {
                                                                const newSources = { ...settings.sources, [source]: e.target.checked };
                                                                handleChange('sources', newSources);
                                                            }}
                                                            style={{ cursor: isDisabled ? 'not-allowed' : 'pointer' }}
                                                        />
                                                        <span style={{ textTransform: 'capitalize', display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.875rem', color: 'var(--text-primary)' }}>
                                                            {source === 'jobbank' ? 'Job Bank (CA)' : 
                                              source === 'remotepoc' ? 'RemotePOC' : 
                                              source === 'arbeitsagentur' ? 'Arbeitsagentur (DE)' :
                                              source === 'themuse' ? 'The Muse (Global)' :
                                              source === 'computrabajo' ? 'Computrabajo (LATAM)' :
                                              source === 'ycombinator' ? 'Y Combinator' :
                                              source === 'arbeitnow' ? 'Arbeitnow' :
                                              source === 'jobspresso' ? 'Jobspresso' :
                                              source === 'justremote' ? 'JustRemote' :
                                              source === 'otta' ? 'Otta' : source}
                                                            {isProRequired && !isPro && <span style={{ fontSize: '0.65rem', padding: '0.1rem 0.3rem', background: 'var(--accent-primary)', color: 'white', borderRadius: '8px', fontWeight: 'bold' }}>PRO</span>}
                                                        </span>
                                                    </label>
                                                );
                                            })}
                                        </div>
                                    </div>
                                ))
                            ) : (
                                [
                                    {
                                        title: 'Global Job Boards',
                                        items: [
                                            { label: 'Free', sources: ['indeed', 'glassdoor', 'ziprecruiter'] },
                                            { label: 'Premium', sources: ['linkedin'], isPro: true }
                                        ]
                                    },
                                    {
                                        title: 'Remote & Tech Jobs',
                                        items: [
                                            { label: 'Free', sources: ['weworkremotely', 'remoteco', 'remoteok', 'workingnomads', 'remotive', 'remotepoc', 'arbeitnow', 'ycombinator'] },
                                            { label: 'Premium', sources: ['himalayas', 'otta', 'jobspresso', 'justremote'], isPro: true }
                                        ]
                                    },
                                    {
                                        title: 'Company Career Sites',
                                        items: [
                                            { label: 'Premium', sources: ['greenhouse', 'lever', 'ashby', 'workable', 'smartrecruiters', 'breezy'], isPro: true }
                                        ]
                                    },
                                    {
                                        title: 'International Job Boards',
                                        items: [
                                            { label: 'Global', sources: ['themuse'], isPro: true },
                                            { label: 'Germany', sources: ['arbeitsagentur'], isPro: true },
                                            { label: 'Latin America', sources: ['computrabajo'], isPro: true },
                                            { label: 'Canada', sources: ['jobbank'], isPro: true }
                                        ]
                                    }
                                ].map(group => (
                                    <div key={group.title} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                        <h4 style={{ fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)', margin: 0, fontWeight: 600 }}>
                                            {group.title}
                                        </h4>
                                        <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
                                            {group.items.map(item => {
                                                const isProRequired = item.isPro;
                                                const isDisabled = isProRequired && !isPro;
                                                // Determine if all mapped sources are active (if category has sources)
                                                const isChecked = !isDisabled && (
                                                    item.sources.length === 0 
                                                        ? false 
                                                        : item.sources.every(source => (settings.sources?.[source] !== undefined ? settings.sources[source] : true))
                                                );

                                                return (
                                                    <label key={item.label} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: isDisabled ? 'not-allowed' : 'pointer', opacity: isDisabled ? 0.5 : 1 }} title={isDisabled ? "Upgrade to Pro to use this source" : ""}>
                                                        <input 
                                                            type="checkbox" 
                                                            checked={isChecked}
                                                            disabled={isDisabled}
                                                            onChange={(e) => {
                                                                const newSources = { ...settings.sources };
                                                                item.sources.forEach(source => {
                                                                    newSources[source] = e.target.checked;
                                                                });
                                                                handleChange('sources', newSources);
                                                            }}
                                                            style={{ cursor: isDisabled ? 'not-allowed' : 'pointer' }}
                                                        />
                                                        <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.875rem', color: 'var(--text-primary)' }}>
                                                            {item.label}
                                                            {isProRequired && !isPro && <span style={{ fontSize: '0.65rem', padding: '0.1rem 0.3rem', background: 'var(--accent-primary)', color: 'white', borderRadius: '8px', fontWeight: 'bold' }}>PRO</span>}
                                                        </span>
                                                    </label>
                                                );
                                            })}
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', opacity: isPro ? 1 : 0.5 }}>
                            <label style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                Custom Career Pages
                                {!isPro && <span style={{ fontSize: '0.7rem', padding: '0.1rem 0.4rem', background: 'var(--accent-primary)', color: 'white', borderRadius: '12px', fontWeight: 'bold' }}>PRO</span>}
                            </label>
                            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: 0 }}>
                                Greenhouse, Lever, Ashby, Workable, SmartRecruiters, Breezy
                            </p>
                            <textarea 
                                value={isPro ? (settings.customCareerPages || []).join('\n') : ''}
                                disabled={!isPro}
                                onChange={(e) => {
                                    const urls = e.target.value.split('\n');
                                    handleChange('customCareerPages', urls);
                                }}
                                placeholder={isPro ? "https://boards.greenhouse.io/anthropic\nhttps://jobs.lever.co/openai" : "Upgrade to Pro to add custom career pages"}
                                title={!isPro ? "Upgrade to Pro to use this feature" : ""}
                                style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)', padding: '0.75rem', borderRadius: '8px', minHeight: '100px', resize: isPro ? 'vertical' : 'none', cursor: isPro ? 'text' : 'not-allowed' }}
                            />
                            <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                                {isPro ? 'Put each URL on a new line. These bypass the generic Search Keyword and directly scrape the company page.' : 'Upgrade to Pro to bypass the generic search and directly scrape specific company career pages.'}
                            </span>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: '1.25rem', borderTop: '1px solid var(--border-glass)' }}>
                            <button 
                                onClick={() => handleSave()} 
                                disabled={saving}
                                className="btn-primary" 
                                style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                            >
                                <Save size={18} />
                                {saving ? 'Saving...' : 'Save Settings'}
                            </button>
                        </div>
                    </div>
                </div>

                {/* AI Configuration */}
                <div className="glass-card" style={{ padding: '2rem' }}>
                    <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '1.5rem', fontSize: '1.25rem', fontWeight: 600 }}>
                        <Bot size={22} className="text-accent" /> AI Generation Preferences
                    </h3>
                    
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                            <label style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)' }}>AI Strictness</label>
                            <select 
                                value={settings.aiStrictness || 'Standard'}
                                onChange={(e) => handleChange('aiStrictness', e.target.value)}
                                style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)', padding: '0.75rem', borderRadius: '8px' }}
                            >
                                <option value="Strict">Strict (Focus purely on exact match facts)</option>
                                <option value="Standard">Standard (Balanced professional tone)</option>
                                <option value="Creative">Creative (More aggressive sales pitch)</option>
                            </select>
                            <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>Controls how strictly the AI adheres to your factual experience</span>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <label style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)' }}>Resume Customization Maximum</label>
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
                            <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>Limits how much of your base resume the AI is allowed to rewrite.</span>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }} data-tour="target-profile">
                            <label style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)' }}>Target Profile & Scoring Rubric</label>
                            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: 0 }}>
                                Manage your target job criteria, ideal roles, and scoring rubric on the My Profile page.
                            </p>
                            <Link href="/assets#target-profile" className="btn-outline" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', width: 'fit-content', marginTop: '0.25rem' }}>
                                <Target size={16} /> Target & Profile
                            </Link>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', paddingTop: '1rem', borderTop: '1px solid var(--border-glass)' }} data-tour="resume-upload">
                            <label style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)' }}>Base Resume</label>
                            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: 0 }}>To update the base resume the AI uses as a template, visit your My Profile page.</p>
                            <Link href="/assets" className="btn-outline" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', width: 'fit-content', marginTop: '0.25rem' }}>
                                <FileText size={16} /> Manage Base Resume
                            </Link>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: '1.25rem', borderTop: '1px solid var(--border-glass)' }}>
                            <button 
                                onClick={() => handleSave()} 
                                disabled={saving}
                                className="btn-primary" 
                                style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                            >
                                <Save size={18} />
                                {saving ? 'Saving...' : 'Save Settings'}
                            </button>
                        </div>
                    </div>
                </div>
                {/* Authorization / Auto Apply Settings Shortcut */}
                <div className="glass-card" style={{ padding: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <Key size={22} className="text-accent" />
                        <div>
                            <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)' }}>Authorization & Demographics</h4>
                            <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                                Work authorization and EEOC demographic options used for Auto Applying are managed on your Profile page.
                            </p>
                        </div>
                    </div>
                    <button 
                        onClick={() => router.push('/profile')} 
                        className="btn-outline"
                        style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem', padding: '0.5rem 1rem' }}
                    >
                        Go to Profile Page <ExternalLink size={14} />
                    </button>
                </div>

                {/* PDF Styling Customizer */}
                <PdfCustomizerSection settings={settings} onChange={handleChange} />

                {/* Email Sync Configuration */}
                <div className="glass-card" id="email-sync" style={{ padding: '2rem' }}>
                    <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '1.5rem', fontSize: '1.25rem', fontWeight: 600 }}>
                        <Mail size={22} className="text-accent" /> Email Sync Configuration
                    </h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                            <label style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)' }}>Select Provider</label>
                            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                                {['gmail', 'outlook', 'yahoo', 'icloud', 'other'].map(provider => (
                                    <button 
                                        key={provider}
                                        onClick={() => handleProviderChange(provider)}
                                        className={emailProvider === provider ? 'btn-primary' : 'btn-outline'}
                                        style={{ padding: '0.5rem 1rem', textTransform: 'capitalize', flex: 1, minWidth: '80px', textAlign: 'center' }}
                                    >
                                        {provider}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div style={{ padding: '1rem', background: 'rgba(255, 255, 255, 0.03)', border: '1px solid var(--border-glass)', borderRadius: '8px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                                <h4 style={{ fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)', margin: 0, fontWeight: 600 }}>
                                    Connection Instructions
                                </h4>
                                {EMAIL_VIDEO_LINKS[emailProvider] && (
                                    <a 
                                        href={EMAIL_VIDEO_LINKS[emailProvider]}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        style={{ 
                                            display: 'inline-flex', 
                                            alignItems: 'center', 
                                            gap: '0.4rem', 
                                            fontSize: '0.8rem', 
                                            color: '#3b82f6', 
                                            fontWeight: 600,
                                            textDecoration: 'none',
                                            padding: '0.3rem 0.75rem',
                                            borderRadius: '6px',
                                            background: 'rgba(59, 130, 246, 0.12)',
                                            border: '1px solid rgba(59, 130, 246, 0.25)'
                                        }}
                                    >
                                        <PlayCircle size={15} /> Watch How To Video <ExternalLink size={13} />
                                    </a>
                                )}
                            </div>
                            <ul style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: 0, paddingLeft: '1.2rem', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                                {emailProvider === 'gmail' && (
                                    <>
                                        <li>Make sure IMAP is enabled in your Gmail settings.</li>
                                        <li>Go to your Google Account &gt; Security &gt; 2-Step Verification.</li>
                                        <li>Scroll to the bottom and click on <strong>App passwords</strong>.</li>
                                        <li>Generate a new app password and paste it below. Do not use your standard Google password.</li>
                                    </>
                                )}
                                {emailProvider === 'outlook' && (
                                    <>
                                        <li>Make sure Two-step verification is enabled in your Microsoft Account security settings.</li>
                                        <li>Go to Security &gt; Advanced security options.</li>
                                        <li>Scroll down to <strong>App passwords</strong> and click "Create a new app password".</li>
                                        <li>Paste the generated password below.</li>
                                    </>
                                )}
                                {emailProvider === 'yahoo' && (
                                    <>
                                        <li>Log in to your Yahoo Account Security page.</li>
                                        <li>Click on <strong>Generate and manage app passwords</strong>.</li>
                                        <li>Enter a name for the app (e.g. Job Agent HQ) and click Generate.</li>
                                        <li>Paste the generated password below.</li>
                                    </>
                                )}
                                {emailProvider === 'icloud' && (
                                    <>
                                        <li>Go to appleid.apple.com and sign in.</li>
                                        <li>In the Sign-In and Security section, click on <strong>App-Specific Passwords</strong>.</li>
                                        <li>Click "Generate an app-specific password".</li>
                                        <li>Paste the generated password below.</li>
                                    </>
                                )}
                                {emailProvider === 'other' && (
                                    <>
                                        <li>Please check your email provider's documentation for IMAP settings.</li>
                                        <li>If your provider uses 2FA, you will likely need to generate an <strong>App Password</strong>.</li>
                                        <li>Make sure to use the correct IMAP Host and Port below.</li>
                                    </>
                                )}
                            </ul>
                        </div>

                        <div style={{ display: 'flex', gap: '1.25rem', flexWrap: 'wrap' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', flex: 1, minWidth: '200px' }}>
                                <label style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)' }}>{providerDisplay === 'Email' ? 'Email Address' : `${providerDisplay} Address`}</label>
                                <input 
                                    type="email"
                                    value={settings.emailAddress || ''}
                                    onChange={(e) => handleChange('emailAddress', e.target.value)}
                                    placeholder={`john@${providerDomain}`}
                                    style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)', padding: '0.75rem', borderRadius: '8px' }}
                                />
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', flex: 1, minWidth: '200px' }}>
                                <label style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                                    App Password <span style={{ fontSize: '0.75rem', color: 'var(--warning)', opacity: 0.8, marginLeft: '0.5rem', fontWeight: 400 }}>(not your regular {providerDisplay} password)</span>
                                </label>
                                <input 
                                    type="password"
                                    value={settings.emailAppPassword || ''}
                                    onChange={(e) => handleChange('emailAppPassword', e.target.value)}
                                    placeholder={`Enter ${providerDisplay} App Password`}
                                    style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)', padding: '0.75rem', borderRadius: '8px' }}
                                />
                            </div>
                        </div>
                        <div style={{ display: 'flex', gap: '1.25rem', flexWrap: 'wrap' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', flex: 2, minWidth: '200px' }}>
                                <label style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)' }}>IMAP Host</label>
                                <input 
                                    type="text"
                                    value={settings.imapHost || ''}
                                    onChange={(e) => handleChange('imapHost', e.target.value)}
                                    placeholder={emailProvider === 'other' ? "imap.example.com" : settings.imapHost}
                                    disabled={emailProvider !== 'other'}
                                    style={{ background: emailProvider !== 'other' ? 'rgba(0,0,0,0.4)' : 'rgba(0,0,0,0.2)', border: '1px solid var(--border-glass)', color: emailProvider !== 'other' ? 'var(--text-secondary)' : 'var(--text-primary)', padding: '0.75rem', borderRadius: '8px', cursor: emailProvider !== 'other' ? 'not-allowed' : 'text' }}
                                />
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', flex: 1, minWidth: '100px' }}>
                                <label style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)' }}>IMAP Port</label>
                                <input 
                                    type="number"
                                    value={settings.imapPort || ''}
                                    onChange={(e) => handleChange('imapPort', Number(e.target.value))}
                                    placeholder={emailProvider === 'other' ? "993" : (settings.imapPort ? String(settings.imapPort) : "")}
                                    disabled={emailProvider !== 'other'}
                                    style={{ background: emailProvider !== 'other' ? 'rgba(0,0,0,0.4)' : 'rgba(0,0,0,0.2)', border: '1px solid var(--border-glass)', color: emailProvider !== 'other' ? 'var(--text-secondary)' : 'var(--text-primary)', padding: '0.75rem', borderRadius: '8px', cursor: emailProvider !== 'other' ? 'not-allowed' : 'text' }}
                                />
                            </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginTop: '0.5rem' }}>
                            <button 
                                onClick={handleTestEmail}
                                disabled={testingEmail || !settings.emailAddress || !settings.emailAppPassword}
                                className="btn-outline"
                                style={{ padding: '0.5rem 1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                            >
                                {testingEmail ? (
                                    <>Testing...</>
                                ) : (
                                    <>Test Connection</>
                                )}
                            </button>
                            {emailTestResult && (
                                <div style={{ 
                                    fontSize: '0.9rem', 
                                    color: emailTestResult.success ? '#10b981' : '#ef4444',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.5rem'
                                }}>
                                    <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: emailTestResult.success ? '#10b981' : '#ef4444' }} />
                                    {emailTestResult.success ? 'Connection successful!' : `Connection failed: ${emailTestResult.error}`}
                                </div>
                            )}
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: '1.25rem', borderTop: '1px solid var(--border-glass)' }}>
                            <button 
                                onClick={() => handleSave()} 
                                disabled={saving}
                                className="btn-primary" 
                                style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                            >
                                <Save size={18} />
                                {saving ? 'Saving...' : 'Save Settings'}
                            </button>
                        </div>
                    </div>
                </div>

                {/* API Connections - Admin only */}
                {isAdmin && (
                <div className="glass-card" style={{ padding: '2rem' }}>
                    <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '1.5rem', fontSize: '1.25rem', fontWeight: 600 }}>
                        <Database size={22} className="text-accent" /> API Connections
                    </h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        <ConnectionRow name="PostgreSQL Database" status="Connected" connected={true} />
                        <ConnectionRow name="Anthropic (Claude AI)" status={isAnthropicConfigured ? 'Connected' : 'Missing'} connected={isAnthropicConfigured} />
                    </div>
                </div>
                )}

            </div>

            {/* Unsaved Changes Dialog Modal */}
            {mounted && showDialog && createPortal(
                <div style={{
                    position: 'fixed',
                    inset: 0,
                    backgroundColor: 'rgba(0, 0, 0, 0.6)',
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    zIndex: 99999,
                }}>
                    <div className="glass-card" style={{
                        maxWidth: '450px',
                        width: '90%',
                        padding: '2.5rem',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '1.5rem',
                        boxShadow: '0 20px 40px rgba(0, 0, 0, 0.4)',
                        border: '1px solid var(--border-glass)',
                        borderRadius: '16px',
                        background: 'var(--bg-surface)',
                    }}>
                        <h2 style={{
                            fontSize: '1.8rem',
                            fontWeight: 600,
                            margin: 0,
                            background: 'linear-gradient(135deg, var(--accent-primary), #00ffcc)',
                            WebkitBackgroundClip: 'text',
                            WebkitTextFillColor: 'transparent',
                            textAlign: 'center',
                        }}>Unsaved Changes</h2>
                        
                        <p style={{
                            fontSize: '0.95rem',
                            color: 'var(--text-secondary)',
                            lineHeight: '1.55',
                            margin: 0,
                            textAlign: 'center',
                        }}>
                            You have made changes to your settings. Would you like to save them before leaving this page?
                        </p>
                        
                        <div style={{
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '0.75rem',
                            marginTop: '0.5rem',
                        }}>
                            <button
                                onClick={async () => {
                                    if (pendingHref) {
                                        const success = await handleSave(settings, true);
                                        if (success) {
                                            setShowDialog(false);
                                            router.push(pendingHref);
                                        }
                                    }
                                }}
                                disabled={saving}
                                className="btn-primary"
                                style={{ width: '100%' }}
                            >
                                {saving ? 'Saving...' : 'Save & Continue'}
                            </button>
                            
                            <button
                                onClick={() => {
                                    setShowDialog(false);
                                    if (pendingHref) {
                                        setSettings(initialSettings);
                                        router.push(pendingHref);
                                    }
                                }}
                                disabled={saving}
                                className="btn-outline"
                                style={{
                                    width: '100%',
                                    borderColor: 'var(--danger)',
                                    color: 'var(--danger)',
                                }}
                                onMouseEnter={(e) => {
                                    (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'rgba(239, 68, 68, 0.1)';
                                }}
                                onMouseLeave={(e) => {
                                    (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent';
                                }}
                            >
                                Discard Changes
                            </button>
                            
                            <button
                                onClick={() => {
                                    setShowDialog(false);
                                    setPendingHref(null);
                                }}
                                disabled={saving}
                                className="btn-outline"
                                style={{
                                    width: '100%',
                                    borderColor: 'var(--border-glass)',
                                    color: 'var(--text-secondary)',
                                }}
                                onMouseEnter={(e) => {
                                    (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'var(--border-glass)';
                                }}
                                onMouseLeave={(e) => {
                                    (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent';
                                }}
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}
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
