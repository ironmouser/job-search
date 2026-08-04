"use client";

import React, { useEffect, useMemo } from 'react';
import { useJoyride, STATUS } from 'react-joyride';
import { useHelp } from '../../contexts/HelpContext';
import { useRouter, usePathname } from 'next/navigation';

interface TourGuideProps {
    tourId?: string;
}

/**
 * Scrolls the viewport so the Joyride step tooltip card (housing the text & action buttons)
 * is vertically centered in the viewport.
 */
const scrollToCenterTooltip = (targetSelector?: string) => {
    try {
        const tooltipEl =
            document.querySelector('.react-joyride__tooltip') ||
            document.querySelector('[data-joyride="tooltip"]') ||
            document.querySelector('div[id^="react-joyride-step-"]') ||
            document.querySelector('.__floater');

        const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
        const currentScrollY = window.scrollY || document.documentElement.scrollTop;

        if (tooltipEl) {
            const rect = tooltipEl.getBoundingClientRect();
            if (rect.height > 0) {
                const tooltipCenterY = rect.top + rect.height / 2;
                const desiredCenterY = viewportHeight / 2;
                const targetScrollY = currentScrollY + tooltipCenterY - desiredCenterY;

                window.scrollTo({
                    top: Math.max(0, targetScrollY),
                    behavior: 'smooth',
                });
                return true;
            }
        }

        // Fallback: If tooltip element is not rendered yet, center the target element
        if (targetSelector) {
            const targetEl = document.querySelector(targetSelector);
            if (targetEl) {
                const rect = targetEl.getBoundingClientRect();
                const targetCenterY = rect.top + rect.height / 2;
                const desiredCenterY = viewportHeight / 2;
                const targetScrollY = currentScrollY + targetCenterY - desiredCenterY;

                window.scrollTo({
                    top: Math.max(0, targetScrollY),
                    behavior: 'smooth',
                });
            }
        }
    } catch (err) {
        console.error('Error scrolling tooltip into center:', err);
    }
    return false;
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

    // Scroll to center the step tooltip modal in the viewport when step or route changes
    useEffect(() => {
        if (state.status === 'running' && activeTour && state.index >= 0 && state.index < steps.length) {
            const target = steps[state.index]?.target;
            scrollToCenterTooltip(target);

            const t1 = setTimeout(() => scrollToCenterTooltip(target), 50);
            const t2 = setTimeout(() => scrollToCenterTooltip(target), 150);
            const t3 = setTimeout(() => scrollToCenterTooltip(target), 300);
            const t4 = setTimeout(() => scrollToCenterTooltip(target), 600);

            return () => {
                clearTimeout(t1);
                clearTimeout(t2);
                clearTimeout(t3);
                clearTimeout(t4);
            };
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
