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
    <div className="profile-checklist-card animate-fade-in">
      {/* Header Button */}
      <button
        onClick={toggleOpen}
        className="profile-checklist-header"
        aria-expanded={isOpen}
        title="Toggle workspace setup tasks"
      >
        <div className="checklist-header-left">
          <div className="checklist-header-text">
            <span className="checklist-title">
              {isAllComplete ? 'Setup Complete' : 'Workspace Setup'}
            </span>
            <span className="checklist-fraction">
              {progress.completed} of {progress.total} tasks
            </span>
          </div>
        </div>

        <div className="checklist-header-right">
          <span className={`checklist-pct-badge ${isAllComplete ? 'all-done' : ''}`}>
            {progress.percentage}%
          </span>
          <span
            onClick={handleDismiss}
            title="Dismiss workspace setup tasks"
            aria-label="Dismiss workspace setup tasks"
            style={{
              cursor: 'pointer',
              padding: '2px',
              borderRadius: '4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--muted-foreground)',
              transition: 'color 0.15s ease',
            }}
          >
            <X size={13} />
          </span>
          {isOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
        </div>
      </button>

      {/* Mini Progress Track */}
      <div className="checklist-progress-track">
        <div
          className={`checklist-progress-bar ${isAllComplete ? 'all-done' : ''}`}
          style={{ width: `${progress.percentage}%` }}
        />
      </div>

      {/* Expanded Task List */}
      {isOpen && (
        <div className="checklist-items-container">
          {allTasks.map((task) => {
            const isCompleted = completedOnboardingTasks.has(task.id);
            return (
              <button
                key={task.id}
                onClick={() => handleTaskClick(task)}
                className={`checklist-item-row ${isCompleted ? 'is-complete' : 'is-pending'}`}
                title={`Start: ${task.title}`}
              >
                <div className="checklist-item-status">
                  {isCompleted ? (
                    <CheckCircle2 size={14} className="status-icon-done" />
                  ) : (
                    <Circle size={14} className="status-icon-pending" />
                  )}
                </div>

                <div className="checklist-item-content">
                  <span className="item-title">{task.title}</span>
                  <span className="item-desc">{task.description}</span>
                </div>

                <div className="checklist-item-action">
                  <ChevronRight size={13} className="item-arrow" />
                </div>
              </button>
            );
          })}

          {isAllComplete && (
            <div className="checklist-complete-note">
              <CheckCircle2 size={13} style={{ color: '#22c55e', flexShrink: 0 }} />
              <span>Workspace setup finished! You're ready to automate applications.</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
