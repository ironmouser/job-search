"use client";

declare global {
  interface Window {
    gtag?: (...args: any[]) => void;
    dataLayer?: any[];
  }
}

export const GA_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;

/**
 * Log analytics event to GA4 or console if GA is not initialized/in development
 */
export const trackEvent = (action: string, params: Record<string, any> = {}) => {
  if (typeof window === "undefined") return;

  if (GA_MEASUREMENT_ID && typeof window.gtag === "function") {
    window.gtag("event", action, params);
  } else {
    // Console fallback for local debugging when NEXT_PUBLIC_GA_MEASUREMENT_ID is unset
    console.log(`[GA Event] ${action}`, params);
  }
};

/**
 * Record SPA Pageview
 */
export const pageview = (url: string) => {
  if (typeof window === "undefined") return;

  if (GA_MEASUREMENT_ID && typeof window.gtag === "function") {
    window.gtag("config", GA_MEASUREMENT_ID, {
      page_path: url,
    });
  } else {
    console.log(`[GA Pageview] ${url}`);
  }
};

// --- Public Landing Page & CTA Events ---
export const trackPublicCtaClick = (label: string, location: string = "landing") => {
  trackEvent("public_cta_click", {
    cta_label: label,
    location,
  });
};

// --- Funnel & Auth Events ---
export const trackLogin = (method: "email" | "google") => {
  trackEvent("login", { method });
};

export const trackOnboardingStep = (step: number, stepName: string) => {
  trackEvent("onboarding_step_view", { step, step_name: stepName });
};

export const trackOnboardingResumeSkip = () => {
  trackEvent("onboarding_resume_skip", { timestamp: new Date().toISOString() });
};

export const trackOnboardingComplete = (params: Record<string, any> = {}) => {
  trackEvent("onboarding_complete", params);
};

export const trackJobSyncStart = () => {
  trackEvent("job_sync_start", { timestamp: new Date().toISOString() });
};

export const trackJobSyncSuccess = (jobsFoundCount: number, newJobsSavedCount: number) => {
  trackEvent("job_sync_success", {
    jobs_found: jobsFoundCount,
    new_jobs_saved: newJobsSavedCount,
  });
};

export const trackJobSyncError = (errorMessage: string) => {
  trackEvent("job_sync_error", { error_message: errorMessage });
};

export const trackAddJobUrl = (url: string, status: "success" | "error", errorMessage?: string) => {
  trackEvent("add_job_url_submit", {
    url,
    status,
    error_message: errorMessage || null,
  });
};

// --- JIT Resume Upload Modal Events ---
export const trackJitResumeModalOpen = (source: string = "asset_card") => {
  trackEvent("jit_resume_modal_open", { source });
};

export const trackJitResumeModalDismiss = () => {
  trackEvent("jit_resume_modal_dismiss");
};

export const trackJitResumeUploadSuccess = () => {
  trackEvent("jit_resume_upload_success", { timestamp: new Date().toISOString() });
};

// --- Job Details Page Events ---
export const trackJobDetailView = (jobId: string, company?: string, title?: string, score?: number) => {
  trackEvent("job_detail_view", {
    job_id: jobId,
    company: company || "",
    title: title || "",
    score: score ?? null,
  });
};

export const trackJobFeedback = (jobId: string, feedbackType: "like" | "dislike", reasons: string[] = []) => {
  trackEvent("job_feedback", {
    job_id: jobId,
    feedback_type: feedbackType,
    reasons: reasons.join(", "),
    reasons_count: reasons.length,
  });
};

export const trackJobSaveToggle = (jobId: string, isSaved: boolean) => {
  trackEvent("job_save_toggle", {
    job_id: jobId,
    is_saved: isSaved,
  });
};

export const trackDockAction = (actionName: string, jobId: string, details: Record<string, any> = {}) => {
  trackEvent("dock_action", {
    action_name: actionName,
    job_id: jobId,
    ...details,
  });
};

export const trackAutoApplyAction = (actionName: string, jobId: string, details: Record<string, any> = {}) => {
  trackEvent("auto_apply_action", {
    action_name: actionName,
    job_id: jobId,
    ...details,
  });
};

export const trackAssetAction = (
  assetType: "resume" | "cover_letter" | "networking",
  action: "view" | "edit" | "save" | "download" | "copy",
  jobId: string
) => {
  trackEvent("asset_action", {
    asset_type: assetType,
    action_name: action,
    job_id: jobId,
  });
};

// --- Profile Page Events ---
export const trackProfileView = () => {
  trackEvent("profile_view");
};

export const trackProfileResumeUpdate = (method: "upload" | "paste") => {
  trackEvent("profile_resume_update", { method });
};

export const trackProfileCriteriaUpdate = (params: Record<string, any> = {}) => {
  trackEvent("profile_criteria_update", params);
};

export const trackProfileRubricUpdate = () => {
  trackEvent("profile_rubric_update");
};

export const trackProfileSave = () => {
  trackEvent("profile_save");
};

// --- Settings Page Events ---
export const trackSettingsView = () => {
  trackEvent("settings_view");
};

export const trackSettingsTabChange = (tabName: string) => {
  trackEvent("settings_tab_change", { tab_name: tabName });
};

export const trackIntegrationToggle = (integrationName: string, enabled: boolean) => {
  trackEvent("settings_integration_toggle", {
    integration: integrationName,
    enabled,
  });
};

export const trackAutoApplyConfigUpdate = (params: Record<string, any> = {}) => {
  trackEvent("settings_auto_apply_update", params);
};

export const trackSettingsSave = () => {
  trackEvent("settings_save");
};
