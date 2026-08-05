import { gotScraping } from 'got-scraping';
import * as cheerio from 'cheerio';
import { reformatJobDescriptionWithGemini } from './formatter';
import { cleanJobUrl } from './urlUtils';

/**
 * Returns true only if `desc` looks like a real job description.
 * Threshold is 1000 chars — real descriptions are always at least that long.
 * A bare tracking URL (e.g. from an email link) may be hundreds of chars but
 * is not a description, so we also detect URL-only content explicitly.
 */
export function isDescriptionAdequate(desc?: string | null): boolean {
    if (!desc) return false;
    const clean = desc.trim();

    // Hard minimum: real descriptions are always >= 1000 chars
    if (clean.length < 1000) return false;

    const lower = clean.toLowerCase();

    // Detect fallback placeholder strings generated during bulk scraping or email import
    if (
      lower.includes("click link to view full details") ||
      (lower.includes("job listing for ") && lower.includes("click link")) ||
      (lower.includes("job opportunity imported from your email") && clean.length < 1500) ||
      lower.startsWith("apply at:") ||
      /^\s*job listing for .* click link to view full details/i.test(clean)
    ) {
      return false;
    }

    // "Found via email link: <url>" — the URL alone can be hundreds of chars but is not a description
    if (/found via email/i.test(clean)) return false;
    if (/position at/i.test(clean) && clean.length < 1200) return false;

    // Content that is almost entirely a single URL
    if (/^https?:\/\/\S+$/.test(clean)) return false;

    // Detect auth checkpoint / login wall content
    if (
      lower.includes("we're signing you in") ||
      lower.includes("signing you in") ||
      lower.includes("checkpoint/lg/login") ||
      lower.includes("discover people, jobs") ||
      lower.includes("remain on this page, you'll be signed in") ||
      lower.includes("sign in to view") ||
      lower.includes("login to view") ||
      lower.includes("account.ycombinator.com/authenticate") ||
      lower.includes("workatastartup.com/application")
    ) {
      return false;
    }

    return true;
}

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

async function fetchViaWorkerPlaywright(url: string): Promise<string | null> {
    const workerUrl = process.env.WORKER_URL || 'http://167.99.55.186:3001';
    const workerApiKey = process.env.WORKER_API_KEY;
    if (!workerApiKey) return null;

    try {
        console.info(`[JobFetcher] Routing fetch request to Worker Playwright stealth endpoint for: ${url}`);
        const res = await gotScraping({
            url: `${workerUrl.replace(/\/$/, '')}/fetch-job-details`,
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${workerApiKey}`,
                'Content-Type': 'application/json'
            },
            json: { url },
            timeout: { request: 40000 },
            retry: { limit: 0 },
            throwHttpErrors: false,
            responseType: 'json'
        });

        if (res.statusCode >= 200 && res.statusCode < 300) {
            const body = res.body as any;
            if (body?.success && body?.description) {
                const formatted = await reformatJobDescriptionWithGemini(body.description);
                if (isDescriptionAdequate(formatted)) return formatted;
                if (isDescriptionAdequate(body.description)) return body.description;
            }
        }
    } catch (e: any) {
        console.warn(`[JobFetcher] Worker Playwright fetch failed for ${url}: ${e.message}`);
    }
    return null;
}

export async function fetchJobDescription(rawUrl: string): Promise<string | null> {
    if (!rawUrl) return null;
    const url = cleanJobUrl(rawUrl);

    // Known anti-bot / protected sites: route directly to DigitalOcean Droplet Worker Playwright stealth scraper
    const isProtectedTarget = (
        url.includes('ziprecruiter.com/ekm/') ||
        url.includes('glassdoor.com/job-listing/') ||
        url.includes('glassdoor.com/partner/jobListing') ||
        url.includes('workatastartup.com') ||
        url.includes('ycombinator.com')
    );

    if (isProtectedTarget) {
        console.info(`[JobFetcher] Protected target detected (${url}). Attempting Worker Playwright stealth scrape...`);
        const workerResult = await fetchViaWorkerPlaywright(url);
        if (workerResult) return workerResult;
    }

    // Fast-fail on known strict auth-walls where login forms are required
    if (url.includes('account.ycombinator.com/authenticate')) {
        console.info(`Skipping fetch for known auth wall: ${url}`);
        return null;
    }

    // --- Dice.com: use their public job-posting-service REST API ---
    const diceMatch = url.match(/dice\.com\/job-detail\/([a-f0-9-]{36})/i);
    if (diceMatch) {
        const jobUuid = diceMatch[1];
        try {
            const apiUrl = `https://job-posting-service.dice.com/jobProfile/${jobUuid}`;
            const apiRes = await gotScraping({
                url: apiUrl,
                headers: { Accept: 'application/json' },
                timeout: { request: 15000 },
                retry: { limit: 0 },
                throwHttpErrors: false,
            });
            if (apiRes.statusCode >= 200 && apiRes.statusCode < 300) {
                const data = JSON.parse(apiRes.body.toString());
                const rawDesc: string = data.descriptionHtml || data.description || '';
                if (rawDesc.length > 100) {
                    const textOnly = rawDesc.replace(/<[^>]+>/g, ' ').replace(/\s{2,}/g, ' ').trim();
                    const formatted = await reformatJobDescriptionWithGemini(rawDesc);
                    if (isDescriptionAdequate(formatted)) return formatted;
                    if (isDescriptionAdequate(textOnly)) return textOnly;
                }
            }
        } catch (e: any) {
            console.warn(`Dice API fetch failed for ${url}: ${e.message}`);
        }
    }

    const extractContent = async (rawHtml: string): Promise<string | null> => {
        const $ = cheerio.load(rawHtml);

        let jsonLdDesc = '';
        $('script[type="application/ld+json"]').each((_, el) => {
            try {
                const raw = $(el).html() || '';
                const data = JSON.parse(raw);
                const items = Array.isArray(data) ? data : (data['@graph'] && Array.isArray(data['@graph'])) ? data['@graph'] : [data];
                for (const item of items) {
                    if (item && typeof item.description === 'string' && item.description.length > 50) {
                        jsonLdDesc = item.description;
                        break;
                    }
                }
            } catch {}
        });

        if (!jsonLdDesc) {
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
            return await reformatJobDescriptionWithGemini(cleanDesc);
        }

        $('script, style, noscript, nav, header, footer, iframe, svg').remove();
        const primarySelectors = '#jobDescriptionText, .jobsearch-JobComponent-description, #JobDescriptionContainer, .jobDescriptionContent, .show-more-less-html__markup, [data-automation-id="jobPostingDescription"]';
        const fallbackSelectors = 'main, article, .job-description, .job_description, #job-description, .posting-requirements, .section-description, [class*="description"], [class*="posting"], [class*="details"], [id*="description"], [id*="posting"]';
        
        let htmlStr = $(primarySelectors).first().html() || $(fallbackSelectors).first().html() || $('body').html() || '';
        if (htmlStr.trim().length > 100) {
            const formatted = await reformatJobDescriptionWithGemini(htmlStr.trim());
            if (isDescriptionAdequate(formatted)) {
                return formatted;
            }
        }

        return null;
    };

    // Direct attempt
    try {
        const res = await gotScraping({
            url,
            timeout: { request: 15000 },
            retry: { limit: 0 },
            throwHttpErrors: false,
        });
        if (res.statusCode >= 200 && res.statusCode < 300) {
            const bodyStr = res.body.toString();
            if (!bodyStr.includes('Just a moment...') && !bodyStr.includes('cf-challenge-error-title')) {
                const extracted = await extractContent(bodyStr);
                if (extracted) return extracted;
            }
        }
    } catch (e: any) {
        console.warn(`Direct fetch failed for ${url}: ${e.message}`);
    }

    // Scrape.do proxy fallback
    if (process.env.SCRAPEDO_API_KEY) {
        console.info(`Falling back to Scrape.do for ${url}`);
        try {
            const scrapeDoUrl = `http://api.scrape.do?token=${process.env.SCRAPEDO_API_KEY}&super=true&render=true&url=${encodeURIComponent(url)}`;
            const sdRes = await gotScraping({
                url: scrapeDoUrl,
                timeout: { request: 30000 },
                retry: { limit: 0 },
                throwHttpErrors: false,
            });
            if (sdRes.statusCode >= 200 && sdRes.statusCode < 300) {
                const extracted = await extractContent(sdRes.body);
                if (extracted) return extracted;
            }
            console.warn(`Scrape.do fallback failed for ${url} (Status: ${sdRes.statusCode})`);
        } catch (err: any) {
            console.warn(`Scrape.do fallback error for ${url}: ${err.message}`);
        }
    }

    // Final fallback: DigitalOcean Droplet Worker Playwright stealth browser
    if (!isProtectedTarget) {
        console.info(`Attempting final fallback to Worker Playwright stealth browser for ${url}...`);
        const workerResult = await fetchViaWorkerPlaywright(url);
        if (workerResult) return workerResult;
    }

    return null;
}
