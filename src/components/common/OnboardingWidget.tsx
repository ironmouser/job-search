"use client";

import React from 'react';
import { useHelp } from '../../contexts/HelpContext';
import { Rocket, CheckCircle2, ArrowRight } from 'lucide-react';

export default function OnboardingWidget() {
    const { getOnboardingProgress, openHelpPanel } = useHelp();
    const progress = getOnboardingProgress();

    if (progress.percentage === 100) return null;

    const handleContinue = () => {
        openHelpPanel(0);
    };

    return (
        <div style={{
            padding: '2rem',
            borderRadius: '16px',
            background: 'var(--bg-glass)',
            border: '1px solid var(--border-glass)',
            position: 'relative',
            overflow: 'hidden',
            marginBottom: '2rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '1.5rem',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.2)',
        }}>
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
