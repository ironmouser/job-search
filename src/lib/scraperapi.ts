import { KNOWN_ATS_DOMAINS, isKnownATSUrl, isAggregatorUrl } from './urlUtils';
export { KNOWN_ATS_DOMAINS, isKnownATSUrl, isAggregatorUrl };

const SCRAPERAPI_BASE = 'https://api.scraperapi.com';

/**
 * Fetches a URL through ScraperAPI with full JavaScript rendering.
 * Returns the rendered HTML string, or null if ScraperAPI is not configured or the request fails.
 *
 * @param url - The target URL to scrape
 * @param renderJs - Whether to enable JS rendering (default: true, needed for SPAs)
 * @param timeoutMs - Request timeout in ms (default: 35 seconds)
 */
export async function fetchWithScraperAPI(
  url: string,
  renderJs = true,
  timeoutMs = 35_000
): Promise<string | null> {
  const apiKey = process.env.SCRAPERAPI_KEY;
  if (!apiKey) {
    return null;
  }

  try {
    console.info(`[ScraperAPI] Fetching: ${url} (js_render=${renderJs})`);

    const params = new URLSearchParams({
      api_key: apiKey,
      url,
      render: renderJs ? 'true' : 'false',
      country_code: 'us',
    });

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const res = await fetch(`${SCRAPERAPI_BASE}?${params.toString()}`, {
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (res.ok) {
      const body = await res.text();
      // ScraperAPI returns a 200 with a small error body on some failures
      if (body.length < 200 && body.includes('"error"')) {
        console.warn(`[ScraperAPI] API-level error for ${url}: ${body.slice(0, 200)}`);
        return null;
      }
      console.info(`[ScraperAPI] Success for ${url} — body length: ${body.length}`);
      return body;
    }

    console.warn(`[ScraperAPI] HTTP ${res.status} for ${url}`);
    return null;
  } catch (err: any) {
    console.warn(`[ScraperAPI] Request failed for ${url}: ${err.message}`);
    return null;
  }
}

/**
 * Extracts a direct ATS application URL from rendered HTML.
 *
 * Checks in priority order:
 *  1. JSON-LD schema.org/JobPosting directApply URL
 *  2. JSON-LD schema.org/JobPosting url field pointing to known ATS
 *  3. All <a href> links pointing to known ATS domains
 *  4. Meta refresh redirect targets pointing to known ATS domains
 *  5. Script-embedded window.location or redirect URLs pointing to known ATS domains
 *
 * Returns the first matched direct ATS URL, or null if none found.
 */
export function extractATSUrlFromHtml(html: string): string | null {
  if (!html || html.length < 100) return null;

  // ── 1 & 2. JSON-LD schema.org/JobPosting ──────────────────────────────────
  const jsonLdMatches = html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
  for (const match of jsonLdMatches) {
    try {
      const data = JSON.parse(match[1]);
      const items = Array.isArray(data)
        ? data
        : data['@graph'] && Array.isArray(data['@graph'])
        ? data['@graph']
        : [data];

      for (const item of items) {
        if (item?.['@type'] === 'JobPosting') {
          // directApply points straight to the ATS application form
          if (item.directApply && item.url && isKnownATSUrl(item.url)) {
            return cleanUrl(item.url);
          }
          // Standard url field pointing to a known ATS
          if (item.url && isKnownATSUrl(item.url)) {
            return cleanUrl(item.url);
          }
        }
      }
    } catch {
      // Invalid JSON — skip
    }
  }

  // ── 3. All <a href> links ──────────────────────────────────────────────────
  const hrefMatches = html.matchAll(/href=["'](https?:\/\/[^"'\s>]+)["']/gi);
  for (const match of hrefMatches) {
    const href = match[1];
    if (isKnownATSUrl(href)) {
      return cleanUrl(href);
    }
  }

  // ── 4. Meta refresh ────────────────────────────────────────────────────────
  const metaMatch = html.match(/<meta[^>]*http-equiv=["']refresh["'][^>]*content=["'][^"']*url=([^"'\s]+)/i);
  if (metaMatch && isKnownATSUrl(metaMatch[1])) {
    return cleanUrl(metaMatch[1]);
  }

  // ── 5. Script-embedded redirect URLs ─────────────────────────────────────
  // Catches window.location = "https://..." patterns
  const scriptMatches = html.matchAll(/(https?:\/\/[a-z0-9.-]+(?:myworkdayjobs|greenhouse|lever|ashbyhq|workable|smartrecruiters|icims|taleo|bamboohr|workforcenow\.adp|successfactors|jobvite)[^"'\s<>]+)/gi);
  for (const match of scriptMatches) {
    const candidate = match[1];
    if (isKnownATSUrl(candidate)) {
      return cleanUrl(candidate);
    }
  }

  return null;
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function cleanUrl(url: string): string {
  try {
    const parsed = new URL(url.trim());
    // Strip common tracking params
    const trackingParams = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'src', 'ref'];
    trackingParams.forEach((p) => parsed.searchParams.delete(p));
    return parsed.toString();
  } catch {
    return url.trim();
  }
}
