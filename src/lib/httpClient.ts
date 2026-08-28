/**
 * src/lib/httpClient.ts
 *
 * Universal HTTP client with gotScraping TLS/browser emulation and native fetch fallback.
 */

let cachedGotScraping: any = null;

export async function requestScraping(options: {
  url: string;
  method?: 'GET' | 'POST';
  json?: any;
  responseType?: 'json' | 'text';
  timeoutMs?: number;
  headers?: Record<string, string>;
}): Promise<{ statusCode: number; body: any }> {
  const { url, method = 'GET', json, responseType = 'text', timeoutMs = 15000, headers = {} } = options;

  if (!cachedGotScraping) {
    try {
      const mod: any = await import('got-scraping');
      cachedGotScraping = mod.gotScraping || mod.default;
    } catch {
      // fallback to native fetch
    }
  }

  if (cachedGotScraping) {
    try {
      const res = await cachedGotScraping({
        url,
        method,
        json,
        responseType,
        timeout: { request: timeoutMs },
        retry: { limit: 1 },
        throwHttpErrors: false,
        headers,
      });
      return {
        statusCode: res.statusCode,
        body: res.body,
      };
    } catch (gotErr: any) {
      console.warn(`[httpClient] gotScraping error for ${url}, falling back to fetch:`, gotErr.message);
    }
  }

  // Native fetch fallback
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const init: RequestInit = {
      method,
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': responseType === 'json' ? 'application/json, text/plain, */*' : 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        ...headers,
      },
    };

    if (json) {
      init.body = JSON.stringify(json);
      (init.headers as any)['Content-Type'] = 'application/json';
    }

    const res = await fetch(url, init);
    clearTimeout(timeoutId);

    const body = responseType === 'json' ? await res.json().catch(() => null) : await res.text();

    return {
      statusCode: res.status,
      body,
    };
  } catch (err: any) {
    return {
      statusCode: 500,
      body: err.message,
    };
  }
}
