"use client";

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useHelp } from '../../contexts/HelpContext';
import { Rocket, CheckCircle2, ArrowRight, X } from 'lucide-react';

import { useRouter, usePathname } from 'next/navigation';

const CLOSE_COUNT_KEY = 'onboarding_banner_close_count';
const NEVER_SHOW_KEY = 'onboarding_banner_never_show';

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
    const [bannerVisible, setBannerVisible] = useState(true);
    const [overlayDismissed, setOverlayDismissed] = useState(false);
    const [showConfirmModal, setShowConfirmModal] = useState(false);
    const [closeCount, setCloseCount] = useState(0);
    const [neverShow, setNeverShow] = useState(false);

    useEffect(() => {
        setIsMounted(true);
        try {
            const storedNeverShow = localStorage.getItem(NEVER_SHOW_KEY) === 'true';
            const storedCloseCount = parseInt(localStorage.getItem(CLOSE_COUNT_KEY) || '0', 10);
            setNeverShow(storedNeverShow);
            setCloseCount(isNaN(storedCloseCount) ? 0 : storedCloseCount);
        } catch (e) {
            console.error('Error reading onboarding banner preferences:', e);
        }
    }, []);

    if (!isMounted || !isOnboardingProgressLoaded || progress.percentage === 100 || neverShow || !bannerVisible) {
        return null;
    }

    const handleContinue = () => {
        setOverlayDismissed(true);

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
            if (nextTask.tourId) {
                startTour(nextTask.tourId);
            } else {
                openHelpPanel(0);
            }

            if (nextTask.route) {
                const targetRoute = nextTask.route === '/' ? '/dashboard' : nextTask.route;
                if (pathname !== targetRoute && !(nextTask.route === '/' && pathname === '/dashboard')) {
                    router.push(targetRoute);
                }
            }
        } else {
            openHelpPanel(0);
        }
    };

    const handleCloseBannerClick = () => {
        if (closeCount === 0) {
            const newCount = 1;
            setCloseCount(newCount);
            try {
                localStorage.setItem(CLOSE_COUNT_KEY, newCount.toString());
            } catch (e) {}
            setBannerVisible(false);
        } else {
            setShowConfirmModal(true);
        }
    };

    const handleFinishLater = () => {
        try {
            const newCount = closeCount + 1;
            setCloseCount(newCount);
            localStorage.setItem(CLOSE_COUNT_KEY, newCount.toString());
        } catch (e) {}
        setShowConfirmModal(false);
        setBannerVisible(false);
    };

    const handleNeverShowFuture = () => {
        try {
            localStorage.setItem(NEVER_SHOW_KEY, 'true');
        } catch (e) {}
        setNeverShow(true);
        setShowConfirmModal(false);
        setBannerVisible(false);
    };

    const confirmModalContent = showConfirmModal ? (
        <div 
            style={{
                position: 'fixed',
                inset: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: 'rgba(0, 0, 0, 0.6)',
                zIndex: 9999,
                padding: '1rem'
            }}
            onClick={() => setShowConfirmModal(false)}
        >
            <div 
                className="glass-card"
                style={{
                    maxWidth: '480px',
                    width: '100%',
                    padding: '2rem',
                    borderRadius: '16px',
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border-glass)',
                    boxShadow: '0 20px 40px rgba(0, 0, 0, 0.4)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '1.25rem',
                    position: 'relative'
                }}
                onClick={(e) => e.stopPropagation()}
            >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Rocket size={22} color="var(--accent-primary)" />
                        <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700 }}>Finish Setup Later?</h3>
                    </div>
                    <button 
                        onClick={() => setShowConfirmModal(false)}
                        style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '0.25rem' }}
                    >
                        <X size={18} />
                    </button>
                </div>

                <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', lineHeight: 1.5, margin: 0 }}>
                    You have not completed your workspace setup yet. Completing your profile and settings helps Job Agent HQ tailor resumes and automate applications effectively.
                </p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '0.5rem' }}>
                    <button
                        onClick={handleFinishLater}
                        className="btn-primary"
                        style={{
                            padding: '0.8rem 1.25rem',
                            fontSize: '0.95rem',
                            justifyContent: 'center',
                            fontWeight: 600
                        }}
                    >
                        I'll finish this later
                    </button>
                    <button
                        onClick={handleNeverShowFuture}
                        className="btn-outline"
                        style={{
                            padding: '0.8rem 1.25rem',
                            fontSize: '0.95rem',
                            justifyContent: 'center',
                            color: 'var(--text-secondary)',
                            borderColor: 'var(--border-glass)'
                        }}
                    >
                        Don't show me the setup banner in the future
                    </button>
                </div>
            </div>
        </div>
    ) : null;

    const bannerCard = (
        <div style={{
            padding: '2rem',
            borderRadius: '16px',
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-glass)',
            position: overlayDismissed ? 'relative' : 'fixed',
            overflow: 'hidden',
            marginBottom: overlayDismissed ? '2rem' : 0,
            display: 'flex',
            flexDirection: 'column',
            gap: '1.5rem',
            boxShadow: !overlayDismissed ? '0 0 50px rgba(0, 0, 0, 0.5)' : '0 8px 32px rgba(0, 0, 0, 0.2)',
            zIndex: !overlayDismissed ? 9999 : 1,
            ...(overlayDismissed ? {} : {
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                maxWidth: '820px',
                width: '90vw',
            })
        }}>
            {/* Close "X" Button */}
            <button
                onClick={handleCloseBannerClick}
                title="Close setup banner"
                aria-label="Close setup banner"
                style={{
                    position: 'absolute',
                    top: '1.25rem',
                    right: '1.25rem',
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid var(--border-glass)',
                    borderRadius: '50%',
                    width: '32px',
                    height: '32px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'var(--text-secondary)',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    zIndex: 10
                }}
            >
                <X size={18} />
            </button>

            {/* Background Decoration */}
            <Rocket
                size={160}
                color="var(--accent-primary)"
                style={{
                    position: 'absolute',
                    right: '-20px',
                    bottom: '-20px',
                    opacity: 0.05,
                    transform: 'rotate(-15deg)',
                    pointerEvents: 'none',
                }}
            />

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2rem', alignItems: 'center', position: 'relative', zIndex: 1 }}>
                {/* Left side: Message and Progress */}
                <div style={{ flex: '1 1 400px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
                        <Rocket size={28} color="var(--accent-primary)" />
                        <h2 style={{ fontSize: '1.8rem', margin: 0, fontWeight: 800 }}>
                            Welcome to Job Agent HQ!
                        </h2>
                    </div>
                    <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem', maxWidth: '600px', lineHeight: '1.6' }}>
                        Get the most out of your job search operation by completing your workspace setup.
                        Follow our guided path to maximize your efficiency.
                    </p>

                    <div style={{ maxWidth: '500px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                            <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>Setup Progress</span>
                            <span style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--accent-primary)' }}>
                                {progress.percentage}% Complete
                            </span>
                        </div>
                        <div style={{
                            height: '10px',
                            borderRadius: '5px',
                            background: 'rgba(255, 255, 255, 0.1)',
                            overflow: 'hidden'
                        }}>
                            <div style={{
                                width: `${progress.percentage}%`,
                                height: '100%',
                                background: 'linear-gradient(90deg, var(--accent-primary) 0%, #a65cd8 100%)',
                                borderRadius: '5px',
                                transition: 'width 0.3s ease'
                            }} />
                        </div>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.5rem', display: 'block' }}>
                            {progress.completed} of {progress.total} tasks finished
                        </span>
                    </div>
                </div>

                {/* Right side: Action */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', minWidth: '200px' }}>
                    <button
                        onClick={handleContinue}
                        className="btn-primary"
                        style={{
                            padding: '1rem 2rem',
                            fontSize: '1.1rem',
                            borderRadius: '8px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '0.5rem',
                            boxShadow: '0 8px 16px rgba(144, 65, 195, 0.2)'
                        }}
                    >
                        Continue Setup
                        <ArrowRight size={20} />
                    </button>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                        <CheckCircle2 size={16} color="var(--success)" />
                        <span style={{ fontSize: '0.8rem', color: 'var(--success)', fontWeight: 600 }}>
                            Guided experience enabled
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );

    return (
        <>
            {!overlayDismissed && typeof document !== 'undefined' && createPortal(
                <div style={{
                    position: 'fixed',
                    top: 0, left: 0, right: 0, bottom: 0,
                    backgroundColor: 'rgba(0, 0, 0, 0.6)',
                    zIndex: 9998,
                    cursor: 'pointer'
                }} onClick={() => setOverlayDismissed(true)} />,
                document.body
            )}

            {!overlayDismissed && typeof document !== 'undefined'
                ? createPortal(bannerCard, document.body)
                : bannerCard
            }

            {showConfirmModal && typeof document !== 'undefined' && createPortal(confirmModalContent, document.body)}
        </>
    );
}
