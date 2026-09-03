/**
 * Central Feature Flags configuration
 * Controls application-wide toggles for experimental or maintenance features.
 */

export const FEATURES = {
  // Toggle for AI Auto Apply worker & automation features.
  // Defaults to false unless NEXT_PUBLIC_ENABLE_AUTO_APPLY is explicitly 'true'.
  AUTO_APPLY: process.env.NEXT_PUBLIC_ENABLE_AUTO_APPLY === 'true',
} as const;

export function isAutoApplyEnabled(): boolean {
  return FEATURES.AUTO_APPLY;
}
