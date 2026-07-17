"use client";

import React, { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import helpContentData from '../data/helpContent.json';
import onboardingTasksData from '../data/onboardingTasks.json';

// Types
export interface OnboardingTask {
    id: string;
    title: string;
    description: string;
    route: string;
    tourId?: string;
    roles: string[];
    steps: string[];
}

export interface OnboardingPhase {
    id: string;
    title: string;
    tasks: OnboardingTask[];
}

export interface OnboardingData {
    phases: OnboardingPhase[];
}

interface TourStep {
    target: string;
    title: string;
    content: string;
    placement?: 'top' | 'bottom' | 'left' | 'right' | 'auto';
    route?: string;
}

export interface Tour {
    name: string;
    description: string;
    roles: string[];
    autoStart: boolean;
    steps: TourStep[];
}

interface HelpContent {
    tours: Record<string, Tour>;
}

interface HelpContextType {
    startTour: (tourId: string) => void;
    endTour: () => void;
    activeTour: Tour | null;
    activeTourId: string | null;
    hasSeenTour: (tourId: string) => boolean;
    markTourSeen: (tourId: string) => void;
    resetTourProgress: () => void;
    getAvailableTours: (pageId: string) => { id: string; tour: Tour }[];
    isHelpPanelOpen: boolean;
    openHelpPanel: (tabIndex?: number) => void;
    closeHelpPanel: () => void;
    toggleHelpPanel: (tabIndex?: number) => void;
    helpPanelTab: number;
    setHelpPanelTab: (tab: number) => void;
    onboardingTasks: OnboardingData;
    completedOnboardingTasks: Set<string>;
    markOnboardingTaskComplete: (taskId: string) => void;
    getOnboardingProgress: () => { total: number; completed: number; percentage: number };
}

const HelpContext = createContext<HelpContextType | undefined>(undefined);

const TOUR_STORAGE_KEY = 'job_agent_tour_progress';
const ONBOARDING_STORAGE_KEY = 'job_agent_onboarding_progress';

export const useHelp = () => {
    const context = useContext(HelpContext);
    if (context === undefined) {
        throw new Error('useHelp must be used within a HelpProvider');
    }
    return context;
};

interface HelpProviderProps {
    children: ReactNode;
}

export const HelpProvider: React.FC<HelpProviderProps> = ({ children }) => {
    const [helpContent] = useState<HelpContent>(helpContentData as HelpContent);
    const [activeTourId, setActiveTourId] = useState<string | null>(null);
    const [activeTour, setActiveTour] = useState<Tour | null>(null);
    const [seenTours, setSeenTours] = useState<Set<string>>(new Set());
    const [isHelpPanelOpen, setIsHelpPanelOpen] = useState(false);
    const [completedOnboardingTasks, setCompletedOnboardingTasks] = useState<Set<string>>(new Set());
    const [helpPanelTab, setHelpPanelTab] = useState(0);
    const onboardingTasks = onboardingTasksData as OnboardingData;

    useEffect(() => {
        try {
            const storedTours = localStorage.getItem(TOUR_STORAGE_KEY);
            if (storedTours) setSeenTours(new Set(JSON.parse(storedTours)));

            const storedOnboarding = localStorage.getItem(ONBOARDING_STORAGE_KEY);
            if (storedOnboarding) setCompletedOnboardingTasks(new Set(JSON.parse(storedOnboarding)));
        } catch (error) {
            console.error('[HelpContext] Error loading progress:', error);
        }
    }, []);

    const startTour = useCallback((tourId: string) => {
        const tour = helpContent.tours[tourId];
        if (tour) {
            setActiveTourId(tourId);
            setActiveTour(tour);
            setIsHelpPanelOpen(false);
        }
    }, [helpContent.tours]);

    const endTour = useCallback(() => {
        if (activeTourId) {
            setSeenTours(prev => {
                const newSet = new Set(prev);
                newSet.add(activeTourId);
                localStorage.setItem(TOUR_STORAGE_KEY, JSON.stringify([...newSet]));
                return newSet;
            });
        }
        setActiveTourId(null);
        setActiveTour(null);
    }, [activeTourId]);

    const hasSeenTour = useCallback((tourId: string) => seenTours.has(tourId), [seenTours]);

    const markTourSeen = useCallback((tourId: string) => {
        setSeenTours(prev => {
            const newSet = new Set(prev);
            newSet.add(tourId);
            localStorage.setItem(TOUR_STORAGE_KEY, JSON.stringify([...newSet]));
            return newSet;
        });
    }, []);

    const resetTourProgress = useCallback(() => {
        setSeenTours(new Set());
        localStorage.removeItem(TOUR_STORAGE_KEY);
        setCompletedOnboardingTasks(new Set());
        localStorage.removeItem(ONBOARDING_STORAGE_KEY);
    }, []);

    const getAvailableTours = useCallback((pageId: string) => {
        const result: { id: string; tour: Tour }[] = [];
        for (const [id, tour] of Object.entries(helpContent.tours)) {
            // Very simple matching for this version
            if (id === pageId || id.startsWith(`${pageId}_`) || pageId === '*') {
                result.push({ id, tour });
            }
        }
        return result;
    }, [helpContent.tours]);

    const openHelpPanel = useCallback((tabIndex?: number) => {
        if (typeof tabIndex === 'number') {
            setHelpPanelTab(tabIndex);
        }
        setIsHelpPanelOpen(true);
    }, [setHelpPanelTab]);
    
    const closeHelpPanel = useCallback(() => setIsHelpPanelOpen(false), []);
    
    const toggleHelpPanel = useCallback((tabIndex?: number) => {
        setIsHelpPanelOpen(prev => {
            const next = !prev;
            if (next && typeof tabIndex === 'number') {
                setHelpPanelTab(tabIndex);
            } else if (prev && typeof tabIndex === 'number' && helpPanelTab !== tabIndex) {
                setHelpPanelTab(tabIndex);
                return true;
            }
            return next;
        });
    }, [helpPanelTab, setHelpPanelTab]);

    const markOnboardingTaskComplete = useCallback((taskId: string) => {
        setCompletedOnboardingTasks(prev => {
            if (prev.has(taskId)) return prev;
            const newSet = new Set(prev);
            newSet.add(taskId);
            localStorage.setItem(ONBOARDING_STORAGE_KEY, JSON.stringify([...newSet]));
            return newSet;
        });
    }, []);

    const getOnboardingProgress = useCallback(() => {
        let total = 0;
        let completed = 0;
        onboardingTasks.phases.forEach(phase => {
            phase.tasks.forEach(task => {
                total++;
                if (completedOnboardingTasks.has(task.id)) completed++;
            });
        });
        return {
            total,
            completed,
            percentage: total > 0 ? Math.round((completed / total) * 100) : 0,
        };
    }, [onboardingTasks, completedOnboardingTasks]);

    return (
        <HelpContext.Provider
            value={{
                startTour,
                endTour,
                activeTour,
                activeTourId,
                hasSeenTour,
                markTourSeen,
                resetTourProgress,
                getAvailableTours,
                isHelpPanelOpen,
                openHelpPanel,
                closeHelpPanel,
                toggleHelpPanel,
                onboardingTasks,
                completedOnboardingTasks,
                markOnboardingTaskComplete,
                getOnboardingProgress,
                helpPanelTab,
                setHelpPanelTab,
            }}
        >
            {children}
        </HelpContext.Provider>
    );
};
