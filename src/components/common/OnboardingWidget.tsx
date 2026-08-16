"use client";

import React, { useState, useEffect } from 'react';
import { useHelp } from '../../contexts/HelpContext';
import { Rocket, CheckCircle2, ArrowRight, X } from 'lucide-react';
import { useRouter, usePathname } from 'next/navigation';
import { trackEvent } from '@/lib/analytics';

const DISMISSED_STORAGE_KEY = 'onboarding_banner_dismissed';

export default function OnboardingWidget() {
    const router = useRouter();
    const pathname = usePathname();
    const { 
        getOnboardingProgress, 
        openHelpPanel, 
        isOnboardingProgressLoaded,
        onboardingTasks,
        completedOnboardingTasks,
        startTour
    } = useHelp();
    const progress = getOnboardingProgress();

    const [isMounted, setIsMounted] = useState(false);
    const [isDismissed, setIsDismissed] = useState(false);

    useEffect(() => {
        setIsMounted(true);
        try {
            const dismissed = localStorage.getItem(DISMISSED_STORAGE_KEY) === 'true';
            setIsDismissed(dismissed);
        } catch (e) {
            console.error('Error reading onboarding banner preference:', e);
        }
    }, []);

    if (!isMounted || !isOnboardingProgressLoaded || progress.percentage === 100 || isDismissed) {
        return null;
    }

    const handleContinue = () => {
        trackEvent('onboarding_widget_continue', { progress_pct: progress.percentage });

        // Find the first uncompleted task
        let nextTask: any = null;
        for (const phase of onboardingTasks.phases) {
            for (const task of phase.tasks) {
                if (!completedOnboardingTasks.has(task.id)) {
                    nextTask = task;
                    break;
                }
            }
            if (nextTask) break;
        }

        if (nextTask) {
            if (nextTask.route) {
                const targetRoute = nextTask.route === '/' ? '/dashboard' : nextTask.route;
                if (pathname !== targetRoute && !(nextTask.route === '/' && pathname === '/dashboard')) {
                    router.push(targetRoute);
                }
            }

            if (nextTask.tourId) {
                startTour(nextTask.tourId);
            } else {
                openHelpPanel(0);
            }
        } else {
            openHelpPanel(0);
        }
    };

    const handleDismiss = () => {
        try {
            localStorage.setItem(DISMISSED_STORAGE_KEY, 'true');
        } catch (e) {}
        setIsDismissed(true);
        trackEvent('onboarding_widget_dismiss', { progress_pct: progress.percentage });
    };

    return (
        <div 
            className="glass-card animate-fade-in"
            style={{
                padding: '1.5rem 1.75rem',
                borderRadius: '16px',
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-glass)',
                position: 'relative',
                overflow: 'hidden',
                marginBottom: '1.5rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '1.25rem',
                boxShadow: '0 4px 20px rgba(0, 0, 0, 0.15)',
                width: '100%',
                boxSizing: 'border-box'
            }}
        >
            {/* Close "X" Button */}
            <button
                onClick={handleDismiss}
                title="Dismiss setup banner"
                aria-label="Dismiss setup banner"
                style={{
                    position: 'absolute',
                    top: '1rem',
                    right: '1rem',
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid var(--border-glass)',
                    borderRadius: '50%',
                    width: '28px',
                    height: '28px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'var(--text-secondary)',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    zIndex: 10
                }}
            >
                <X size={16} />
            </button>

            {/* Subtle background illustration */}
            <Rocket
                size={140}
                color="var(--accent-primary)"
                style={{
                    position: 'absolute',
                    right: '-10px',
                    bottom: '-10px',
                    opacity: 0.04,
                    transform: 'rotate(-15deg)',
                    pointerEvents: 'none',
                }}
            />

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1.5rem', alignItems: 'center', position: 'relative', zIndex: 1 }}>
                {/* Left side: Title, Description, and Progress Bar */}
                <div style={{ flex: '1 1 380px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.35rem' }}>
                        <Rocket size={22} color="var(--accent-primary)" />
                        <h2 style={{ fontSize: '1.35rem', margin: 0, fontWeight: 700, color: 'var(--foreground)' }}>
                            Welcome to Job Agent HQ
                        </h2>
                    </div>
                    <p style={{ color: 'var(--text-secondary)', marginBottom: '1rem', maxWidth: '580px', lineHeight: '1.5', fontSize: '0.9rem' }}>
                        Complete your workspace setup to tailor resumes and automate applications at maximum speed.
                    </p>

                    <div style={{ maxWidth: '460px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--foreground)' }}>Setup Progress</span>
                            <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--accent-primary)' }}>
                                {progress.percentage}% Complete
                            </span>
                        </div>
                        <div style={{
                            height: '8px',
                            borderRadius: '4px',
                            background: 'rgba(255, 255, 255, 0.1)',
                            overflow: 'hidden'
                        }}>
                            <div style={{
                                width: `${progress.percentage}%`,
                                height: '100%',
                                background: 'linear-gradient(90deg, var(--accent-primary) 0%, #a65cd8 100%)',
                                borderRadius: '4px',
                                transition: 'width 0.3s ease'
                            }} />
                        </div>
                        <span style={{ fontSize: '0.775rem', color: 'var(--text-secondary)', marginTop: '0.4rem', display: 'block' }}>
                            {progress.completed} of {progress.total} tasks finished
                        </span>
                    </div>
                </div>

                {/* Right side: Action CTA */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', minWidth: '180px' }}>
                    <button
                        onClick={handleContinue}
                        className="btn-primary"
                        style={{
                            padding: '0.75rem 1.4rem',
                            fontSize: '0.95rem',
                            borderRadius: '8px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '0.4rem',
                            fontWeight: 600,
                            boxShadow: '0 4px 12px rgba(144, 65, 195, 0.2)'
                        }}
                    >
                        Continue Setup
                        <ArrowRight size={17} />
                    </button>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem' }}>
                        <CheckCircle2 size={14} color="var(--success)" />
                        <span style={{ fontSize: '0.775rem', color: 'var(--success)', fontWeight: 600 }}>
                            Guided path active
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
}

