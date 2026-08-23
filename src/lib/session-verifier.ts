import { BrowserStorageState, SanitizedCookie } from './session-vault';

export interface ProviderTokenConfig {
  id: string;
  name: string;
  primaryCookieName: string;
  domain: string;
  alternativeCookieNames?: string[];
  helpLabel: string;
  placeholder: string;
  testUrl: string;
  loginUrlIndicators: string[];
  guideSteps: string[];
}

export const PROVIDER_CONFIGS: Record<string, ProviderTokenConfig> = {
  linkedin: {
    id: 'linkedin',
    name: 'LinkedIn',
    primaryCookieName: 'li_at',
    domain: '.linkedin.com',
    alternativeCookieNames: [
      'JSESSIONID',
      'bcookie',
      'bscookie',
      'li_sug',
      'liap',
      'lidc',
    ],
    helpLabel: 'li_at session cookie',
    placeholder: 'e.g. AQEDATabcdef123456789...',
    testUrl: 'https://www.linkedin.com/feed/',
    loginUrlIndicators: ['linkedin.com/login', 'linkedin.com/checkpoint', 'authwall', 'uas/login'],
    guideSteps: [
      'Open linkedin.com in your browser and make sure you are logged in.',
      'Right-click anywhere on the page and click "Inspect" (or press F12 / Cmd+Option+I).',
      'Go to the "Application" tab (or "Storage" in Firefox) -> "Cookies" -> "https://www.linkedin.com".',
      'Find the cookie named "li_at", double-click its Value, copy it, and paste it here.',
    ],
  },
  indeed: {
    id: 'indeed',
    name: 'Indeed',
    primaryCookieName: 'CTK',
    domain: '.indeed.com',
    alternativeCookieNames: [
      'SHARED_SESSION',
      'INDEED_CSRF_TOKEN',
      'LV',
      'SURF',
      'JSESSIONID',
    ],
    helpLabel: 'CTK session cookie',
    placeholder: 'e.g. 1h9abc123...',
    testUrl: 'https://my.indeed.com/',
    loginUrlIndicators: ['secure.indeed.com/account/login', 'indeed.com/account/login', 'auth.indeed.com'],
    guideSteps: [
      'Open indeed.com in your browser and ensure you are logged in.',
      'Right-click anywhere and select "Inspect" -> "Application" tab -> "Cookies" -> "https://www.indeed.com".',
      'Find the cookie named "CTK" (or "SHARED_SESSION"), copy its Value, and paste it here.',
    ],
  },
  ziprecruiter: {
    id: 'ziprecruiter',
    name: 'ZipRecruiter',
    primaryCookieName: 'zpa_session_id',
    domain: '.ziprecruiter.com',
    alternativeCookieNames: [
      'zip_session',
      'zpa_csrf',
      '_session_id',
      'zpa_user',
    ],
    helpLabel: 'zpa_session_id cookie',
    placeholder: 'e.g. zpa_live_session_token...',
    testUrl: 'https://www.ziprecruiter.com/candidate/my-jobs',
    loginUrlIndicators: ['ziprecruiter.com/login', 'ziprecruiter.com/candidate/login'],
    guideSteps: [
      'Open ziprecruiter.com in your browser and ensure you are logged in.',
      'Right-click and select "Inspect" -> "Application" tab -> "Cookies" -> "https://www.ziprecruiter.com".',
      'Find the cookie named "zpa_session_id" or "zip_session", copy its Value, and paste it here.',
    ],
  },
  dice: {
    id: 'dice',
    name: 'Dice',
    primaryCookieName: 'dice_token',
    domain: '.dice.com',
    alternativeCookieNames: [
      'session_id',
      'auth_token',
      'dice_auth',
      'dice_jwt',
    ],
    helpLabel: 'dice_token session cookie',
    placeholder: 'e.g. eyJhbGciOiJIUzI1NiIsInR5cCI...',
    testUrl: 'https://www.dice.com/dashboard',
    loginUrlIndicators: ['dice.com/dashboard/login', 'dice.com/login', 'auth.dice.com'],
    guideSteps: [
      'Open dice.com in your browser and ensure you are logged in.',
      'Right-click and select "Inspect" -> "Application" tab -> "Cookies" -> "https://www.dice.com".',
      'Find the cookie named "dice_token" or "session_id", copy its Value, and paste it here.',
    ],
  },
};

export interface SessionVerificationResult {
  valid: boolean;
  liveVerified?: boolean;
  error?: string;
  storageState?: BrowserStorageState;
  tokenCount?: number;
  expiresAt?: Date;
  daysRemaining?: number;
  isExpiringSoon?: boolean;
  profileName?: string | null;
  profileEmail?: string | null;
}

/**
 * Normalizes input from either a single token string, a JSON cookie array, or a Playwright storageState.
 */
export function normalizeSessionInput(rawInput: string | object, providerId: string): BrowserStorageState {
  const normProvider = providerId.toLowerCase().trim();
  const config = PROVIDER_CONFIGS[normProvider];
  const fallbackDomain = config ? config.domain : `.${normProvider}.com`;
  const primaryCookie = config ? config.primaryCookieName : `${normProvider}_session`;

  if (typeof rawInput === 'object' && rawInput !== null) {
    if (Array.isArray(rawInput)) {
      return {
        cookies: rawInput.map((c) => ({
          name: c.name,
          value: c.value,
          domain: c.domain || fallbackDomain,
          path: c.path || '/',
          expires: c.expires,
          httpOnly: Boolean(c.httpOnly),
          secure: Boolean(c.secure),
          sameSite: c.sameSite || 'Lax',
        })),
      };
    }
    if ('cookies' in rawInput && Array.isArray((rawInput as any).cookies)) {
      return rawInput as BrowserStorageState;
    }
  }

  const trimmed = typeof rawInput === 'string' ? rawInput.trim() : '';
  if (!trimmed) {
    return { cookies: [] };
  }

  // Attempt to parse as JSON first (full Playwright storageState or cookie array)
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed);
      return normalizeSessionInput(parsed, normProvider);
    } catch {
      // If not valid JSON, treat as raw single token string
    }
  }

  // Treat as a direct single auth token string (e.g. li_at value)
  const defaultExpiryEpoch = Math.floor((Date.now() + 30 * 24 * 60 * 60 * 1000) / 1000);
  const singleCookie: SanitizedCookie = {
    name: primaryCookie,
    value: trimmed,
    domain: fallbackDomain,
    path: '/',
    expires: defaultExpiryEpoch,
    httpOnly: true,
    secure: true,
    sameSite: 'Lax',
  };

  return { cookies: [singleCookie] };
}

/**
 * Step 1: Structural & Token Expiration Validation.
 */
export function verifySessionState(rawInput: string | object, providerId: string): SessionVerificationResult {
  const normProvider = providerId.toLowerCase().trim();
  const config = PROVIDER_CONFIGS[normProvider];

  if (!config) {
    return { valid: false, error: `Unsupported job board provider: ${providerId}` };
  }

  const storageState = normalizeSessionInput(rawInput, normProvider);
  const cookies = storageState.cookies || [];

  if (cookies.length === 0) {
    return { valid: false, error: `No session tokens provided for ${config.name}.` };
  }

  // Find the primary or alternative auth cookies
  const acceptedNames = [config.primaryCookieName, ...(config.alternativeCookieNames || [])].map((n) =>
    n.toLowerCase()
  );

  const matchedCookies = cookies.filter(
    (c) =>
      c.name &&
      c.value &&
      (acceptedNames.includes(c.name.toLowerCase()) ||
        c.name.toLowerCase().includes(normProvider) ||
        c.name.toLowerCase().includes('session') ||
        c.name.toLowerCase().includes('token') ||
        c.name.toLowerCase().includes('auth'))
  );

  if (matchedCookies.length === 0) {
    return {
      valid: false,
      error: `Missing authentication cookie for ${config.name} (expected '${config.primaryCookieName}').`,
    };
  }

  const primaryAuthCookie =
    matchedCookies.find((c) => c.name.toLowerCase() === config.primaryCookieName.toLowerCase()) ||
    matchedCookies[0];

  if (!primaryAuthCookie.value || primaryAuthCookie.value.trim().length < 8) {
    return {
      valid: false,
      error: `The ${primaryAuthCookie.name} cookie value appears to be incomplete or too short.`,
    };
  }

  const nowEpoch = Math.floor(Date.now() / 1000);
  let computedExpiresAt: Date;
  let daysRemaining: number;

  if (primaryAuthCookie.expires && typeof primaryAuthCookie.expires === 'number' && primaryAuthCookie.expires > 0) {
    const expEpoch =
      primaryAuthCookie.expires > 1e11
        ? Math.floor(primaryAuthCookie.expires / 1000)
        : primaryAuthCookie.expires;

    if (expEpoch < nowEpoch) {
      const expiredDate = new Date(expEpoch * 1000);
      return {
        valid: false,
        error: `Session cookie expired on ${expiredDate.toLocaleDateString()}. Please provide a fresh session.`,
        expiresAt: expiredDate,
        daysRemaining: 0,
      };
    }

    computedExpiresAt = new Date(expEpoch * 1000);
    daysRemaining = Math.max(1, Math.round((expEpoch - nowEpoch) / (24 * 3600)));
  } else {
    computedExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    daysRemaining = 30;
  }

  const isExpiringSoon = daysRemaining <= 2;

  return {
    valid: true,
    storageState,
    tokenCount: cookies.length,
    expiresAt: computedExpiresAt,
    daysRemaining,
    isExpiringSoon,
  };
}

/**
 * Step 2: Real Live Network Probe via ScraperAPI Residential Proxies.
 * Sends an authentic HTTP GET request with the session cookies to the provider's test URL.
 */
export async function probeSessionWithScraperAPI(
  storageState: BrowserStorageState,
  providerId: string,
  timeoutMs = 12000
): Promise<SessionVerificationResult> {
  const normProvider = providerId.toLowerCase().trim();
  const config = PROVIDER_CONFIGS[normProvider];

  if (!config) {
    return { valid: false, error: `Unsupported provider: ${providerId}` };
  }

  // Run local structure check first
  const structuralCheck = verifySessionState(storageState, normProvider);
  if (!structuralCheck.valid) {
    return structuralCheck;
  }

  const apiKey = process.env.SCRAPERAPI_KEY;
  if (!apiKey) {
    console.warn('[SessionVerifier] SCRAPERAPI_KEY not configured. Falling back to structural validation.');
    return {
      ...structuralCheck,
      liveVerified: false,
    };
  }

  try {
    // Format cookies into a standard Cookie header string
    const cookieHeader = (storageState.cookies || [])
      .map((c) => `${c.name}=${c.value}`)
      .join('; ');

    const params = new URLSearchParams({
      api_key: apiKey,
      url: config.testUrl,
      keep_headers: 'true',
      country_code: 'us',
    });

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    console.info(`[SessionVerifier] Probing ${config.name} live via ScraperAPI residential proxy...`);

    const res = await fetch(`https://api.scraperapi.com?${params.toString()}`, {
      method: 'GET',
      headers: {
        Cookie: cookieHeader,
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      signal: controller.signal,
    });

    clearTimeout(timer);

    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        return {
          valid: false,
          liveVerified: true,
          error: `${config.name} rejected credentials (HTTP ${res.status}). Session token is expired or invalid.`,
        };
      }
      console.warn(`[SessionVerifier] ScraperAPI probe returned HTTP ${res.status} for ${config.name}`);
      return {
        ...structuralCheck,
        liveVerified: false,
      };
    }

    const html = await res.text();
    const finalUrl = res.url || '';

    // Check if the response indicates a login redirect or authwall
    const hasLoginIndicator = config.loginUrlIndicators.some(
      (ind) => finalUrl.toLowerCase().includes(ind) || html.toLowerCase().includes(ind)
    );

    const hasAuthwall =
      html.includes('authwall') ||
      html.includes('Sign In') && html.includes('password') && !html.includes('feed-identity-module');

    if (hasLoginIndicator || hasAuthwall) {
      return {
        valid: false,
        liveVerified: true,
        error: `${config.name} session has expired or requires re-authentication.`,
      };
    }

    // Attempt to extract profile name from response if present
    let extractedName: string | null = null;
    let extractedEmail: string | null = null;

    if (normProvider === 'linkedin') {
      const nameMatch = html.match(/<title>([^<]+)\s*\|\s*LinkedIn<\/title>/i);
      if (nameMatch && nameMatch[1] && !nameMatch[1].toLowerCase().includes('feed')) {
        extractedName = nameMatch[1].trim();
      }
    } else if (normProvider === 'indeed') {
      const emailMatch = html.match(/"email"\s*:\s*"([^"]+@[-a-z0-9.]+)"/i);
      if (emailMatch) extractedEmail = emailMatch[1];
    }

    console.info(`[SessionVerifier] ${config.name} session live verified successfully!`);

    return {
      valid: true,
      liveVerified: true,
      storageState: structuralCheck.storageState,
      expiresAt: structuralCheck.expiresAt,
      daysRemaining: structuralCheck.daysRemaining,
      isExpiringSoon: structuralCheck.isExpiringSoon,
      profileName: extractedName,
      profileEmail: extractedEmail,
    };
  } catch (err: any) {
    console.warn(`[SessionVerifier] ScraperAPI live probe error for ${config.name}: ${err.message}`);
    // If ScraperAPI is temporarily unreachable, fallback gracefully to structural check
    return {
      ...structuralCheck,
      liveVerified: false,
    };
  }
}
