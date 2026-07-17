"use client";

import React, { useEffect, useMemo } from 'react';
import { useJoyride, STATUS } from 'react-joyride';
import { useHelp } from '../../contexts/HelpContext';
import { useRouter, usePathname } from 'next/navigation';

interface TourGuideProps {
    tourId?: string;
}

const TourGuide: React.FC<TourGuideProps> = ({ tourId }) => {
    const { activeTour, activeTourId, endTour, startTour, hasSeenTour, markOnboardingTaskComplete, openHelpPanel } = useHelp();
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

    useEffect(() => {
        if ([STATUS.FINISHED, STATUS.SKIPPED].includes(state.status as any)) {
            if (state.status === STATUS.FINISHED && activeTourId) {
                markOnboardingTaskComplete(activeTourId);
                setTimeout(() => {
                    openHelpPanel(0);
                }, 300);
            }
            setTimeout(() => {
                endTour();
            }, 100);
        }
    }, [state.status, endTour, activeTourId, markOnboardingTaskComplete, openHelpPanel]);

    return <>{Tour}</>;
};

export default TourGuide;
