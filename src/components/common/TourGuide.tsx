"use client";

import React, { useEffect, useMemo } from 'react';
import { useJoyride, STATUS } from 'react-joyride';
import { useHelp } from '../../contexts/HelpContext';

interface TourGuideProps {
    tourId?: string;
}

const TourGuide: React.FC<TourGuideProps> = ({ tourId }) => {
    const { activeTour, activeTourId, endTour, startTour, hasSeenTour } = useHelp();
    
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

    useEffect(() => {
        if ([STATUS.FINISHED, STATUS.SKIPPED].includes(state.status as any)) {
            setTimeout(() => {
                endTour();
            }, 100);
        }
    }, [state.status, endTour]);

    return <>{Tour}</>;
};

export default TourGuide;
