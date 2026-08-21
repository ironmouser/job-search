import { gotScraping } from 'got-scraping';
import * as cheerio from 'cheerio';
import { reformatJobDescriptionWithGemini, preCleanHtml } from './formatter';
import { cleanJobUrl, isNonJobUrl } from './urlUtils';
import { cleanCompanyName } from './cleaners';
import { fetchWithScraperAPI, extractATSUrlFromHtml } from './scraperapi';

import { isDescriptionAdequate } from './descriptionUtils';
export { isDescriptionAdequate };


/**
 * When a job description is a stub (e.g. "Found via email link: https://..."),
 * extract the first URL from it so the fetcher can follow it to get the real description.
 * Returns null if no URL is found.
 */
export function extractUrlFromStubDescription(desc?: string | null): string | null {
    if (!desc) return null;
    const match = desc.match(/https?:\/\/[^\s"'<>]+/);
    return match ? match[0] : null;
}

export interface FetchJobDescriptionResult {
    description: string;
    finalUrl?: string;
    /** Direct ATS application URL extracted during scraping, if found. Save as job.applicationUrl. */
    resolvedApplicationUrl?: string | null;
    /** Company name extracted during detail fetch if available */
    company?: string | null;
    /** Job title extracted during detail fetch if available */
    title?: string | null;
}

/**
 * fetchJobDescriptionDetailed — Fetches a full job description from any URL.
 *
 * Waterfall:
 *  1. Direct gotScraping (fast, free, works on most ATS portals)
 *  2. ScraperAPI with JS rendering (residential proxy + CAPTCHA solving, any site)
 *  3. Worker Playwright via /fetch-job-details (last resort, only if worker env vars are set)
 *
 * Also attempts to extract a direct ATS application URL during ScraperAPI fetches,
 * returned as resolvedApplicationUrl for callers to save as job.applicationUrl.
 */
export async function fetchJobDescriptionDetailed(rawUrl: string): Promise<FetchJobDescriptionResult | null> {
    if (!rawUrl) return null;
    const url = cleanJobUrl(rawUrl);

    if (isNonJobUrl(url)) {
        console.info(`[JobFetcher] Skipping fetch for known company profile / non-job URL: ${url}`);
        return null;
    }

    const simpleDesc = await _fetchJobDescription(url);
    if (simpleDesc) {
        return { 
            description: simpleDesc.description, 
            finalUrl: simpleDesc.finalUrl, 
            resolvedApplicationUrl: simpleDesc.resolvedApplicationUrl,
            company: simpleDesc.company || null,
            title: simpleDesc.title || null
        };
    }
    return null;
}

/**
 * Convenience export: fetches description only (no resolvedApplicationUrl needed).
 * Used by score route, rescrape-stubs, and fetch-and-score routes.
 */
export async function fetchJobDescription(rawUrl: string): Promise<string | null> {
    const result = await fetchJobDescriptionDetailed(rawUrl);
    return result?.description ?? null;
}

/**
 * Core fetch function. Returns the description, finalUrl, and any resolved ATS URL.
 */
async function _fetchJobDescription(url: string): Promise<{ description: string; finalUrl: string; resolvedApplicationUrl: string | null; company?: string | null; title?: string | null } | null> {
    if (!url) return null;

    if (isNonJobUrl(url)) {
        return null;
    }

    const extractContent = async (rawHtml: string): Promise<{ description: string; company?: string | null; title?: string | null } | null> => {
        const $ = cheerio.load(rawHtml);

        let jsonLdDesc = '';
        let jsonLdCompany = '';
        let jsonLdTitle = '';

        $('script[type="application/ld+json"]').each((_, el) => {
            try {
                const raw = $(el).html() || '';
                const data = JSON.parse(raw);
                const items = Array.isArray(data) ? data : (data['@graph'] && Array.isArray(data['@graph'])) ? data['@graph'] : [data];
                for (const item of items) {
                    if (item && typeof item.description === 'string' && item.description.length > 50) {
                        jsonLdDesc = item.description;
                        if (item.hiringOrganization?.name) jsonLdCompany = item.hiringOrganization.name;
                        if (item.title) jsonLdTitle = item.title;
                        break;
                    }
                }
            } catch {}
        });

        if (!jsonLdDesc) {
            // Indeed-style: mosaic-data / _INITIAL_STATE_ embedded JSON
            const mosaicScript = $('script#mosaic-data, script#_INITIAL_STATE_').html() || '';
            if (mosaicScript.includes('description')) {
                const match = mosaicScript.match(/"description"\s*:\s*("(?:[^"\\]|\\.)*")/);
                if (match && match[1]) {
                    try {
                        const parsedDesc = JSON.parse(match[1]);
                        if (parsedDesc && parsedDesc.length > 100) {
                            jsonLdDesc = parsedDesc;
                        }
                    } catch {}
                }
            }
        }

        const cleanDesc = jsonLdDesc.trim();
        if (cleanDesc.length > 100 && isDescriptionAdequate(cleanDesc)) {
            const preCleaned = preCleanHtml(cleanDesc);
            if (isDescriptionAdequate(preCleaned)) return { description: preCleaned, company: cleanCompanyName(jsonLdCompany) || null, title: jsonLdTitle || null };
            const formatted = await reformatJobDescriptionWithGemini(cleanDesc);
            if (isDescriptionAdequate(formatted)) return { description: formatted, company: cleanCompanyName(jsonLdCompany) || null, title: jsonLdTitle || null };
        }

        $('script, style, noscript, nav, header, footer, iframe, svg').remove();
        const primarySelectors = '#jobDescriptionText, .jobsearch-JobComponent-description, #JobDescriptionContainer, .jobDescriptionContent, .show-more-less-html__markup, [data-automation-id="jobPostingDescription"]';
        const fallbackSelectors = 'main, article, .job-description, .job_description, #job-description, .posting-requirements, .section-description, [class*="description"], [class*="posting"], [class*="details"], [id*="description"], [id*="posting"]';

        let htmlStr = $(primarySelectors).first().html() || $(fallbackSelectors).first().html() || $('body').html() || '';
        if (htmlStr.trim().length > 100) {
            const formatted = await reformatJobDescriptionWithGemini(htmlStr.trim());
            if (isDescriptionAdequate(formatted)) return { description: formatted, company: cleanCompanyName(jsonLdCompany) || null, title: jsonLdTitle || null };
        }

        return null;
    };

    // Fast-fail on known strict auth-walls where login forms are required
    if (url.includes('account.ycombinator.com/authenticate')) {
        console.info(`Skipping fetch for known auth wall: ${url}`);
        return null;
    }

    // --- Dice.com: fetch SSR HTML and parse JSON-LD / RSC streams ---
    const diceMatch = url.match(/dice\.com\/job-detail\/([a-f0-9-]{36})/i);
    if (diceMatch) {
        const jobUuid = diceMatch[1];
        const diceDetailUrl = `https://www.dice.com/job-detail/${jobUuid}`;
        try {
            const res = await gotScraping({
                url: diceDetailUrl,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.9',
                },
                timeout: { request: 15000 },
                retry: { limit: 0 },
                throwHttpErrors: false,
            });

            if (res.statusCode >= 200 && res.statusCode < 300) {
                const bodyStr = res.body.toString();
                const $d = cheerio.load(bodyStr);

                let diceTitle = '';
                let diceCompany = '';
                let diceDesc = '';

                // Check JSON-LD JobPosting first
                $d('script[type="application/ld+json"]').each((_, el) => {
                    try {
                        const data = JSON.parse($d(el).html() || '');
                        const arr = Array.isArray(data) ? data : [data];
                        for (const item of arr) {
                            if (item['@type'] === 'JobPosting') {
                                diceTitle = item.title || diceTitle;
                                diceCompany = item.hiringOrganization?.name || diceCompany;
                                diceDesc = item.description || diceDesc;
                            }
                        }
                    } catch {}
                });

                // Fallback to Next.js App Router RSC stream if JSON-LD missing
                if (!diceDesc) {
                    const rscRegex = /self\.__next_f\.push\(\[1,"([\s\S]*?)"\]\)/g;
                    let m: RegExpExecArray | null;
                    while ((m = rscRegex.exec(bodyStr)) !== null) {
                        try {
                            const raw = JSON.parse(`"${m[1]}"`);
                            if (raw.includes('jobDescription') || raw.includes('descriptionHtml') || raw.includes('jobSummary')) {
                                const descMatch = raw.match(/"(?:jobDescription|descriptionHtml|description)"\s*:\s*("(?:[^"\\]|\\.)*")/);
                                if (descMatch && descMatch[1]) {
                                    diceDesc = JSON.parse(descMatch[1]);
                                }
                            }
                            if (!diceCompany && raw.includes('companyName')) {
                                const compMatch = raw.match(/"companyName"\s*:\s*"([^"]+)"/);
                                if (compMatch && compMatch[1]) diceCompany = compMatch[1];
                            }
                        } catch {}
                    }
                }

                if (diceDesc && diceDesc.length > 80) {
                    const cleanedDesc = preCleanHtml(diceDesc);
                    if (isDescriptionAdequate(cleanedDesc)) {
                        return {
                            description: cleanedDesc,
                            finalUrl: diceDetailUrl,
                            company: cleanCompanyName(diceCompany) || null,
                            title: diceTitle || null,
                            resolvedApplicationUrl: null,
                        };
                    }
                    const formatted = await reformatJobDescriptionWithGemini(diceDesc);
                    if (isDescriptionAdequate(formatted)) {
                        return {
                            description: formatted,
                            finalUrl: diceDetailUrl,
                            company: cleanCompanyName(diceCompany) || null,
                            title: diceTitle || null,
                            resolvedApplicationUrl: null,
                        };
                    }
                }
            }
        } catch (e: any) {
            console.warn(`[JobFetcher] Direct Dice fetch failed for ${url}: ${e.message}`);
        }
    }

    // ── Tier 1: Direct fetch (fast, free) ─────────────────────────────────────
    try {
        const res = await gotScraping({
            url,
            timeout: { request: 5000 },
            retry: { limit: 0 },
            throwHttpErrors: false,
        });
        if (res.statusCode >= 200 && res.statusCode < 300) {
            const bodyStr = res.body.toString();
            if (!bodyStr.includes('Just a moment...') && !bodyStr.includes('cf-challenge-error-title')) {
                const extracted = await extractContent(bodyStr);
                if (extracted) {
                    return {
                        description: extracted.description,
                        company: extracted.company,
                        title: extracted.title,
                        finalUrl: url,
                        resolvedApplicationUrl: null
                    };
                }
            }
        }
    } catch (e: any) {
        console.warn(`Direct fetch failed for ${url}: ${e.message}`);
    }

    // ── Tier 2: ScraperAPI ───────────────────────────────────────────────────
    // Fast path: try raw HTML first (render=false, 1 credit, 5s timeout)
    const rawScraperHtml = await fetchWithScraperAPI(url, false, 5000);
    if (rawScraperHtml) {
        const resolvedApplicationUrl = extractATSUrlFromHtml(rawScraperHtml);
        const extracted = await extractContent(rawScraperHtml);
        if (extracted) {
            return {
                description: extracted.description,
                company: extracted.company,
                title: extracted.title,
                finalUrl: url,
                resolvedApplicationUrl
            };
        }
    }

    // Heavy path: escalate to JS rendering only if raw HTML yielded no description (7s timeout)
    const renderedScraperHtml = await fetchWithScraperAPI(url, true, 7000);
    if (renderedScraperHtml) {
        const resolvedApplicationUrl = extractATSUrlFromHtml(renderedScraperHtml);
        const extracted = await extractContent(renderedScraperHtml);
        if (extracted) {
            return {
                description: extracted.description,
                company: extracted.company,
                title: extracted.title,
                finalUrl: url,
                resolvedApplicationUrl
            };
        }
        if (resolvedApplicationUrl) {
            console.info(`[JobFetcher] ScraperAPI found ATS URL but no description for ${url}: ${resolvedApplicationUrl}`);
        }
    }

    // ── Tier 3: Worker Playwright (last resort — full headless browser on Railway) ─
    const workerUrl = process.env.WORKER_URL;
    const workerApiKey = process.env.WORKER_API_KEY;
    if (workerUrl && workerApiKey) {
        try {
            console.info(`[JobFetcher] Attempting Worker Playwright fallback for: ${url}`);
            const res = await gotScraping({
                url: `${workerUrl.replace(/\/$/, '')}/fetch-job-details`,
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${workerApiKey}`,
                    'Content-Type': 'application/json'
                },
                json: { url },
                timeout: { request: 8000 },
                retry: { limit: 0 },
                throwHttpErrors: false,
                responseType: 'json'
            });

            if (res.statusCode >= 200 && res.statusCode < 300) {
                const body = res.body as any;
                if (body?.success && body?.description) {
                    const formatted = await reformatJobDescriptionWithGemini(body.description);
                    const finalDesc = isDescriptionAdequate(formatted) ? formatted : body.description;
                    if (isDescriptionAdequate(finalDesc)) {
                        return {
                            description: finalDesc,
                            finalUrl: body.finalUrl ? cleanJobUrl(body.finalUrl) : url,
                            resolvedApplicationUrl: null,
                        };
                    }
                }
            }
        } catch (e: any) {
            console.warn(`[JobFetcher] Worker Playwright fallback failed for ${url}: ${e.message}`);
        }
    }

    return null;
}
