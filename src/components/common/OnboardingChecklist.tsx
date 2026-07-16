"use client";

import React from 'react';
import { useHelp } from '../../contexts/HelpContext';
import { CheckCircle2, Circle, ChevronDown, ChevronRight, Play } from 'lucide-react';

export default function OnboardingChecklist() {
    const { 
        onboardingTasks, 
        completedOnboardingTasks, 
        markOnboardingTaskComplete,
        getOnboardingProgress,
        startTour
    } = useHelp();

    const [expandedPhase, setExpandedPhase] = React.useState<string | null>(
        onboardingTasks.phases.length > 0 ? onboardingTasks.phases[0].id : null
    );

    const progress = getOnboardingProgress();

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {/* Progress Header */}
            <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                    <h3 style={{ margin: 0, color: 'var(--text-primary)' }}>Onboarding Progress</h3>
                    <span style={{ color: 'var(--accent-primary)', fontWeight: 'bold' }}>{progress.percentage}%</span>
                </div>
                <div style={{ 
                    height: '8px', 
                    backgroundColor: 'rgba(255,255,255,0.1)', 
                    borderRadius: '4px',
                    overflow: 'hidden'
                }}>
                    <div style={{
                        height: '100%',
                        width: `${progress.percentage}%`,
                        backgroundColor: 'var(--accent-primary)',
                        transition: 'width 0.3s ease-in-out'
                    }} />
                </div>
                <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                    {progress.completed} of {progress.total} tasks completed
                </p>
            </div>

            {/* Phases */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {onboardingTasks.phases.map(phase => {
                    const isExpanded = expandedPhase === phase.id;
                    const phaseCompleted = phase.tasks.every(t => completedOnboardingTasks.has(t.id));

                    return (
                        <div 
                            key={phase.id}
                            className="glass-card"
                            style={{ padding: '1rem' }}
                        >
                            <div 
                                style={{ 
                                    display: 'flex', 
                                    alignItems: 'center', 
                                    justifyContent: 'space-between',
                                    cursor: 'pointer'
                                }}
                                onClick={() => setExpandedPhase(isExpanded ? null : phase.id)}
                            >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                    {phaseCompleted ? (
                                        <CheckCircle2 size={20} color="var(--success)" />
                                    ) : (
                                        <Circle size={20} color="var(--text-secondary)" />
                                    )}
                                    <h4 style={{ margin: 0, color: 'var(--text-primary)' }}>{phase.title}</h4>
                                </div>
                                {isExpanded ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
                            </div>

                            {isExpanded && (
                                <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                    {phase.tasks.map(task => {
                                        const isCompleted = completedOnboardingTasks.has(task.id);
                                        
                                        return (
                                            <div 
                                                key={task.id}
                                                style={{
                                                    padding: '1rem',
                                                    backgroundColor: 'rgba(0,0,0,0.05)',
                                                    borderRadius: '8px',
                                                    border: `1px solid ${isCompleted ? 'var(--success)' : 'var(--border-glass)'}`,
                                                    transition: 'all 0.2s'
                                                }}
                                            >
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                                    <div>
                                                        <h5 style={{ margin: '0 0 0.25rem 0', color: 'var(--text-primary)' }}>{task.title}</h5>
                                                        <p style={{ margin: '0 0 1rem 0', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{task.description}</p>
                                                    </div>
                                                    <button
                                                        onClick={() => markOnboardingTaskComplete(task.id)}
                                                        style={{
                                                            background: 'none',
                                                            border: 'none',
                                                            cursor: 'pointer',
                                                            padding: '0.25rem'
                                                        }}
                                                        title={isCompleted ? "Mark as incomplete" : "Mark as complete"}
                                                    >
                                                        {isCompleted ? (
                                                            <CheckCircle2 size={24} color="var(--success)" />
                                                        ) : (
                                                            <Circle size={24} color="var(--text-secondary)" />
                                                        )}
                                                    </button>
                                                </div>

                                                {task.steps && task.steps.length > 0 && (
                                                    <ol style={{ 
                                                        margin: '0 0 1rem 1.5rem', 
                                                        padding: 0,
                                                        color: 'var(--text-secondary)',
                                                        fontSize: '0.85rem',
                                                        lineHeight: '1.5'
                                                    }}>
                                                        {task.steps.map((step, idx) => (
                                                            <li key={idx} style={{ marginBottom: '0.25rem' }}>{step}</li>
                                                        ))}
                                                    </ol>
                                                )}

                                                <div style={{ display: 'flex', gap: '0.5rem' }}>
                                                    {task.route && (
                                                        <a 
                                                            href={task.route}
                                                            className="btn-outline"
                                                            style={{ 
                                                                padding: '0.4rem 0.8rem', 
                                                                fontSize: '0.8rem',
                                                                textDecoration: 'none'
                                                            }}
                                                        >
                                                            Go to Page
                                                        </a>
                                                    )}
                                                    {task.tourId && (
                                                        <button 
                                                            onClick={() => startTour(task.tourId!)}
                                                            className="btn-primary"
                                                            style={{ 
                                                                padding: '0.4rem 0.8rem', 
                                                                fontSize: '0.8rem',
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                gap: '0.25rem'
                                                            }}
                                                        >
                                                            <Play size={14} /> Start Tour
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
