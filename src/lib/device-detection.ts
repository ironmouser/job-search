/**
 * Robust device detection utility for parsing User-Agent strings
 * and client hints into clean, categorized device names.
 */

export interface ClientDeviceHints {
  isMobile?: boolean;
  maxTouchPoints?: number;
  screenWidth?: number;
}

export function parseDeviceType(
  userAgent?: string | null,
  clientHints?: ClientDeviceHints | string | null
): string {
  // If a string was passed as rawType (e.g. legacy 'mobile' / 'desktop')
  if (typeof clientHints === 'string') {
    const raw = clientHints.toLowerCase();
    if (raw !== 'mobile' && raw !== 'desktop' && raw !== 'tablet' && raw !== '') {
      return clientHints;
    }
  }

  const hints: ClientDeviceHints = typeof clientHints === 'object' && clientHints !== null ? clientHints : {};

  if (!userAgent || typeof userAgent !== 'string') {
    if (hints.isMobile) return 'Mobile';
    if (hints.maxTouchPoints && hints.maxTouchPoints > 1 && hints.screenWidth && hints.screenWidth < 768) {
      return 'Mobile';
    }
    return 'Desktop';
  }

  const ua = userAgent.toLowerCase();

  // 1. Tablet Detection (prioritize tablets over phones)
  if (
    ua.includes('ipad') ||
    ua.includes('tablet') ||
    ua.includes('playbook') ||
    ua.includes('silk') ||
    ua.includes('kindle') ||
    (ua.includes('android') && !ua.includes('mobile'))
  ) {
    return 'Tablet';
  }

  // Detect iPadOS Safari in desktop mode (reports as Macintosh with touch points)
  if (ua.includes('macintosh') && (hints.maxTouchPoints ?? 0) > 1) {
    return 'Tablet';
  }

  // 2. Mobile Detection (iOS vs Android vs other)
  if (ua.includes('iphone') || ua.includes('ipod')) {
    return 'Mobile (iOS)';
  }

  if (ua.includes('android') && ua.includes('mobile')) {
    return 'Mobile (Android)';
  }

  if (
    ua.includes('mobile') ||
    ua.includes('webos') ||
    ua.includes('blackberry') ||
    ua.includes('iemobile') ||
    ua.includes('opera mini') ||
    hints.isMobile
  ) {
    return 'Mobile';
  }

  // 3. Desktop Operating Systems
  if (ua.includes('cros')) {
    return 'Desktop (ChromeOS)';
  }

  if (ua.includes('macintosh') || ua.includes('mac os')) {
    return 'Desktop (macOS)';
  }

  if (ua.includes('windows')) {
    return 'Desktop (Windows)';
  }

  if (ua.includes('linux') || ua.includes('x11')) {
    return 'Desktop (Linux)';
  }

  return 'Desktop';
}
