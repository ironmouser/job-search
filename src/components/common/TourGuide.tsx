"use client";

import React, { useEffect, useMemo } from 'react';
import { useJoyride, STATUS } from 'react-joyride';
import { useHelp } from '../../contexts/HelpContext';
import { useRouter, usePathname } from 'next/navigation';

interface TourGuideProps {
    tourId?: string;
}

/**
 * Scrolls so the target element sits at ~28% from the top of the viewport.
 * This leaves the lower ~72% for the Joyride tooltip, which places the
 * tooltip roughly in the center of the visible area.
 */
const scrollToStepTarget = (targetSelector: string) => {
    if (!targetSelector) return;
    try {
        const el = document.querySelector(targetSelector);
        if (!el) return;

        const rect = el.getBoundingClientRect();
        const viewportHeight = window.innerHeight || document.documentElement.clientHeight;

        // Desired distance from the top of the viewport to the top of the element.
        // 28% gives the tooltip (~200–240 px) room to sit in the visual center.
        const desiredTopOffset = viewportHeight * 0.28;

        const currentScrollY = window.scrollY || document.documentElement.scrollTop;
        const targetScrollY = currentScrollY + rect.top - desiredTopOffset;

        window.scrollTo({
            top: Math.max(0, targetScrollY),
            behavior: 'smooth',
        });
    } catch (err) {
        console.error('Error scrolling to step target:', err);
    }
};

const TourGuide: React.FC<TourGuideProps> = ({ tourId }) => {
    const { activeTour, activeTourId, endTour, startTour, hasSeenTour, markOnboardingTaskComplete, openHelpPanel, onboardingTasks } = useHelp();
    const router = useRouter();
    const pathname = usePathname();
    
    // Compute steps synchronously to ensure Joyride gets them immediately
    const steps = useMemo(() => {
        if (!activeTour) return [];
        return activeTour.steps.map(step => ({
            target: step.target,
            title: step.title,
            content: step.content,
            placement: step.placement as any,
            skipBeacon: true,
        }));
    }, [activeTour]);

    const { state, Tour, controls } = useJoyride({
        steps,
        run: !!activeTour && steps.length > 0,
        continuous: true,
        skipBeacon: true,
        // Disable Joyride's built-in scroll — we handle it ourselves below
        // so we can position the element precisely relative to the viewport.
        disableScrolling: true,
        styles: {
            // @ts-expect-error: options is a valid prop at runtime but missing from types
            options: {
                primaryColor: '#3b82f6',
                zIndex: 10000,
            }
        }
    });

    // Reset the internal step index when a tour finishes or is closed,
    // so the next tour starts fresh from step 0.
    useEffect(() => {
        if (!activeTour) {
            controls.reset(false);
        }
    }, [activeTour, controls]);

    // Auto-start tour if specified via props and not seen yet
    useEffect(() => {
        if (tourId && !hasSeenTour(tourId) && !activeTourId) {
            setTimeout(() => {
                startTour(tourId);
            }, 500);
        }
    }, [tourId, hasSeenTour, activeTourId, startTour]);

    // Handle cross-page navigation
    useEffect(() => {
        if (state.status === 'running' && activeTour && state.index >= 0 && state.index < steps.length) {
            const currentStep = (activeTour.steps[state.index] as any);
            if (currentStep.route && currentStep.route !== pathname) {
                router.push(currentStep.route);
            }
        }
    }, [state.index, state.status, activeTour, pathname, router, steps.length]);

    // Scroll to target element if it is outside the viewport when step or route changes
    useEffect(() => {
        if (state.status === 'running' && activeTour && state.index >= 0 && state.index < steps.length) {
            const target = steps[state.index]?.target;
            if (target) {
                scrollToStepTarget(target);

                const t1 = setTimeout(() => scrollToStepTarget(target), 150);
                const t2 = setTimeout(() => scrollToStepTarget(target), 400);
                const t3 = setTimeout(() => scrollToStepTarget(target), 800);

                return () => {
                    clearTimeout(t1);
                    clearTimeout(t2);
                    clearTimeout(t3);
                };
            }
        }
    }, [state.index, state.status, activeTour, pathname, steps]);

    useEffect(() => {
        if ([STATUS.FINISHED, STATUS.SKIPPED].includes(state.status as any)) {
            if (state.status === STATUS.FINISHED && activeTourId) {
                const targetTask = onboardingTasks?.phases
                    ?.flatMap(p => p.tasks)
                    ?.find(t => t.tourId === activeTourId || t.id === activeTourId);

                const taskIdToComplete = targetTask ? targetTask.id : activeTourId;
                markOnboardingTaskComplete(taskIdToComplete);
                if (activeTourId !== taskIdToComplete) {
                    markOnboardingTaskComplete(activeTourId);
                }

                setTimeout(() => {
                    openHelpPanel(0);
                }, 300);
            }
            setTimeout(() => {
                endTour();
            }, 100);
        }
    }, [state.status, endTour, activeTourId, markOnboardingTaskComplete, openHelpPanel, onboardingTasks]);

    return <>{Tour}</>;
};

export default TourGuide;
