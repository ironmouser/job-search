"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useHelp } from '@/contexts/HelpContext';
import {
  Rocket,
  CheckCircle2,
  Circle,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  X,
  ListTodo
} from 'lucide-react';
import { trackEvent } from '@/lib/analytics';

interface OnboardingSidebarChecklistProps {
  isMinimized?: boolean;
  onItemClick?: () => void;
  onDismiss?: () => void;
}

export const ONBOARDING_DISMISSED_KEY = 'onboarding_sidebar_dismissed';

export default function OnboardingSidebarChecklist({
  isMinimized = false,
  onItemClick,
  onDismiss
}: OnboardingSidebarChecklistProps) {
  const router = useRouter();
  const pathname = usePathname();
  const {
    onboardingTasks,
    completedOnboardingTasks,
    getOnboardingProgress,
    startTour,
    isOnboardingProgressLoaded
  } = useHelp();

  const [isOpen, setIsOpen] = useState(true);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
    try {
      const storedState = localStorage.getItem('sidebar_onboarding_checklist_open');
      if (storedState !== null) {
        setIsOpen(storedState === 'true');
      }
    } catch (e) {}
  }, []);

  const toggleOpen = () => {
    const next = !isOpen;
    setIsOpen(next);
    try {
      localStorage.setItem('sidebar_onboarding_checklist_open', String(next));
    } catch (e) {}
  };

  const allTasks = useMemo(() => {
    return onboardingTasks?.phases?.flatMap((p) => p.tasks) || [];
  }, [onboardingTasks]);

  const progress = getOnboardingProgress();
  const isAllComplete = progress.total > 0 && progress.completed === progress.total;

  const handleDismiss = (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      localStorage.setItem(ONBOARDING_DISMISSED_KEY, 'true');
    } catch (err) {}
    trackEvent('onboarding_sidebar_dismissed', { progress_pct: progress.percentage });
    onDismiss?.();
  };

  const handleTaskClick = (task: any) => {
    if (onItemClick) {
      onItemClick();
    }

    const targetRoute = task.route === '/' ? '/dashboard' : task.route;
    const currentNormalized = pathname === '/' ? '/dashboard' : pathname;

    if (currentNormalized !== targetRoute) {
      router.push(targetRoute);
    }

    if (task.tourId) {
      setTimeout(() => {
        startTour(task.tourId);
      }, 350);
    }
  };

  if (!isMounted || !isOnboardingProgressLoaded) return null;

  // Minimized Sidebar View
  if (isMinimized) {
    return (
      <div 
        className="profile-checklist-minimized" 
        title={`Workspace Setup: ${progress.completed}/${progress.total} completed (${progress.percentage}%)`}
      >
        <button
          onClick={() => {
            const firstPending = allTasks.find((t) => !completedOnboardingTasks.has(t.id));
            if (firstPending) handleTaskClick(firstPending);
          }}
          className="checklist-min-btn"
          aria-label="Workspace Setup"
        >
          {isAllComplete ? (
            <CheckCircle2 size={16} style={{ color: '#22c55e' }} />
          ) : (
            <div className="mini-progress-wrapper">
              <Rocket size={14} style={{ color: 'var(--accent-primary, #38bdf8)' }} />
              <span className="mini-badge-count">{progress.completed}/{progress.total}</span>
            </div>
          )}
        </button>
      </div>
    );
  }

  return (
    <div className="workspace-setup-card animate-fade-in">
      {/* Header Area */}
      <div className="workspace-setup-header">
        {/* Top Row: Title + Action Buttons */}
        <div className="workspace-setup-top-row">
          <span className="workspace-setup-title">
            {isAllComplete ? 'Setup Complete' : 'Workspace Setup'}
          </span>
          <div className="workspace-setup-actions">
            <button
              onClick={handleDismiss}
              className="workspace-setup-action-btn"
              title="Dismiss workspace setup"
              aria-label="Dismiss workspace setup"
            >
              <X size={14} />
            </button>
            <button
              onClick={toggleOpen}
              className="workspace-setup-action-btn"
              title={isOpen ? "Collapse setup" : "Expand setup"}
              aria-label={isOpen ? "Collapse setup" : "Expand setup"}
            >
              {isOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
          </div>
        </div>

        {/* Sub Row: Task count + Percentage badge */}
        <div className="workspace-setup-sub-row">
          <span className="workspace-setup-fraction">
            {progress.completed} of {progress.total} tasks
          </span>
          <span className={`workspace-setup-pct-badge ${isAllComplete ? 'all-done' : ''}`}>
            {progress.percentage}%
          </span>
        </div>
      </div>

      {/* Progress Track */}
      <div className="workspace-setup-progress-track">
        <div
          className={`workspace-setup-progress-bar ${isAllComplete ? 'all-done' : ''}`}
          style={{ width: `${progress.percentage}%` }}
        />
      </div>

      {/* Expanded Task Items List */}
      {isOpen && (
        <div className="workspace-setup-items-container">
          {allTasks.map((task) => {
            const isCompleted = completedOnboardingTasks.has(task.id);
            return (
              <button
                key={task.id}
                onClick={() => handleTaskClick(task)}
                className={`workspace-setup-item-row ${isCompleted ? 'is-complete' : 'is-pending'}`}
                title={`Start: ${task.title}`}
              >
                <div className="workspace-setup-item-status">
                  {isCompleted ? (
                    <CheckCircle2 size={16} className="workspace-setup-icon-done" />
                  ) : (
                    <Circle size={16} strokeWidth={1.5} className="workspace-setup-icon-pending" />
                  )}
                </div>

                <div className="workspace-setup-item-content">
                  <span className="workspace-setup-item-title">{task.title}</span>
                  <span className="workspace-setup-item-desc">{task.description}</span>
                </div>
              </button>
            );
          })}

          {isAllComplete && (
            <div className="workspace-setup-complete-note">
              <CheckCircle2 size={14} style={{ color: '#22c55e', flexShrink: 0 }} />
              <span>Workspace setup finished! You're ready to automate applications.</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
