import { prisma } from './prisma';
import { cleanCompanyName } from './cleaners';
import { isKnownATSUrl, cleanJobUrl } from './urlUtils';

export interface SerpApiJob {
  title: string;
  company: string;
  location: string;
  salary?: string | null;
  description: string;
  url: string;
  applicationUrl?: string | null;
  source: string;
  isEasyApply?: boolean;
}

const CACHE_TTL_MS = 12 * 60 * 60 * 1000; // 12 Hours TTL

/**
 * Scrapes jobs from Google Jobs via SerpAPI.
 *
 * Benefits:
 *  - Returns the FULL job description in the initial payload (instant UX).
 *  - Aggregates postings from LinkedIn, Indeed, ZipRecruiter, Glassdoor, Workday, and company portals.
 *  - Extracts direct ATS apply links (Workday, Greenhouse, Lever, etc.) in apply_options.
 *  - Uses a shared 12-hour PostgreSQL cache so identical searches across users cost 0 API calls.
 */
export async function scrapeSerpApiGoogleJobs(
  keyword: string,
  location: string = 'Remote'
): Promise<SerpApiJob[]> {
  const apiKey = process.env.SERPAPI_API_KEY;
  if (!apiKey) {
    return [];
  }

  const cleanKeyword = (keyword || '').trim();
  const cleanLoc = (location || '').trim();
  const cacheKey = {
    source: 'serpapi_google_jobs',
    keyword: cleanKeyword.toLowerCase(),
    location: cleanLoc.toLowerCase(),
  };

  // ── 1. Check Shared 12-Hour Cache ──────────────────────────────────────────
  try {
    const cached = await prisma.scrapeCache.findUnique({
      where: { source_keyword_location: cacheKey },
    });

    if (cached && cached.expiresAt > new Date()) {
      console.info(`[SerpAPI] Cache hit for "${cleanKeyword}" in "${cleanLoc}" (${(cached.rawJobs as any[])?.length || 0} jobs)`);
      return (cached.rawJobs as any[]) || [];
    }
  } catch (cacheErr: any) {
    console.warn(`[SerpAPI] Cache read warning: ${cacheErr.message}`);
  }

  // ── 2. Query SerpAPI Google Jobs ───────────────────────────────────────────
  const jobs: SerpApiJob[] = [];
  let errorDetails: string | null = null;

  try {
    console.info(`[SerpAPI] Querying Google Jobs for: "${cleanKeyword}" in "${cleanLoc}"`);

    // Build the Google search query
    let query = cleanKeyword;
    if (cleanLoc && !cleanLoc.toLowerCase().includes('remote')) {
      query += ` in ${cleanLoc}`;
    } else if (cleanLoc.toLowerCase().includes('remote')) {
      query += ' remote';
    }

    const params = new URLSearchParams({
      engine: 'google_jobs',
      q: query,
      hl: 'en',
      gl: 'us',
      api_key: apiKey,
    });

    if (cleanLoc && !cleanLoc.toLowerCase().includes('remote')) {
      params.set('location', cleanLoc);
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);

    const res = await fetch(`https://serpapi.com/search.json?${params.toString()}`, {
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (res.ok) {
      const data = (await res.json()) as any;
      const jobResults = Array.isArray(data?.jobs_results) ? data.jobs_results : [];

      for (const item of jobResults) {
        const title = item.title?.trim();
        const rawCompany = item.company_name?.trim();
        if (!title || !rawCompany) continue;

        const company = cleanCompanyName(rawCompany);
        const jobLoc = item.location || cleanLoc || 'Remote';
        const salary = item.detected_extensions?.salary || null;
        const description = (item.description || '').trim();

        // Direct ATS Link extraction from apply_options
        const applyOptions: Array<{ title?: string; link?: string }> = Array.isArray(item.apply_options)
          ? item.apply_options
          : [];

        let directAtsUrl: string | null = null;
        let primaryUrl = item.share_link || '';

        // Look for direct ATS portals (Workday, Greenhouse, Lever, etc.) in apply options
        for (const opt of applyOptions) {
          if (opt.link) {
            if (isKnownATSUrl(opt.link)) {
              directAtsUrl = cleanJobUrl(opt.link);
              break;
            }
          }
        }

        // If no direct ATS found, prefer the first apply option or fallback to share_link
        if (!primaryUrl && applyOptions.length > 0 && applyOptions[0].link) {
          primaryUrl = cleanJobUrl(applyOptions[0].link);
        }

        // Check if there is an external employer application option
        const hasExternalEmployerApply = applyOptions.some(opt => {
          const l = (opt.link || '').toLowerCase();
          return l && !l.includes('linkedin.com') && !l.includes('indeed.com') && !l.includes('ziprecruiter.com') && !l.includes('glassdoor.com');
        });

        const viaSource = item.via?.replace(/^via\s+/i, '').trim() || 'Google Jobs';
        const viaLower = viaSource.toLowerCase();
        const isEasyApply = !directAtsUrl && !hasExternalEmployerApply && (
          viaLower.includes('linkedin') ||
          viaLower.includes('indeed') ||
          viaLower.includes('ziprecruiter') ||
          viaLower.includes('glassdoor') ||
          viaLower.includes('dice') ||
          applyOptions.some(o => (o.link || '').includes('linkedin.com/jobs/view') || (o.link || '').includes('indeed.com/viewjob'))
        );

        jobs.push({
          title,
          company,
          location: jobLoc,
          salary,
          description: description || `Apply at: ${primaryUrl || directAtsUrl}`,
          url: primaryUrl || directAtsUrl || `https://www.google.com/search?q=${encodeURIComponent(title + ' ' + company)}`,
          applicationUrl: directAtsUrl || null,
          source: viaSource,
          isEasyApply,
        });
      }

      console.info(`[SerpAPI] Successfully fetched ${jobs.length} jobs for "${cleanKeyword}" in "${cleanLoc}"`);
    } else {
      const errText = await res.text().catch(() => '');
      errorDetails = `HTTP ${res.status}: ${errText.slice(0, 300)}`;
      console.warn(`[SerpAPI] Request failed: ${errorDetails}`);
    }
  } catch (err: any) {
    errorDetails = err.message || 'Unknown SerpAPI error';
    console.warn(`[SerpAPI] Fetch error for "${cleanKeyword}": ${errorDetails}`);
  }

  // ── 3. Save to Scraper Log ─────────────────────────────────────────────────
  try {
    await prisma.scraperLog.create({
      data: {
        scraperName: 'SerpAPI (Google Jobs)',
        targetUrl: `https://serpapi.com/search.json?engine=google_jobs&q=${encodeURIComponent(cleanKeyword)}`,
        status: jobs.length > 0 ? 'SUCCESS' : errorDetails ? 'FAILURE' : 'PARTIAL',
        resultsCount: jobs.length,
        errorDetails,
      },
    });
  } catch (logErr: any) {
    console.warn(`[SerpAPI] Failed to write scraperLog: ${logErr.message}`);
  }

  // ── 4. Save to Shared 12-Hour Cache ────────────────────────────────────────
  if (jobs.length > 0) {
    try {
      await prisma.scrapeCache.upsert({
        where: { source_keyword_location: cacheKey },
        update: {
          rawJobs: jobs as any,
          expiresAt: new Date(Date.now() + CACHE_TTL_MS),
        },
        create: {
          ...cacheKey,
          rawJobs: jobs as any,
          expiresAt: new Date(Date.now() + CACHE_TTL_MS),
        },
      });
    } catch (saveCacheErr: any) {
      console.warn(`[SerpAPI] Failed to save cache: ${saveCacheErr.message}`);
    }
  }

  return jobs;
}

/**
 * Extracts the top distinct job titles discovered from search results, sorted by frequency.
 * Used to suggest related roles to users (especially cold-start users without resumes).
 */
export function extractTopTitlesFromResults(
  jobs: Array<{ title?: string }>,
  targetKeyword?: string,
  limit = 5
): string[] {
  if (!jobs || jobs.length === 0) return [];
  const cleanTarget = (targetKeyword || '').trim().toLowerCase();
  const freq = new Map<string, { count: number; canonical: string }>();

  for (const j of jobs) {
    if (!j?.title) continue;
    const title = j.title.trim();
    if (title.length < 3 || title.length > 75) continue;
    const lower = title.toLowerCase();

    // Skip if identical to the search keyword
    if (cleanTarget && lower === cleanTarget) continue;

    const existing = freq.get(lower);
    if (existing) {
      existing.count += 1;
    } else {
      freq.set(lower, { count: 1, canonical: title });
    }
  }

  return Array.from(freq.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, limit)
    .map(item => item.canonical);
}

/**
 * Fast lookup on Google Jobs via SerpAPI to find full job description for a specific title + company.
 * Used as a high-reliability fallback when direct URL scraping fails or hits bot protection.
 */
export async function searchJobDescriptionFromSerpApi(
  title: string,
  company: string
): Promise<{ description: string; applicationUrl?: string | null; finalUrl?: string } | null> {
  const apiKey = process.env.SERPAPI_API_KEY;
  if (!apiKey || !title || !company) return null;

  try {
    const cleanTitle = title.trim();
    const cleanCompany = company.trim();
    const query = `"${cleanTitle}" "${cleanCompany}"`;

    console.info(`[SerpAPI Fallback] Searching Google Jobs for: ${query}`);

    const params = new URLSearchParams({
      engine: 'google_jobs',
      q: query,
      hl: 'en',
      gl: 'us',
      api_key: apiKey,
    });

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);

    const res = await fetch(`https://serpapi.com/search.json?${params.toString()}`, {
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (res.ok) {
      const data = (await res.json()) as any;
      const jobResults = Array.isArray(data?.jobs_results) ? data.jobs_results : [];

      if (jobResults.length > 0) {
        for (const item of jobResults) {
          const desc = (item.description || '').trim();
          if (desc && desc.length > 200) {
            const applyOptions: Array<{ title?: string; link?: string }> = Array.isArray(item.apply_options)
              ? item.apply_options
              : [];
            let directAtsUrl: string | null = null;
            for (const opt of applyOptions) {
              if (opt.link && isKnownATSUrl(opt.link)) {
                directAtsUrl = cleanJobUrl(opt.link);
                break;
              }
            }
            const primaryUrl = applyOptions.length > 0 && applyOptions[0].link ? cleanJobUrl(applyOptions[0].link) : item.share_link;
            return {
              description: desc,
              applicationUrl: directAtsUrl || primaryUrl || null,
              finalUrl: primaryUrl || item.share_link || undefined
            };
          }
        }
      }
    }
  } catch (err: any) {
    console.warn(`[SerpAPI Fallback Notice]: ${err.message}`);
  }
  return null;
}

