import { gotScraping } from 'got-scraping';
import * as cheerio from 'cheerio';
import { reformatJobDescriptionWithGemini } from './formatter';

export function isDescriptionAdequate(desc?: string | null): boolean {
    if (!desc) return false;
    const clean = desc.trim();
    if (clean.length < 250) return false;
    const lower = clean.toLowerCase();
    if (lower.startsWith('apply at:')) return false;
    if (/found via email/i.test(clean) && clean.length < 500) return false;
    if (/position at/i.test(clean) && clean.length < 300) return false;
    return true;
}

export async function fetchJobDescription(url: string): Promise<string | null> {
    if (!url) return null;

    const extractContent = async (rawHtml: string): Promise<string | null> => {
        const $ = cheerio.load(rawHtml);

        // 1. Try extracting from JSON-LD schema (schema.org/JobPosting)
        let jsonLdDesc = '';
        $('script[type="application/ld+json"]').each((_, el) => {
            try {
                const data = JSON.parse($(el).html() || '');
                if (typeof data.description === 'string') {
                    jsonLdDesc = data.description;
                } else if (data['@graph'] && Array.isArray(data['@graph'])) {
                    const item = data['@graph'].find((g: any) => typeof g?.description === 'string');
                    if (item?.description) jsonLdDesc = item.description;
                }
            } catch {}
        });

        const cleanDesc = jsonLdDesc.trim();
        if (cleanDesc.length > 100) {
            return await reformatJobDescriptionWithGemini(cleanDesc);
        }

        // 2. Remove script/style noise and search DOM
        $('script, style, noscript, nav, header, footer, iframe, svg').remove();
        const containerSelector = 'main, article, .job-description, .job_description, #job-description, #jobDescriptionText, .posting-requirements, .section-description, [data-automation-id="jobPostingDescription"], [class*="description"], [class*="posting"], [class*="details"], [id*="description"], [id*="posting"]';
        const htmlStr = $(containerSelector).html() || $('body').html() || '';
        if (htmlStr.trim().length > 100) {
            return await reformatJobDescriptionWithGemini(htmlStr.trim());
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
