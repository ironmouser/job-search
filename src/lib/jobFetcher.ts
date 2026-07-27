import { gotScraping } from 'got-scraping';
import * as cheerio from 'cheerio';
import { reformatJobDescriptionWithGemini } from './formatter';
import { cleanJobUrl } from './urlUtils';

export function isDescriptionAdequate(desc?: string | null): boolean {
    if (!desc) return false;
    const clean = desc.trim();
    if (clean.length < 250) return false;
    const lower = clean.toLowerCase();
    
    // Detect fallback placeholder strings generated during bulk scraping or email import
    if (
      lower.includes("click link to view full details") ||
      lower.includes("job listing for ") && lower.includes("click link") ||
      lower.includes("job opportunity imported from your email") && clean.length < 500 ||
      lower.startsWith("apply at:") ||
      /^\s*job listing for .* click link to view full details/i.test(clean)
    ) {
      return false;
    }

    if (/found via email/i.test(clean) && clean.length < 500) return false;
    if (/position at/i.test(clean) && clean.length < 300) return false;

    // Detect auth checkpoint / login wall content
    if (
      lower.includes("we're signing you in") || 
      lower.includes("signing you in") ||
      lower.includes("checkpoint/lg/login") || 
      lower.includes("discover people, jobs") || 
      lower.includes("remain on this page, you'll be signed in") ||
      lower.includes("sign in to view") ||
      lower.includes("login to view")
    ) {
      return false;
    }

    return true;
}

export async function fetchJobDescription(rawUrl: string): Promise<string | null> {
    if (!rawUrl) return null;
    const url = cleanJobUrl(rawUrl);

    const extractContent = async (rawHtml: string): Promise<string | null> => {
        const $ = cheerio.load(rawHtml);

        // 1. Try extracting from JSON-LD schema (schema.org/JobPosting)
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

        // Try Indeed / site embedded script data
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

        // 2. Remove script/style noise and search DOM using targeted selectors
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

    return null;
}
