"use client";

import React, { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useHelp } from '../../contexts/HelpContext';
import OnboardingChecklist from './OnboardingChecklist';
import { X, Play, RotateCcw } from 'lucide-react';

export default function HelpPanel() {
    const { 
        isHelpPanelOpen, 
        closeHelpPanel, 
        helpPanelTab, 
        setHelpPanelTab,
        getAvailableTours,
        startTour,
        hasSeenTour,
        resetTourProgress
    } = useHelp();

    const pathname = usePathname();
    const [pageId, setPageId] = useState('*');
    
    useEffect(() => {
        if (!pathname) return;
        if (pathname === '/' || pathname.includes('/dashboard')) setPageId('dashboard');
        else if (pathname.includes('/settings')) setPageId('settings');
        else if (pathname.includes('/pipeline')) setPageId('pipeline');
        else if (pathname.includes('/analytics')) setPageId('analytics');
        else if (pathname.includes('/assets')) setPageId('assets');
        else if (pathname.includes('/job/')) setPageId('job_details');
        else setPageId('*');
    }, [pathname, isHelpPanelOpen]);

    const availableTours = getAvailableTours(pageId);

    if (!isHelpPanelOpen) return null;

    return (
        <div style={{
            position: 'fixed',
            top: 0,
            right: 0,
            bottom: 0,
            width: '400px',
            maxWidth: '100%',
            backgroundColor: 'var(--bg-surface)',
            borderLeft: '1px solid var(--border-glass)',
            zIndex: 9999,
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '-4px 0 15px rgba(0,0,0,0.5)',
            transform: isHelpPanelOpen ? 'translateX(0)' : 'translateX(100%)',
            transition: 'transform 0.3s ease-in-out'
        }}>
            {/* Header */}
            <div style={{
                padding: '1.5rem',
                borderBottom: '1px solid var(--border-glass)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
            }}>
                <h2 style={{ margin: 0, fontSize: '1.5rem' }}>Help & Guidance</h2>
                <button 
                    onClick={closeHelpPanel}
                    style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--text-secondary)',
                        cursor: 'pointer',
                        padding: '0.5rem'
                    }}
                >
                    <X size={24} />
                </button>
            </div>

            {/* Tabs */}
            <div style={{
                display: 'flex',
                borderBottom: '1px solid var(--border-glass)',
                backgroundColor: 'rgba(0,0,0,0.05)'
            }}>
                <button
                    onClick={() => setHelpPanelTab(0)}
                    style={{
                        flex: 1,
                        padding: '1rem',
                        background: 'none',
                        border: 'none',
                        borderBottom: helpPanelTab === 0 ? '2px solid var(--accent-primary)' : '2px solid transparent',
                        color: helpPanelTab === 0 ? 'var(--accent-primary)' : 'var(--text-secondary)',
                        cursor: 'pointer',
                        fontWeight: '600'
                    }}
                >
                    Onboarding
                </button>
                <button
                    onClick={() => setHelpPanelTab(1)}
                    style={{
                        flex: 1,
                        padding: '1rem',
                        background: 'none',
                        border: 'none',
                        borderBottom: helpPanelTab === 1 ? '2px solid var(--accent-primary)' : '2px solid transparent',
                        color: helpPanelTab === 1 ? 'var(--accent-primary)' : 'var(--text-secondary)',
                        cursor: 'pointer',
                        fontWeight: '600'
                    }}
                >
                    Tours
                </button>
            </div>

            {/* Content */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem' }}>
                {helpPanelTab === 0 ? (
                    <OnboardingChecklist />
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        <h3 style={{ margin: '0 0 1rem 0', color: 'var(--text-primary)' }}>Available Tours</h3>
                        
                        {availableTours.length > 0 ? (
                            availableTours.map(({ id, tour }) => {
                                const seen = hasSeenTour(id);
                                return (
                                    <div 
                                        key={id}
                                        style={{
                                            padding: '1rem',
                                            borderRadius: '8px',
                                            border: `1px solid ${seen ? 'var(--border-glass)' : 'var(--accent-primary)'}`,
                                            backgroundColor: seen ? 'transparent' : 'rgba(54, 149, 227, 0.05)',
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            alignItems: 'center',
                                            cursor: 'pointer'
                                        }}
                                        onClick={() => startTour(id)}
                                    >
                                        <div>
                                            <h4 style={{ margin: '0 0 0.25rem 0', color: 'var(--text-primary)' }}>{tour.name}</h4>
                                            <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{tour.description}</p>
                                        </div>
                                        <Play size={20} color={seen ? 'var(--text-secondary)' : 'var(--accent-primary)'} />
                                    </div>
                                );
                            })
                        ) : (
                            <p style={{ color: 'var(--text-secondary)' }}>No tours available for this page.</p>
                        )}

                        <div style={{ marginTop: '2rem' }}>
                            <button
                                onClick={resetTourProgress}
                                className="btn-outline"
                                style={{
                                    width: '100%',
                                    display: 'flex',
                                    justifyContent: 'center',
                                    alignItems: 'center',
                                    gap: '0.5rem'
                                }}
                            >
                                <RotateCcw size={16} />
                                Reset All Progress
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
