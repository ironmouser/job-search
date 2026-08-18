'use client';

import { useEffect, useRef } from 'react';
import { useSession } from 'next-auth/react';

const USER_SCOPED_KEYS = [
  'jobAgentDashboardState',
  'dashboard_search_role',
  'dashboard_page',
  'dashboard_items_per_page',
  'last_clicked_job_id',
  'has_seen_non_us_prompt',
  'intl_sources_notice_dismissed_loc',
  'job_agent_just_completed_job_sync',
  'job_agent_has_completed_job_sync',
  'job_agent_onboarding_sync_started',
  'job_agent_auto_sync_on_mount',
  'auto_apply_dismiss_aggregator_help',
  'onboarding_sidebar_dismissed',
  'sidebar_onboarding_checklist_open',
  'sidebar_profile_checklist_open',
  'job_agent_tour_progress',
  'job_agent_onboarding_progress',
  'feedback_nudge_count',
  'feedback_nudge_last_shown',
  'feedback_nudge_last_acted',
  'feedback_nudge_completed',
  'feedback_nudge_jobs_viewed_since',
  'feedback_total_count',
];

const USER_SCOPED_PREFIXES = [
  'profile_checklist_completed_',
  'profile_checklist_hidden_',
];

const LAST_USER_KEY = 'job_agent_last_user_id';

export default function UserSessionGuard() {
  const { data: session, status } = useSession();
  const clearedRef = useRef(false);

  useEffect(() => {
    if (status !== 'authenticated' || !session?.user?.id) return;

    const currentUserId = session.user.id;
    let lastUserId: string | null = null;

    try {
      lastUserId = localStorage.getItem(LAST_USER_KEY);
    } catch {
      return;
    }

    if (lastUserId === currentUserId) return;

    if (!clearedRef.current) {
      clearedRef.current = true;
      try {
        for (const key of USER_SCOPED_KEYS) {
          localStorage.removeItem(key);
        }
        const allKeys = Object.keys(localStorage);
        for (const key of allKeys) {
          if (USER_SCOPED_PREFIXES.some((prefix) => key.startsWith(prefix))) {
            localStorage.removeItem(key);
          }
        }
        localStorage.setItem(LAST_USER_KEY, currentUserId);
      } catch {
        // localStorage unavailable
      }
    }
  }, [status, session?.user?.id]);

  return null;
}
