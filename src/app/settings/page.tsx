"use client";

import { useState, useEffect } from 'react';
import { Database, Key, Bot, Search, Layout, FileText, Save, Mail } from 'lucide-react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';

export default function SettingsPage() {
    const [settings, setSettings] = useState<any>({});
    const [saving, setSaving] = useState(false);
    const [loading, setLoading] = useState(true);
    const [emailProvider, setEmailProvider] = useState<string>('gmail');
    const [testingEmail, setTestingEmail] = useState(false);
    const [emailTestResult, setEmailTestResult] = useState<{success?: boolean, error?: string} | null>(null);

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
    const isAdmin = (session?.user as any)?.role === 'ADMIN';
    const isPro = (session?.user as any)?.planTier === 'PRO';


    const isAnthropicConfigured = !!process.env.NEXT_PUBLIC_ANTHROPIC_API_KEY || true; // Server-side env vars not exposed, mock for now

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
            const settingsToSave = { ...settings };
            if (settingsToSave.customCareerPages) {
                settingsToSave.customCareerPages = settingsToSave.customCareerPages.filter((u: string) => u.trim() !== '');
            }
            await fetch('/api/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(settingsToSave)
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
                <div className="glass-card" data-tour="job-preferences">
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
                                <label style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Enter a location preference</label>
                                <input 
                                    type="text"
                                    value={settings.searchLocation || ''}
                                    onChange={(e) => handleChange('searchLocation', e.target.value)}
                                    placeholder='e.g. "Remote", "Austin, TX", "United Kingdom"'
                                    style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)', padding: '0.75rem', borderRadius: '8px' }}
                                />
                                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                                    Examples: "Remote", a specific city ("Austin, TX"), a state/country ("United Kingdom"), or a region ("EMEA").
                                </span>
                            </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', paddingTop: '0.5rem' }}>
                            <input 
                                type="checkbox" 
                                id="remoteOnly"
                                checked={settings.remoteOnly || false}
                                onChange={(e) => handleChange('remoteOnly', e.target.checked)}
                                style={{ cursor: 'pointer', width: '16px', height: '16px', accentColor: 'var(--accent)' }}
                            />
                            <label htmlFor="remoteOnly" style={{ fontSize: '0.9rem', color: 'var(--text-primary)', cursor: 'pointer' }}>
                                Remote Only
                            </label>
                            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginLeft: '0.5rem' }}>
                                (Automatically filter out jobs that do not explicitly state "Remote" in their location)
                            </span>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--border-glass)' }}>
                            <label style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Active Scraper Sources</label>
                            
                            {[
                                {
                                    title: 'Global Aggregators',
                                    sources: ['indeed', 'glassdoor', 'linkedin', 'ziprecruiter']
                                },
                                {
                                    title: 'US / Remote Tech',
                                    sources: ['himalayas', 'weworkremotely', 'remoteco', 'remoteok', 'workingnomads', 'remotive', 'remotepoc', 'kforce']
                                },
                                {
                                    title: 'ATS Integrations',
                                    sources: ['greenhouse', 'lever', 'ashby', 'workable', 'smartrecruiters', 'breezy']
                                },
                                {
                                    title: 'International Sources',
                                    sources: ['eures', 'computrabajo', 'bumeran', 'jobbank', 'workopolis', 'workana']
                                }
                            ].map(group => (
                                <div key={group.title} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                    <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        {group.title}
                                    </label>
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
                                                        checked={isDisabled ? false : (settings.sources?.[source] || false)}
                                                        disabled={isDisabled}
                                                        onChange={(e) => {
                                                            const newSources = { ...settings.sources, [source]: e.target.checked };
                                                            handleChange('sources', newSources);
                                                        }}
                                                        style={{ cursor: isDisabled ? 'not-allowed' : 'pointer' }}
                                                    />
                                                    <span style={{ textTransform: 'capitalize', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                                        {source === 'jobbank' ? 'Job Bank (CA)' : 
                                                         source === 'remotepoc' ? 'RemotePOC' : source}
                                                        {isProRequired && !isPro && <span style={{ fontSize: '0.65rem', padding: '0.1rem 0.3rem', background: 'var(--accent-primary)', color: 'white', borderRadius: '8px', fontWeight: 'bold' }}>PRO</span>}
                                                    </span>
                                                </label>
                                            );
                                        })}
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', opacity: isPro ? 1 : 0.5 }}>
                            <label style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                Custom Career Pages
                                {!isPro && <span style={{ fontSize: '0.7rem', padding: '0.1rem 0.4rem', background: 'var(--accent-primary)', color: 'white', borderRadius: '12px', fontWeight: 'bold' }}>PRO</span>}
                            </label>
                            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: 0 }}>
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
                                style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)', padding: '0.75rem', borderRadius: '8px', minHeight: '100px', resize: isPro ? 'vertical' : 'none', fontFamily: 'monospace', cursor: isPro ? 'text' : 'not-allowed' }}
                            />
                            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                                {isPro ? 'Put each URL on a new line. These bypass the generic Search Keyword and directly scrape the company page.' : 'Upgrade to Pro to bypass the generic search and directly scrape specific company career pages.'}
                            </span>
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

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }} data-tour="target-profile">
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

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', paddingTop: '1rem', borderTop: '1px solid var(--border-glass)' }} data-tour="resume-upload">
                            <label style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Base Assets</label>
                            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>To update the base resume the AI uses as a template, use the Assets editor.</p>
                            <Link href="/assets" className="btn-outline" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', width: 'fit-content' }}>
                                <FileText size={16} /> Manage Base Resume
                            </Link>
                        </div>
                    </div>
                </div>

                {/* Email Sync Configuration */}
                <div className="glass-card" id="email-sync">
                    <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem' }}>
                        <Mail size={20} className="text-accent" /> Email Sync Configuration
                    </h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                            <label style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Select your provider</label>
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

                        <div style={{ padding: '1rem', background: 'rgba(255, 255, 255, 0.05)', border: '1px solid var(--border-glass)', borderRadius: '8px' }}>
                            <h4 style={{ fontSize: '0.9rem', marginBottom: '0.5rem', color: 'var(--text-primary)' }}>Connection Instructions</h4>
                            <ul style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: 0, paddingLeft: '1.2rem', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
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

                        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', flex: 1, minWidth: '200px' }}>
                                <label style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>{providerDisplay === 'Email' ? 'Email Address' : `${providerDisplay} Address`}</label>
                                <input 
                                    type="email"
                                    value={settings.emailAddress || ''}
                                    onChange={(e) => handleChange('emailAddress', e.target.value)}
                                    placeholder={`john@${providerDomain}`}
                                    style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)', padding: '0.75rem', borderRadius: '8px' }}
                                />
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', flex: 1, minWidth: '200px' }}>
                                <label style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                                    App Password <span style={{ fontSize: '0.75rem', color: 'var(--warning)', opacity: 0.8, marginLeft: '0.5rem' }}>(this is not your regular {providerDisplay} password)</span>
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
                        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', flex: 2, minWidth: '200px' }}>
                                <label style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>IMAP Host</label>
                                <input 
                                    type="text"
                                    value={settings.imapHost || ''}
                                    onChange={(e) => handleChange('imapHost', e.target.value)}
                                    placeholder={emailProvider === 'other' ? "imap.example.com" : settings.imapHost}
                                    disabled={emailProvider !== 'other'}
                                    style={{ background: emailProvider !== 'other' ? 'rgba(0,0,0,0.4)' : 'rgba(0,0,0,0.2)', border: '1px solid var(--border-glass)', color: emailProvider !== 'other' ? 'var(--text-secondary)' : 'var(--text-primary)', padding: '0.75rem', borderRadius: '8px', cursor: emailProvider !== 'other' ? 'not-allowed' : 'text' }}
                                />
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', flex: 1, minWidth: '100px' }}>
                                <label style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>IMAP Port</label>
                                <input 
                                    type="number"
                                    value={settings.imapPort || ''}
                                    onChange={(e) => handleChange('imapPort', Number(e.target.value))}
                                    placeholder={emailProvider === 'other' ? "993" : String(settings.imapPort)}
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

                    </div>
                </div>

                {/* API Connections - Admin only */}
                {isAdmin && (
                <div className="glass-card">
                    <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem' }}>
                        <Database size={20} className="text-accent" /> API Connections
                    </h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        <ConnectionRow name="PostgreSQL Database" status="Connected" connected={true} />
                        <ConnectionRow name="Anthropic (Claude AI)" status={isAnthropicConfigured ? 'Connected' : 'Missing'} connected={isAnthropicConfigured} />
                    </div>
                </div>
                )}

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
