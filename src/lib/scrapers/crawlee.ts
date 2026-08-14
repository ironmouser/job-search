import * as cheerio from 'cheerio';

/**
 * Lightweight HTTP scraper using fetch + Cheerio.
 * Replaces PlaywrightCrawler to avoid needing Chromium on the server.
 */

import { gotScraping } from 'got-scraping';
import got from 'got';
import { prisma } from '../prisma';
import { reformatJobDescriptionWithGemini } from '../formatter';
import { cleanCompanyName } from '../cleaners';
import { isSafePublicUrl } from '../urlUtils';

async function fetchPage(url: string, retries = 3): Promise<{ $: cheerio.CheerioAPI | null, usedFirecrawl: boolean }> {
    if (!isSafePublicUrl(url)) {
        console.warn(`[fetchPage] Blocked potentially unsafe / internal URL: ${url}`);
        return { $: null, usedFirecrawl: false };
    }

    for (let attempt = 1; attempt <= retries; attempt++) {
        let needsFallback = false;
        try {
            const res = await gotScraping({
                url,
                timeout: { request: 8000 },
                retry: { limit: 0 },
                throwHttpErrors: false,
            });

            if (res.statusCode >= 200 && res.statusCode < 300) {
                const bodyStr = res.body.toString();
                const $ = cheerio.load(res.body);
                const pageTitle = $('title').text().toLowerCase();
                
                if (
                    bodyStr.includes('Just a moment...') || 
                    bodyStr.includes('cf-challenge-error-title') ||
                    pageTitle.includes('cloudflare') ||
                    pageTitle.includes('attention required') ||
                    pageTitle.includes('security check') ||
                    pageTitle.includes('access denied')
                ) {
                    console.warn(`Attempt ${attempt}: Cloudflare block detected on ${url} despite 200 OK`);
                    needsFallback = true;
                } else {
                    return { $, usedFirecrawl: false };
                }
            } else if (res.statusCode === 403 || res.statusCode === 429) {
                console.warn(`Attempt ${attempt}: Anti-bot status code ${res.statusCode} detected on ${url}`);
                needsFallback = true;
            } else {
                console.warn(`Attempt ${attempt}: Non-ok status code ${res.statusCode} fetching ${url}`);
            }
        } catch (e: any) {
            console.warn(`Attempt ${attempt}: Error fetching ${url}: ${e.message}`);
            if (e.message?.includes('403') || e.message?.includes('429') || e.message?.toLowerCase().includes('cloudflare')) {
                needsFallback = true;
            }
        }

        if (needsFallback) {
            // Fallback to Scrape.do proxy for any block or non-200 status
            if (process.env.SCRAPEDO_API_KEY) {
                console.info(`Falling back to Scrape.do for ${url}`);
                try {
                    const scrapeDoUrl = `http://api.scrape.do?token=${process.env.SCRAPEDO_API_KEY}&super=true&render=true&url=${encodeURIComponent(url)}`;
                    const sdRes = await gotScraping({
                        url: scrapeDoUrl,
                        timeout: { request: 12000 },
                        retry: { limit: 0 },
                        throwHttpErrors: false,
                    });
                    if (sdRes.statusCode >= 200 && sdRes.statusCode < 300) {
                        return { $: cheerio.load(sdRes.body), usedFirecrawl: true };
                    }
                    console.warn(`Scrape.do fallback failed for ${url} (Status: ${sdRes.statusCode})`);
                } catch (err: any) {
                    console.warn(`Scrape.do fallback error for ${url}: ${err.message}`);
                }
            }

            if (attempt === retries) return { $: null, usedFirecrawl: false };
            await new Promise(resolve => setTimeout(resolve, 1000 * attempt)); // simple backoff
        }
    }
    return { $: null, usedFirecrawl: false };
}

export async function scrapeCustomPages(urls: string[]) {
    if (!urls || urls.length === 0) return [];

    const jobs: any[] = [];
    const logsData: any[] = [];

    for (const url of urls.slice(0, 10)) {
        let errorMsg: string | null = null;
        let pageJobsCount = 0;
        let siteUsedFc = false;
        const initialJobsLength = jobs.length;

        const cacheKey = { source: `Custom: ${url}`, keyword: '', location: '' };
        try {
            const cached = await prisma.scrapeCache.findUnique({
                where: { source_keyword_location: cacheKey }
            });
            if (cached && cached.expiresAt > new Date()) {
                console.log(`Cache hit for ${url}`);
                const cachedJobs = cached.rawJobs as any[];
                jobs.push(...cachedJobs);
                
                let domain = url;
                try { domain = new URL(url).hostname.replace(/^www\./, ''); } catch(e) {}
                logsData.push({
                    scraperName: `Custom: ${domain} (Cached)`,
                    targetUrl: url,
                    status: cachedJobs.length > 0 ? 'SUCCESS' : 'FAILURE',
                    resultsCount: cachedJobs.length,
                    usedFirecrawl: false,
                    firecrawlSites: [],
                    errorDetails: null
                });
                continue;
            }
        } catch (e) {
            console.warn('Cache check failed:', e);
        }

        try {
            const { $: cheerio$, usedFirecrawl } = await fetchPage(url);
            if (usedFirecrawl) siteUsedFc = true;
            const $ = cheerio$;
            
            if (!$) {
                errorMsg = 'Failed to fetch page';
            } else {
                if (url.includes('boards.greenhouse.io')) {
                    const match = url.match(/boards\.greenhouse\.io\/(?:embed\/job_board\?for=)?([^/?#]+)/i);
                    const boardToken = match ? match[1] : null;
                    let apiSuccess = false;

                    if (boardToken) {
                        try {
                            const apiRes = await gotScraping({ url: `https://boards-api.greenhouse.io/v1/boards/${boardToken}/jobs?content=true`, responseType: 'json', throwHttpErrors: false });
                            if (apiRes.statusCode >= 200 && apiRes.statusCode < 300 && (apiRes.body as any)?.jobs) {
                                const rawJobs = (apiRes.body as any).jobs;
                                const companyName = boardToken.charAt(0).toUpperCase() + boardToken.slice(1);
                                for (const j of rawJobs) {
                                    jobs.push({
                                        title: j.title || 'Unknown Role',
                                        company: companyName,
                                        location: j.location?.name || 'Unknown Location',
                                        description: j.content ? (cheerio.load(j.content).text().replace(/\s+/g, ' ').trim() + `\n\nApply at: ${j.absolute_url}`) : `Apply at: ${j.absolute_url}`,
                                        url: j.absolute_url,
                                        source: 'Greenhouse'
                                    });
                                }
                                apiSuccess = jobs.length > 0;
                            }
                        } catch(e) {}
                    }

                    if (!apiSuccess) {
                        const companyName = $('title').text().replace('Job Board', '').trim() || 'Greenhouse Company';
                        $('.opening').each((_, el) => {
                            const titleEl = $(el).find('a');
                            const locationEl = $(el).find('.location');
                            const href = titleEl.attr('href') || '';
                            const fullUrl = href.startsWith('http') ? href : `https://boards.greenhouse.io${href}`;
                            jobs.push({
                                title: titleEl.text().trim() || 'Unknown Role',
                                company: companyName,
                                location: locationEl.text().trim() || 'Unknown Location',
                                description: `Apply at: ${fullUrl}`,
                                url: fullUrl,
                                source: 'Greenhouse'
                            });
                        });
                    }

                } else if (url.includes('jobs.lever.co')) {
                    const match = url.match(/jobs\.lever\.co\/([^/?#]+)/i);
                    const companyToken = match ? match[1] : null;
                    let apiSuccess = false;

                    if (companyToken) {
                        try {
                            const apiRes = await gotScraping({ url: `https://api.lever.co/v0/postings/${companyToken}?mode=json`, responseType: 'json', throwHttpErrors: false });
                            if (apiRes.statusCode >= 200 && apiRes.statusCode < 300 && Array.isArray(apiRes.body)) {
                                const rawJobs = apiRes.body as any[];
                                const companyName = companyToken.charAt(0).toUpperCase() + companyToken.slice(1);
                                for (const j of rawJobs) {
                                    jobs.push({
                                        title: j.text || 'Unknown Role',
                                        company: companyName,
                                        location: j.categories?.location || 'Unknown Location',
                                        description: j.descriptionPlain ? (j.descriptionPlain.replace(/\s+/g, ' ').trim() + `\n\nApply at: ${j.hostedUrl}`) : `Apply at: ${j.hostedUrl}`,
                                        url: j.hostedUrl || j.applyUrl,
                                        source: 'Lever'
                                    });
                                }
                                apiSuccess = jobs.length > 0;
                            }
                        } catch(e) {}
                    }

                    if (!apiSuccess) {
                        const companyName = $('title').text().split('–')[0]?.trim() || 
                                            $('.main-header-logo img').attr('alt') || 
                                            $('.main-header-text').text().trim() || 'Lever Company';
                        $('.posting').each((_, el) => {
                            const titleEl = $(el).find('h5');
                            const locationEl = $(el).find('.sort-by-location, .posting-categories .location');
                            const linkEl = $(el).find('a.posting-title');
                            const href = linkEl.attr('href') || '';
                            jobs.push({
                                title: titleEl.text().trim() || 'Unknown Role',
                                company: companyName,
                                location: locationEl.text().trim() || 'Unknown Location',
                                description: `Apply at: ${href}`,
                                url: href,
                                source: 'Lever'
                            });
                        });
                    }

                } else if (url.includes('jobs.ashbyhq.com')) {
                    const match = url.match(/jobs\.ashbyhq\.com\/([^/?#]+)/i);
                    const companyToken = match ? match[1] : null;
                    let apiSuccess = false;

                    if (companyToken) {
                        try {
                            const apiRes = await gotScraping({
                                url: `https://api.ashbyhq.com/posting-api/job-board/${companyToken}`,
                                method: 'POST',
                                json: {},
                                responseType: 'json',
                                throwHttpErrors: false
                            });
                            if (apiRes.statusCode >= 200 && apiRes.statusCode < 300 && (apiRes.body as any)?.jobs) {
                                const rawJobs = (apiRes.body as any).jobs;
                                const companyName = companyToken.charAt(0).toUpperCase() + companyToken.slice(1);
                                for (const j of rawJobs) {
                                    jobs.push({
                                        title: j.title || 'Unknown Role',
                                        company: companyName,
                                        location: j.location || 'Unknown Location',
                                        description: `Apply at: ${j.jobUrl}`,
                                        url: j.jobUrl,
                                        source: 'Ashby'
                                    });
                                }
                                apiSuccess = jobs.length > 0;
                            }
                        } catch(e) {}
                    }

                    if (!apiSuccess) {
                        const companyName = $('title').text().trim();
                        $('a[href*="/jobs/"]').each((_, el) => {
                            const titleEl = $(el).find('h3');
                            const locationEl = $(el).find('p');
                            const href = $(el).attr('href') || '';
                            const fullUrl = href.startsWith('http') ? href : `https://jobs.ashbyhq.com${href}`;
                            jobs.push({
                                title: titleEl.text().trim() || $(el).text().trim() || 'Unknown Role',
                                company: companyName,
                                location: locationEl.text().trim() || 'Unknown Location',
                                description: `Apply at: ${fullUrl}`,
                                url: fullUrl,
                                source: 'Ashby'
                            });
                        });
                    }

                } else if (url.includes('workable.com')) {
                    const companyName = $('title').text().trim();
                    $('[data-ui="job-posting"], li.job').each((_, el) => {
                        const titleEl = $(el).find('a, h2, h3').first();
                        const href = titleEl.attr('href') || $(el).find('a').first().attr('href') || '';
                        jobs.push({
                            title: titleEl.text().trim() || 'Unknown Role',
                            company: companyName,
                            location: $(el).text().includes('Remote') ? 'Remote' : 'Unknown Location',
                            description: `Apply at: ${href}`,
                            url: href,
                            source: 'Workable'
                        });
                    });

                } else if (url.includes('smartrecruiters.com')) {
                    const companyName = $('title').text().trim();
                    $('li.opening-job, a.link--block').each((_, el) => {
                        const titleEl = $(el).find('h4').length ? $(el).find('h4') : $(el);
                        const linkEl = el.tagName === 'a' ? $(el) : $(el).find('a');
                        const href = linkEl.attr('href') || '';
                        jobs.push({
                            title: titleEl.text().trim() || 'Unknown Role',
                            company: companyName,
                            location: 'Unknown Location',
                            description: `Apply at: ${href}`,
                            url: href,
                            source: 'SmartRecruiters'
                        });
                    });

                } else if (url.includes('breezy.hr')) {
                    const companyName = $('title').text().trim();
                    $('li.position').each((_, el) => {
                        const titleEl = $(el).find('h2');
                        const linkEl = $(el).find('a');
                        const href = linkEl.attr('href') || '';
                        const locationEl = $(el).find('.location');
                        jobs.push({
                            title: titleEl.text().trim() || 'Unknown Role',
                            company: companyName,
                            location: locationEl.text().trim() || 'Unknown Location',
                            description: `Apply at: ${href}`,
                            url: href,
                            source: 'Breezy'
                        });
                    });
                }
            }
        } catch (e: any) {
            console.warn(`Error parsing ${url}: ${e.message}`);
            errorMsg = e.message;
        }

        pageJobsCount = jobs.length - initialJobsLength;
        const newJobs = jobs.slice(initialJobsLength);

        try {
            if (newJobs.length > 0) {
                await prisma.scrapeCache.upsert({
                    where: { source_keyword_location: cacheKey },
                    update: { rawJobs: newJobs, expiresAt: new Date(Date.now() + 60 * 60 * 1000) },
                    create: { ...cacheKey, rawJobs: newJobs, expiresAt: new Date(Date.now() + 60 * 60 * 1000) }
                });
            }
        } catch(e) {
            console.warn('Failed to save custom page cache:', e);
        }

        try {
            let domain = url;
            try { domain = new URL(url).hostname.replace(/^www\./, ''); } catch(e) {}
            logsData.push({
                scraperName: `Custom: ${domain}`,
                targetUrl: url,
                status: errorMsg ? 'FAILURE' : 'SUCCESS',
                resultsCount: pageJobsCount,
                usedFirecrawl: siteUsedFc,
                firecrawlSites: siteUsedFc ? [url] : [],
                errorDetails: errorMsg || null
            });
        } catch (e) {}
    }

    try {
        for (const log of logsData) {
            await prisma.scraperLog.create({ data: log });
        }
    } catch (dbErr) {
        console.error('Error saving custom scraper logs:', dbErr);
    }

    return jobs;
}

export async function scrapeRemoteAggregators(keyword: string, sources: any) {
    const urls: { url: string; source: string }[] = [];

    if (sources.weworkremotely) urls.push({ url: `https://weworkremotely.com/remote-jobs/search?term=${encodeURIComponent(keyword)}`, source: 'weworkremotely' });
    if (sources.remoteok) urls.push({ url: `https://remoteok.com/api?tag=${encodeURIComponent(keyword.replace(/\s+/g, '-'))}`, source: 'remoteok' });
    if (sources.workingnomads) urls.push({ url: `https://www.workingnomads.com/api/exposed_jobs/`, source: 'workingnomads' });
    if (sources.remotive) urls.push({ url: `https://remotive.com/api/remote-jobs?search=${encodeURIComponent(keyword)}`, source: 'remotive' });
    if (sources.arbeitnow) urls.push({ url: `https://www.arbeitnow.com/api/job-board-api?search=${encodeURIComponent(keyword)}`, source: 'arbeitnow' });
    if (sources.nodesk) urls.push({ url: `https://nodesk.co/remote-jobs/`, source: 'nodesk' });
    if (sources.ycombinator) urls.push({ url: `https://www.workatastartup.com/companies?query=${encodeURIComponent(keyword)}`, source: 'ycombinator' });
    // Note: Otta omitted from this batch due to requiring GraphQL reverse-engineering.

    if (urls.length === 0) return [];

    const jobs: any[] = [];

    // Fetch all pages in parallel
    const results = await Promise.allSettled(
        urls.map(async ({ url, source }) => {
            const pageJobs: any[] = [];
            let sourceFcSites: string[] = [];
            let errorMsg: string | null = null;

            const cacheKey = { source, keyword, location: '' };
            try {
                const cached = await prisma.scrapeCache.findUnique({
                    where: { source_keyword_location: cacheKey }
                });
                if (cached && cached.expiresAt > new Date()) {
                    console.log(`Cache hit for ${source}: ${keyword}`);
                    return { source, jobs: cached.rawJobs as any[], usedFirecrawl: false, firecrawlSites: [], error: null, url, isCached: true };
                }
            } catch (e) {
                console.warn('Cache check failed:', e);
            }

            if (source === 'remoteok') {
                try {
                    let res = await gotScraping({ 
                        url, 
                        responseType: 'json', 
                        throwHttpErrors: false,
                        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' }
                    });
                    if ((res.statusCode < 200 || res.statusCode >= 300) && process.env.SCRAPEDO_API_KEY) {
                        const scrapeDoUrl = `http://api.scrape.do?token=${process.env.SCRAPEDO_API_KEY}&super=true&url=${encodeURIComponent(url)}`;
                        res = await gotScraping({ url: scrapeDoUrl, responseType: 'json', throwHttpErrors: false });
                    }
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        const data = res.body as any;
                        for (let i = 1; i < data.length; i++) {
                            const job = data[i];
                            if (job.position && job.company) {
                                pageJobs.push({
                                    title: job.position,
                                    company: job.company,
                                    location: job.location || 'Remote',
                                    description: `Apply at: ${job.url}`,
                                    url: job.url,
                                    source: 'RemoteOK'
                                });
                            }
                        }
                    } else {
                        errorMsg = `HTTP Error: ${res.statusCode}`;
                    }
                } catch (e: any) {
                    console.warn(`Error parsing remoteok API: ${e.message}`);
                    errorMsg = e.message;
                }
                return { source, jobs: pageJobs, usedFirecrawl: false, firecrawlSites: [], error: errorMsg, url, isCached: false };
            }

            if (source === 'remotive') {
                try {
                    let res = await gotScraping({ url, responseType: 'json', throwHttpErrors: false });
                    if ((res.statusCode < 200 || res.statusCode >= 300) && process.env.SCRAPEDO_API_KEY) {
                        const scrapeDoUrl = `http://api.scrape.do?token=${process.env.SCRAPEDO_API_KEY}&super=true&url=${encodeURIComponent(url)}`;
                        res = await gotScraping({ url: scrapeDoUrl, responseType: 'json', throwHttpErrors: false });
                    }
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        const data = res.body as any;
                        if (data && Array.isArray(data.jobs)) {
                            for (const job of data.jobs) {
                                if (job.title && job.company_name) {
                                    pageJobs.push({
                                        title: job.title,
                                        company: job.company_name,
                                        location: job.candidate_required_location || 'Remote',
                                        description: job.description ? (cheerio.load(job.description).text().replace(/\s+/g, ' ').trim() + `\n\nApply at: ${job.url}`) : `Apply at: ${job.url}`,
                                        url: job.url,
                                        source: 'Remotive'
                                    });
                                }
                            }
                        }
                    } else {
                        errorMsg = `HTTP Error: ${res.statusCode}`;
                    }
                } catch (e: any) {
                    console.warn(`Error parsing remotive API: ${e.message}`);
                    errorMsg = e.message;
                }
                return { source, jobs: pageJobs, usedFirecrawl: false, firecrawlSites: [], error: errorMsg, url, isCached: false };
            }

            if (source === 'workingnomads') {
                try {
                    let data: any = null;
                    let res = await gotScraping({ url, responseType: 'json', throwHttpErrors: false });
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        data = res.body;
                    } else if (process.env.SCRAPEDO_API_KEY) {
                        console.info(`WorkingNomads returned ${res.statusCode}, falling back to Scrape.do`);
                        const scrapeDoUrl = `http://api.scrape.do?token=${process.env.SCRAPEDO_API_KEY}&super=true&url=${encodeURIComponent(url)}`;
                        const sdRes = await gotScraping({ url: scrapeDoUrl, throwHttpErrors: false });
                        if (sdRes.statusCode >= 200 && sdRes.statusCode < 300) {
                            let raw = sdRes.body ? sdRes.body.toString() : '';
                            const jsonMatch = raw.match(/\[[\s\S]*\]|\{[\s\S]*\}/);
                            if (jsonMatch) {
                                try { data = JSON.parse(jsonMatch[0]); } catch (e) {}
                            }
                        }
                    }

                    if (data) {
                        const jobList = Array.isArray(data) ? data : (data.jobs || data.results || []);
                        for (const job of jobList) {
                            const kwLower = keyword.toLowerCase();
                            const titleMatches = job.title?.toLowerCase().includes(kwLower);
                            const companyMatches = job.company_name?.toLowerCase().includes(kwLower);
                            const categoryMatches = job.category_name?.toLowerCase().includes(kwLower);
                            const descMatches = typeof job.description === 'string' && job.description.toLowerCase().includes(kwLower);

                            if (keyword && !titleMatches && !companyMatches && !categoryMatches && !descMatches) continue;

                            const jobUrl = job.url || (job.slug ? `https://www.workingnomads.com/jobs/${job.slug}` : '');
                            if (!jobUrl) continue;
                            const fullUrl = jobUrl.startsWith('http') ? jobUrl : `https://www.workingnomads.com${jobUrl}`;

                            pageJobs.push({
                                title: job.title || 'Unknown Role',
                                company: job.company_name || 'WorkingNomads',
                                location: job.location || 'Remote',
                                description: job.description ? (cheerio.load(job.description).text().replace(/\s+/g, ' ').trim() + `\n\nApply at: ${fullUrl}`) : `Apply at: ${fullUrl}`,
                                url: fullUrl,
                                source: 'WorkingNomads'
                            });
                        }
                    } else {
                        errorMsg = `Failed to retrieve WorkingNomads data (Status: ${res.statusCode})`;
                    }
                } catch (e: any) {
                    console.warn(`Error parsing workingnomads API: ${e.message}`);
                    errorMsg = e.message;
                }
                return { source, jobs: pageJobs, usedFirecrawl: false, firecrawlSites: [], error: errorMsg, url, isCached: false };
            }

            if (source === 'arbeitnow') {
                try {
                    let res = await gotScraping({ url, responseType: 'json', throwHttpErrors: false });
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        const data = (res.body as any).data;
                        if (Array.isArray(data)) {
                            for (const job of data) {
                                pageJobs.push({
                                    title: job.title,
                                    company: job.company_name,
                                    location: job.location || 'Remote',
                                    description: job.description ? (cheerio.load(job.description).text().replace(/\s+/g, ' ').trim() + `\n\nApply at: ${job.url}`) : `Apply at: ${job.url}`,
                                    url: job.url,
                                    source: 'Arbeitnow (DE)'
                                });
                            }
                        }
                    } else {
                        errorMsg = `HTTP Error: ${res.statusCode}`;
                    }
                } catch (e: any) {
                    console.warn(`Error parsing arbeitnow API: ${e.message}`);
                    errorMsg = e.message;
                }
                return { source, jobs: pageJobs, usedFirecrawl: false, firecrawlSites: [], error: errorMsg, url, isCached: false };
            }

            if (source === 'himalayas') {
                try {
                    let res = await gotScraping({ url, responseType: 'json', throwHttpErrors: false });
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        const data = (res.body as any).jobs;
                        if (Array.isArray(data)) {
                            for (const job of data) {
                                if (keyword && !job.title?.toLowerCase().includes(keyword.toLowerCase()) && !job.companyName?.toLowerCase().includes(keyword.toLowerCase())) continue;
                                pageJobs.push({
                                    title: job.title,
                                    company: job.companyName,
                                    location: 'Remote', // Himalayas is primarily remote
                                    description: job.description ? (cheerio.load(job.description).text().replace(/\s+/g, ' ').trim() + `\n\nApply at: ${job.applicationLink || job.guid}`) : `Apply at: ${job.applicationLink || job.guid}`,
                                    url: job.applicationLink || job.guid,
                                    source: 'Himalayas'
                                });
                            }
                        }
                    } else {
                        errorMsg = `HTTP Error: ${res.statusCode}`;
                    }
                } catch (e: any) {
                    console.warn(`Error parsing himalayas API: ${e.message}`);
                    errorMsg = e.message;
                }
                return { source, jobs: pageJobs, usedFirecrawl: false, firecrawlSites: [], error: errorMsg, url, isCached: false };
            }

            if (source === 'ycombinator') {
                try {
                    let res = await gotScraping({ url, throwHttpErrors: false });
                    if ((res.statusCode < 200 || res.statusCode >= 300) && process.env.SCRAPEDO_API_KEY) {
                        const scrapeDoUrl = `http://api.scrape.do?token=${process.env.SCRAPEDO_API_KEY}&super=true&url=${encodeURIComponent(url)}`;
                        res = await gotScraping({ url: scrapeDoUrl, throwHttpErrors: false });
                    }
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        const html = res.body as string;
                        const $ = cheerio.load(html);
                        const dataPage = $('div[data-page]').attr('data-page');
                        if (dataPage) {
                            const data = JSON.parse(dataPage);
                            const ycJobs = data.props.jobs || [];
                            for (const job of ycJobs) {
                                pageJobs.push({
                                    title: job.title,
                                    company: job.companyName,
                                    location: job.location || 'Remote',
                                    description: `Role Type: ${job.roleType || 'N/A'}\nSalary: ${job.salary || 'N/A'}\n\nApply at: ${job.applyUrl}`,
                                    salary_range: job.salary || null,
                                    url: job.applyUrl,
                                    source: 'YCombinator'
                                });
                            }
                        } else {
                            errorMsg = "Could not find YC data prop.";
                        }
                    } else {
                        errorMsg = `HTTP Error: ${res.statusCode}`;
                    }
                } catch (e: any) {
                    console.warn(`Error parsing YC: ${e.message}`);
                    errorMsg = e.message;
                }
                return { source, jobs: pageJobs, usedFirecrawl: false, firecrawlSites: [], error: errorMsg, url, isCached: false };
            }

            try {
                const { $: cheerio$, usedFirecrawl } = await fetchPage(url);
                if (usedFirecrawl) sourceFcSites.push(url);
                const $ = cheerio$;
                
                if (!$) {
                    return { source, jobs: [], usedFirecrawl, firecrawlSites: sourceFcSites, error: 'Failed to fetch page', url };
                }

                if (source === 'weworkremotely') {
                    $('li:not(.view-all) > a[href*="/remote-jobs/"]').each((_, el) => {
                        const href = $(el).attr('href') || '';
                        const text = $(el).text().toLowerCase();
                        // Paywall filter: skip subscriber-only / locked listings
                        const isLocked = href.includes('/pro/') || href.includes('/subscribe') || text.includes('unlock') || $(el).find('.pro-tag, .paid-only, .subscriber-only').length > 0;
                        if (isLocked) return;

                        const titleEl = $(el).find('.new-listing__header__title__text').length > 0 
                            ? $(el).find('.new-listing__header__title__text') 
                            : $(el).find('.title');
                        const companyEl = $(el).find('.new-listing__company-name').length > 0 
                            ? $(el).find('.new-listing__company-name') 
                            : $(el).find('.company');
                        
                        if (!href.includes('/remote-jobs/')) return;
                        const fullUrl = href.startsWith('http') ? href : `https://weworkremotely.com${href}`;

                        let salaryText = '';
                        let locationText = 'Remote';
                        $(el).find('.new-listing__categories__category, .region').each((_, cat) => {
                            const t = $(cat).text().trim();
                            if (t.includes('$') || t.includes('€') || t.includes('£')) {
                                salaryText = t;
                            } else if (!t.toLowerCase().includes('time') && !t.toLowerCase().includes('contract') && !t.toLowerCase().includes('boosted') && !t.toLowerCase().includes('top 100')) {
                                locationText = t;
                            }
                        });

                        const title = titleEl.text().trim();
                        if (!title) return;

                        pageJobs.push({
                            title: title,
                            company: companyEl.text().trim() || 'We Work Remotely',
                            location: locationText || 'Remote',
                            description: `Apply at: ${fullUrl}${salaryText ? '\nSalary: ' + salaryText : ''}`,
                            salary_range: salaryText || null,
                            url: fullUrl,
                            source: 'WWR'
                        });
                    });
                } else if (source === 'remoteco') {
                    $('a[href*="/job/"]').each((_, el) => {
                        const titleEl = $(el).find('p.font-weight-bold').length ? $(el).find('p.font-weight-bold') : $(el);
                        const companyEl = $(el).find('p.m-0').length ? $(el).find('p.m-0') : $(el);
                        const href = $(el).attr('href') || '';
                        const fullUrl = href.startsWith('http') ? href : `https://remote.co${href}`;
                        pageJobs.push({
                            title: titleEl.text().trim() || 'Unknown Role',
                            company: companyEl.text().split('|')[0]?.trim() || 'Remote.co',
                            location: 'Remote',
                            description: `Apply at: ${fullUrl}`,
                            url: fullUrl,
                            source: 'Remote.co'
                        });
                    });

                    const batchSize = 3;
                    for (let i = 0; i < pageJobs.length; i += batchSize) {
                        const batch = pageJobs.slice(i, i + batchSize);
                        await Promise.all(batch.map(async (job) => {
                            try {
                                const { $ } = await fetchPage(job.url, 1);
                                if ($) {
                                    const desc = $('.job_description, .job-description, main').text().trim();
                                    
                                    // Extract outbound apply link
                                    let applyLink = $('.apply_btn').attr('href') || $('.job_description a.btn, .job-description a.btn').first().attr('href');
                                    if (!applyLink) {
                                        applyLink = $('a').filter((_, el) => {
                                            const txt = $(el).text().trim().toLowerCase();
                                            return txt.includes('apply for this position') || txt.includes('apply now') || txt === 'apply';
                                        }).first().attr('href');
                                    }
                                    if (applyLink && (applyLink.startsWith('http') || applyLink.startsWith('mailto:'))) {
                                        job.url = applyLink;
                                    }

                                    if (desc) {
                                        const cleanDesc = desc.replace(/\n{3,}/g, '\n\n').trim();
                                        job.description = cleanDesc + `\n\nApply at: ${job.url}`;
                                    }
                                }
                            } catch(e) {}
                        }));
                        if (i + batchSize < pageJobs.length) {
                            await new Promise(r => setTimeout(r, 500));
                        }
                    }
                } else if (source === 'jobspresso') {
                    $('li.job_listing').each((_, el) => {
                        const href = $(el).find('a').attr('href');
                        if (!href) return;
                        pageJobs.push({
                            title: $(el).find('.position h3').text().trim() || 'Unknown Role',
                            company: $(el).find('.company strong').text().trim() || 'Jobspresso',
                            location: $(el).find('.location').text().trim() || 'Remote',
                            description: `Apply at: ${href}`,
                            url: href,
                            source: 'Jobspresso'
                        });
                    });
                } else if (source === 'justremote') {
                    $('a[href*="/remote-jobs/"]').each((_, el) => {
                        const href = $(el).attr('href') || '';
                        const text = $(el).text().toLowerCase();
                        // Paywall filter: skip subscriber-only Power Search listings
                        const isLocked = href.includes('/power-search/') || href.includes('/subscribe') || text.includes('unlock') || $(el).hasClass('power-search') || $(el).find('.power-search-tag, [class*="locked"], [class*="pro"]').length > 0;
                        if (isLocked) return;

                        const title = $(el).find('h3').text().trim();
                        if (!title) return;
                        const fullUrl = href.startsWith('http') ? href : `https://justremote.co${href}`;
                        pageJobs.push({
                            title: title,
                            company: 'JustRemote',
                            location: 'Remote',
                            description: `Apply at: ${fullUrl}`,
                            url: fullUrl,
                            source: 'JustRemote'
                        });
                    });
                } else if (source === 'nodesk') {
                    $('a[href*="/remote-jobs/"]').each((_, el) => {
                        const href = $(el).attr('href') || '';
                        if (!href || href.endsWith('/remote-jobs/') || href.match(/\/remote-jobs\/(engineering|design|marketing|sales|finance|customer-support|devops|management|operations|writing)\/?$/)) return;
                        
                        const titleText = $(el).find('h2, h3, .title, strong').text().trim() || $(el).text().trim();
                        const title = titleText.split('\n')[0].trim();
                        if (!title || title.length < 3 || title.toLowerCase().includes('view all') || title.toLowerCase() === 'engineering' || title.toLowerCase() === 'engineering jobs') return;
                        
                        const kwLower = keyword.toLowerCase();
                        if (keyword && !title.toLowerCase().includes(kwLower)) return;

                        const fullUrl = href.startsWith('http') ? href : `https://nodesk.co${href}`;
                        if (pageJobs.some(j => j.url === fullUrl)) return;

                        pageJobs.push({
                            title,
                            company: 'Nodesk',
                            location: 'Remote',
                            description: `Apply at: ${fullUrl}`,
                            url: fullUrl,
                            source: 'Nodesk'
                        });
                    });
                } else if (source === 'wellfound') {
                    $('[class*="styles_jobListing"], [data-test="JobListing"], div[class*="jobListing"], div[class*="JobCard"]').each((_, el) => {
                        const titleEl = $(el).find('a[class*="title"], h2, h3, a[href*="/jobs/"]').first();
                        const title = titleEl.text().trim();
                        const href = titleEl.attr('href') || $(el).find('a[href*="/jobs/"]').attr('href') || '';
                        const company = $(el).find('[class*="company"], [class*="startup"], [class*="header"]').first().text().trim() || 'Wellfound Company';
                        const loc = $(el).find('[class*="location"]').text().trim() || 'Remote';
                        if (!title || !href) return;
                        const fullUrl = href.startsWith('http') ? href : `https://wellfound.com${href}`;
                        if (pageJobs.some(j => j.url === fullUrl)) return;
                        pageJobs.push({
                            title,
                            company,
                            location: loc,
                            description: `Apply at: ${fullUrl}`,
                            url: fullUrl,
                            source: 'Wellfound'
                        });
                    });

                    if (pageJobs.length === 0) {
                        $('script[type="application/ld+json"]').each((_, scriptEl) => {
                            try {
                                const content = $(scriptEl).html() || '';
                                const json = JSON.parse(content);
                                const items = Array.isArray(json) ? json : (json['@graph'] || [json]);
                                for (const item of items) {
                                    if (item['@type'] === 'JobPosting') {
                                        const kwLower = keyword.toLowerCase();
                                        if (keyword && !item.title?.toLowerCase().includes(kwLower)) continue;
                                        pageJobs.push({
                                            title: item.title,
                                            company: item.hiringOrganization?.name || 'Wellfound',
                                            location: item.jobLocation?.address?.addressLocality || 'Remote',
                                            description: item.description ? cheerio.load(item.description).text().trim() : `Apply at: ${item.url}`,
                                            url: item.url || url,
                                            source: 'Wellfound'
                                        });
                                    }
                                }
                            } catch(e) {}
                        });
                    }
                }
            } catch (e: any) {
                console.warn(`Error parsing remote aggregator ${source}: ${e.message}`);
                errorMsg = e.message;
            }

            try {
                if (!errorMsg && pageJobs.length > 0) {
                    await prisma.scrapeCache.upsert({
                        where: { source_keyword_location: cacheKey },
                        update: { rawJobs: pageJobs, expiresAt: new Date(Date.now() + 60 * 60 * 1000) },
                        create: { ...cacheKey, rawJobs: pageJobs, expiresAt: new Date(Date.now() + 60 * 60 * 1000) }
                    });
                }
            } catch(e) {
                console.warn('Failed to save aggregator cache:', e);
            }

            return { source, jobs: pageJobs, usedFirecrawl: sourceFcSites.length > 0, firecrawlSites: sourceFcSites, error: errorMsg, url, isCached: false };
        })
    );

    const sourceDisplayNames: Record<string, string> = {
        weworkremotely: 'WeWorkRemotely',
        remoteco: 'Remote.co',
        remoteok: 'RemoteOK',
        workingnomads: 'WorkingNomads',
        remotive: 'Remotive',
        arbeitnow: 'Arbeitnow (DE)',
        himalayas: 'Himalayas',
        jobspresso: 'Jobspresso',
        justremote: 'JustRemote',
        nodesk: 'Nodesk',
        wellfound: 'Wellfound',
        ycombinator: 'YCombinator'
    };

    for (const result of results) {
        if (result.status === 'fulfilled') {
            const data = result.value;
            jobs.push(...data.jobs);

            try {
                await prisma.scraperLog.create({
                    data: {
                        scraperName: `${sourceDisplayNames[data.source] || data.source}${(data as any).isCached ? ' (Cached)' : ''}`,
                        targetUrl: data.url,
                        status: data.error ? 'FAILURE' : 'SUCCESS',
                        resultsCount: data.jobs.length,
                        usedFirecrawl: data.usedFirecrawl,
                        firecrawlSites: data.firecrawlSites,
                        errorDetails: data.error || null
                    }
                });
            } catch (dbErr) {
                console.error('Error saving scraper log:', dbErr);
            }
        }
    }

    return jobs;
}

export async function scrapeRemotePOC(keyword: string) {
    const jobs: any[] = [];
    let errorMsg: string | null = null;
    const targetUrl = 'https://remotepoc.com/jm-ajax/get_listings/';

    try {
        const formData = new URLSearchParams();
        if (keyword) formData.append('search_keywords', keyword);

        const res = await fetch(targetUrl, {
            method: 'POST',
            body: formData,
            headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
            signal: AbortSignal.timeout(12000)
        });

        if (!res.ok) {
            errorMsg = `HTTP Error: ${res.status}`;
        } else {
            const data = await res.json();
            if (data && data.html) {
                const $ = cheerio.load(data.html);
                $('.job_listing').each((_, el) => {
                    const title = $(el).find('.job_listing-title, h3').text().trim();
                    const company = $(el).find('.job_listing-company, .company').text().trim();
                    const location = $(el).find('.job_listing-location').text().trim();
                    const url = $(el).find('a').attr('href');
                    if (title && url && title !== 'Unknown Role') {
                        jobs.push({
                            title,
                            company: company || 'RemotePOC Company',
                            location: location || 'Remote',
                            url,
                            source: 'remotepoc'
                        });
                    }
                });
            }
        }
    } catch (e: any) {
        console.error("RemotePOC Scrape Error:", e);
        errorMsg = e.message;
    }
    
    try {
        await prisma.scraperLog.create({
            data: {
                scraperName: 'RemotePOC',
                targetUrl,
                status: errorMsg ? 'FAILURE' : 'SUCCESS',
                resultsCount: jobs.length,
                usedFirecrawl: false,
                errorDetails: errorMsg
            }
        });
    } catch (logErr) {
        console.error('Failed to log RemotePOC scraper', logErr);
    }
    
    return jobs;
}


export async function scrapeHimalayas(keyword: string) {
    const jobs: any[] = [];
    let errorMsg: string | null = null;
    const targetUrl = keyword 
        ? `https://himalayas.app/jobs/api?q=${encodeURIComponent(keyword)}`
        : `https://himalayas.app/jobs/api?limit=50`;

    try {
        const res = await fetch(targetUrl);
        if (!res.ok) {
            errorMsg = `HTTP Error: ${res.status}`;
        } else {
            const data = await res.json();
            if (data && Array.isArray(data.jobs)) {
                for (const job of data.jobs) {
                    if (keyword && !job.title?.toLowerCase().includes(keyword.toLowerCase()) && !job.companyName?.toLowerCase().includes(keyword.toLowerCase())) {
                        continue;
                    }
                    jobs.push({
                        title: job.title,
                        company: job.companyName,
                        location: job.location || 'Remote',
                        url: job.applicationLink || job.jobUrl || job.himalayasUrl,
                        salary: (job.minSalary && job.maxSalary) ? `$${job.minSalary} - $${job.maxSalary}` : null,
                        source: 'himalayas'
                    });
                }
            }
        }
    } catch (e: any) {
        console.error("Himalayas Scrape Error:", e);
        errorMsg = e.message;
    }

    try {
        await prisma.scraperLog.create({
            data: {
                scraperName: 'Himalayas',
                targetUrl,
                status: errorMsg ? 'FAILURE' : 'SUCCESS',
                resultsCount: jobs.length,
                usedFirecrawl: false,
                errorDetails: errorMsg
            }
        });
    } catch (logErr) {}

    return jobs;
}

export async function scrapeJobicy(keyword: string) {
    const jobs: any[] = [];
    let errorMsg: string | null = null;
    const targetUrl = `https://jobicy.com/api/v2/remote-jobs?count=50&industry=engineering`;

    try {
        const res = await fetch(targetUrl, { signal: AbortSignal.timeout(10000) });
        if (!res.ok) {
            errorMsg = `HTTP Error: ${res.status}`;
        } else {
            const data = await res.json();
            if (data && Array.isArray(data.jobs)) {
                for (const j of data.jobs) {
                    if (keyword && !j.jobTitle?.toLowerCase().includes(keyword.toLowerCase()) && !j.companyName?.toLowerCase().includes(keyword.toLowerCase())) {
                        continue;
                    }
                    jobs.push({
                        title: j.jobTitle || j.title || 'Untitled Role',
                        company: j.companyName || 'Unknown Company',
                        location: j.jobGeo || 'Remote',
                        url: j.url,
                        salary: (j.annualSalaryMin && j.annualSalaryMax) ? `$${j.annualSalaryMin} - $${j.annualSalaryMax}` : null,
                        description: j.jobDescription ? cheerio.load(j.jobDescription).text().trim() : `Apply at: ${j.url}`,
                        source: 'jobicy'
                    });
                }
            }
        }
    } catch (e: any) {
        console.error("Jobicy Scrape Error:", e);
        errorMsg = e.message;
    }

    try {
        await prisma.scraperLog.create({
            data: {
                scraperName: 'Jobicy',
                targetUrl,
                status: errorMsg ? 'FAILURE' : 'SUCCESS',
                resultsCount: jobs.length,
                usedFirecrawl: false,
                errorDetails: errorMsg
            }
        });
    } catch (logErr) {}

    return jobs;
}

export async function scrapeJobspresso(keyword: string) {
    const jobs: any[] = [];
    let errorMsg: string | null = null;
    const targetUrl = `https://jobspresso.co/feed/`;

    try {
        const res = await fetch(targetUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' },
            signal: AbortSignal.timeout(10000)
        });
        if (!res.ok) {
            errorMsg = `HTTP Error: ${res.status}`;
        } else {
            const xml = await res.text();
            const $ = cheerio.load(xml, { xmlMode: true });
            $('item').each((_, el) => {
                const rawTitle = $(el).find('title').text().trim();
                const link = $(el).find('link').text().trim() || $(el).find('guid').text().trim();
                const descHtml = $(el).find('content\\:encoded, description').text();
                const company = rawTitle.includes(' at ') ? rawTitle.split(' at ')[1]?.trim() : 'Jobspresso Listing';
                const title = rawTitle.includes(' at ') ? rawTitle.split(' at ')[0]?.trim() : rawTitle;

                if (keyword && !title.toLowerCase().includes(keyword.toLowerCase()) && !company.toLowerCase().includes(keyword.toLowerCase())) {
                    return;
                }

                jobs.push({
                    title,
                    company,
                    location: 'Remote',
                    url: link,
                    description: descHtml ? cheerio.load(descHtml).text().trim() : `Apply at: ${link}`,
                    source: 'jobspresso'
                });
            });
        }
    } catch (e: any) {
        console.error("Jobspresso Scrape Error:", e);
        errorMsg = e.message;
    }

    try {
        await prisma.scraperLog.create({
            data: {
                scraperName: 'Jobspresso',
                targetUrl,
                status: errorMsg ? 'FAILURE' : 'SUCCESS',
                resultsCount: jobs.length,
                usedFirecrawl: false,
                errorDetails: errorMsg
            }
        });
    } catch (logErr) {}

    return jobs;
}

export async function scrapeLeverApi(companySlug: string) {
    const jobs: any[] = [];
    let errorMsg: string | null = null;
    const targetUrl = `https://api.lever.co/v0/postings/${companySlug}`;

    try {
        const res = await gotScraping({
            url: targetUrl,
            responseType: 'json',
            throwHttpErrors: false
        });
        if (res.statusCode >= 200 && res.statusCode < 300 && Array.isArray(res.body)) {
            const rawJobs = res.body as any[];
            const companyName = companySlug.charAt(0).toUpperCase() + companySlug.slice(1);
            for (const j of rawJobs) {
                jobs.push({
                    title: j.text || 'Unknown Role',
                    company: companyName,
                    location: j.categories?.location || 'Unknown Location',
                    description: j.descriptionPlain ? (j.descriptionPlain.replace(/\s+/g, ' ').trim() + `\n\nApply at: ${j.hostedUrl}`) : `Apply at: ${j.hostedUrl}`,
                    url: j.hostedUrl || j.applyUrl,
                    source: 'Lever'
                });
            }
        } else {
            errorMsg = `HTTP Error: ${res.statusCode}`;
        }
    } catch (e: any) {
        console.error(`Lever API Scrape Error for ${companySlug}:`, e);
        errorMsg = e.message;
    }

    try {
        await prisma.scraperLog.create({
            data: {
                scraperName: `Lever: ${companySlug}`,
                targetUrl,
                status: errorMsg ? 'FAILURE' : 'SUCCESS',
                resultsCount: jobs.length,
                usedFirecrawl: false,
                errorDetails: errorMsg
            }
        });
    } catch (logErr) {}

    return jobs;
}

export async function scrapeIndeed(keyword: string, location: string) {
    const jobs: any[] = [];
    const targetUrl = `https://www.indeed.com/jobs?q=${encodeURIComponent(keyword)}&l=${encodeURIComponent(location)}`;

    try {
        const proxyUrl = `http://api.scrape.do?token=${process.env.SCRAPEDO_API_KEY}&super=true&url=${encodeURIComponent(targetUrl)}`;
        const res = await fetch(proxyUrl);
        const html = await res.text();
        const $ = cheerio.load(html);
        
        if ($) {
            const mosaicData = $('script#mosaic-data').html();
            if (mosaicData && mosaicData.includes('window.mosaic.providerData["mosaic-provider-jobcards"]')) {
                const match = mosaicData.match(/window\.mosaic\.providerData\["mosaic-provider-jobcards"\]\s*=\s*(\{.*?\});/);
                if (match && match[1]) {
                    const parsed = JSON.parse(match[1]);
                    const results = parsed?.metaData?.mosaicProviderJobCardsModel?.results || [];
                    
                    for (const job of results) {
                        jobs.push({
                            title: job.title,
                            company: job.company,
                            location: job.formattedLocation || location,
                            url: `https://www.indeed.com${job.viewJobLink}`,
                            salary: job.salarySnippet?.text || null,
                            source: 'indeed'
                        });
                    }
                }
            }
        }
        
        await prisma.scraperLog.create({
            data: {
                scraperName: 'Indeed (Native)',
                targetUrl,
                status: 'SUCCESS',
                resultsCount: jobs.length,
                usedFirecrawl: false
            }
        });
    } catch (e: any) {
        console.error("Indeed Scrape Error:", e);
        try {
            await prisma.scraperLog.create({
                data: {
                    scraperName: 'Indeed (Native)',
                    targetUrl,
                    status: 'FAILURE',
                    resultsCount: 0,
                    usedFirecrawl: false,
                    errorDetails: e.message
                }
            });
        } catch {}
    }
    
    return jobs;
}

/**
 * Resolve Apollo GraphQL __ref references recursively.
 * Glassdoor embeds all job data as a flattened Apollo cache with cross-references.
 */
function resolveApolloRefs(data: any, root: Record<string, any>): any {
    if (data === null || data === undefined) return data;
    if (typeof data !== 'object') return data;
    if (Array.isArray(data)) return data.map(item => resolveApolloRefs(item, root));
    if ('__ref' in data) {
        const ref = data.__ref;
        return ref in root ? resolveApolloRefs(root[ref], root) : data;
    }
    const resolved: Record<string, any> = {};
    for (const [k, v] of Object.entries(data)) {
        resolved[k] = resolveApolloRefs(v, root);
    }
    return resolved;
}

/**
 * Extract Glassdoor Apollo cache from HTML.
 * Returns the resolved ROOT_QUERY or raw cache object.
 */
function extractGlassdoorApolloCache(html: string, $: cheerio.CheerioAPI): Record<string, any> | null {
    // Path 1: __NEXT_DATA__ → props.pageProps.apolloCache
    const nextDataRaw = $('script#__NEXT_DATA__').html();
    if (nextDataRaw) {
        try {
            const nextData = JSON.parse(nextDataRaw);
            const cache: Record<string, any> = nextData?.props?.pageProps?.apolloCache;
            if (cache && typeof cache === 'object') {
                const root = cache;
                const query = root['ROOT_QUERY'];
                return query ? resolveApolloRefs(query, root) : resolveApolloRefs(root, root);
            }
        } catch { /* continue */ }
    }

    // Path 2: apolloState variable embedded in JS (older Glassdoor pages)
    // Use indexOf + brace-counting instead of dotAll regex for ES2017 compat
    const stateIdx = html.indexOf('"apolloState":{');
    const match = stateIdx !== -1 ? (() => {
        let depth = 0, i = stateIdx + '"apolloState":'.length;
        if (html[i] !== '{') return null;
        const start = i;
        for (; i < html.length; i++) {
            if (html[i] === '{') depth++;
            else if (html[i] === '}') { depth--; if (depth === 0) return [null, html.slice(start, i + 1)]; }
        }
        return null;
    })() : null;
    if (match) {
        try {
            const raw = match[1];
            if (!raw) return null;
            const cache = JSON.parse(raw);
            if (cache && typeof cache === 'object') {
                const root = cache;
                const query = root['ROOT_QUERY'];
                return query ? resolveApolloRefs(query, root) : resolveApolloRefs(root, root);
            }
        } catch { /* continue */ }
    }

    return null;
}

export async function scrapeGlassdoor(keyword: string, location: string = 'Remote') {
    const jobs: any[] = [];
    const searchSlug = encodeURIComponent(keyword.replace(/\s+/g, '-'));
    const targetUrl = `https://www.glassdoor.com/Job/${searchSlug}-jobs-SRCH_KO0,${keyword.length}.htm`;
    const fallbackUrl = `https://www.glassdoor.com/Job/jobs.htm?sc.keyword=${encodeURIComponent(keyword)}&locT=&locId=&locKeyword=${encodeURIComponent(location)}`;

    try {
        let html = '';
        let usedUrl = targetUrl;

        // Use Scrape.do with render=true for JS-rendered Apollo data
        if (process.env.SCRAPEDO_API_KEY) {
            const urls = [targetUrl, fallbackUrl];
            for (const tryUrl of urls) {
                const proxyUrl = `http://api.scrape.do?token=${process.env.SCRAPEDO_API_KEY}&super=true&render=true&url=${encodeURIComponent(tryUrl)}`;
                try {
                    const res = await fetch(proxyUrl, { signal: AbortSignal.timeout(25000) });
                    if (res.ok) {
                        const text = await res.text();
                        if (text && !text.includes('403 Forbidden') && !text.includes('Access Denied')) {
                            html = text;
                            usedUrl = tryUrl;
                            break;
                        }
                    }
                } catch { /* try fallback */ }
            }
        }

        if (html) {
            const $ = cheerio.load(html);

            // === PRIMARY: Apollo GraphQL cache extraction ===
            // Glassdoor embeds ALL job data in Apollo cache with __ref resolution needed
            const apolloData = extractGlassdoorApolloCache(html, $);
            if (apolloData) {
                // Find jobListings query key (format: jobListings({...params...}))
                for (const [key, value] of Object.entries(apolloData)) {
                    if (!key.startsWith('jobListings')) continue;
                    const listingsData = value as any;
                    const listings: any[] = listingsData?.jobListings || listingsData?.jobResults || [];
                    for (const item of listings) {
                        // Each item is a JobView with header/job/overview
                        const header = item?.jobview?.header || item?.header || item;
                        const jobTitle: string = header?.jobTitleText || header?.normalizedJobTitle || item?.jobTitle || '';
                        const jobLink: string = header?.jobLink || item?.jobLink || '';
                        const employer = header?.employer || item?.employer || {};
                        const company: string = employer?.name || employer?.shortName || header?.employerName || header?.divisionEmployerName || '';
                        const locationName: string = header?.locationName || item?.locationName || '';
                        const salaryText: string | null = header?.salaryText || header?.payPeriod
                            ? `${header?.payPercentile10 || ''} - ${header?.payPercentile90 || ''} ${header?.payCurrency || ''} (${header?.payPeriod || ''})`
                            : null;

                        if (jobTitle && jobLink) {
                            const fullUrl = jobLink.startsWith('http') ? jobLink : `https://www.glassdoor.com${jobLink}`;
                            jobs.push({
                                title: jobTitle,
                                company: cleanCompanyName(company) || 'Unknown Company',
                                location: locationName || location,
                                salary: salaryText,
                                url: fullUrl,
                                source: 'glassdoor'
                            });
                        }
                    }
                }

                // Also check for flat JobView: or JobListing: keys in the resolved cache
                if (jobs.length === 0) {
                    const rawCache = (() => {
                        try {
                            const nd = $('script#__NEXT_DATA__').html();
                            if (nd) return JSON.parse(nd)?.props?.pageProps?.apolloCache;
                        } catch { return null; }
                    })();

                    if (rawCache) {
                        for (const [key, item] of Object.entries(rawCache as Record<string, any>)) {
                            if (!key.startsWith('JobView:') && !key.startsWith('JobListing:')) continue;
                            const title: string = item?.header?.jobTitleText || item?.jobTitleText || '';
                            const jobLink: string = item?.header?.jobLink || item?.jobLink || '';
                            const company: string = item?.header?.employer?.name || item?.header?.employerName || '';
                            const loc: string = item?.header?.locationName || '';
                            if (title && jobLink) {
                                const fullUrl = jobLink.startsWith('http') ? jobLink : `https://www.glassdoor.com${jobLink}`;
                                jobs.push({
                                    title,
                                    company: cleanCompanyName(company) || 'Unknown Company',
                                    location: loc || location,
                                    url: fullUrl,
                                    source: 'glassdoor'
                                });
                            }
                        }
                    }
                }
            }

            // === FALLBACK: CSS selectors for job cards ===
            if (jobs.length === 0) {
                $('[data-test="jobListing"], li[data-test="job-tile"], div[class*="JobCard_jobCard"], li[class*="JobsList_jobListItem"], article[id^="job-listing-"], div[class*="jobCard"]').each((i, el) => {
                    const aTag = $(el).find('a[data-test="job-title"], a[data-test="job-link"], a[class*="JobCard_jobTitle"], a[class*="jobTitle"], a[class*="JobCard_seoLink"], a[href*="/job-listing/"], a[href*="/partner/jobListing.htm"]').first();
                    const jobTitle = aTag.text().trim();
                    let jobUrl = aTag.attr('href') || '';
                    if (jobUrl && !jobUrl.startsWith('http')) jobUrl = 'https://www.glassdoor.com' + jobUrl;
                    const companyText = $(el).find('[class*="EmployerProfile_employerName"], [data-test="employer-name"], [class*="JobCard_companyName"], span[class*="employerName"], [class*="EmployerProfile_compactEmployerName"]').first().text().trim();
                    const locationText = $(el).find('[data-test="emp-location"], [class*="JobCard_location"], [class*="location"]').first().text().trim() || location;
                    const salaryText = $(el).find('[data-test="detailSalary"], [class*="SalaryEstimate"], [class*="JobCard_salaryEstimate"]').first().text().trim() || null;
                    if (jobTitle && jobUrl) {
                        jobs.push({
                            title: jobTitle,
                            company: cleanCompanyName(companyText) || 'Unknown Company',
                            location: locationText,
                            salary: salaryText,
                            url: jobUrl.split('?')[0],
                            source: 'glassdoor'
                        });
                    }
                });
            }
        }

        await prisma.scraperLog.create({
            data: {
                scraperName: 'Glassdoor (Native)',
                targetUrl,
                status: 'SUCCESS',
                resultsCount: jobs.length,
                usedFirecrawl: false
            }
        });
    } catch (e: any) {
        console.error("Glassdoor Scrape Error:", e);
        try {
            await prisma.scraperLog.create({
                data: {
                    scraperName: 'Glassdoor (Native)',
                    targetUrl,
                    status: 'FAILURE',
                    resultsCount: 0,
                    usedFirecrawl: false,
                    errorDetails: e.message
                }
            });
        } catch {}
    }

    return jobs;
}

/**
 * Scrape Dice.com job listings.
 * Dice is a Next.js app — job data lives in __NEXT_DATA__ under
 * props.pageProps.initialState.jobs.payload.data or similar paths,
 * or in JSON-LD ItemList blocks. Each job has a UUID that maps to
 * the dice.com/job-detail/{uuid} URL (used by our existing jobFetcher
 * Dice profile API to retrieve full descriptions).
 */
export async function scrapeDice(keyword: string, location: string = 'Remote'): Promise<any[]> {
    const jobs: any[] = [];
    const isRemote = location.toLowerCase().includes('remote');
    const searchUrl = `https://www.dice.com/jobs?q=${encodeURIComponent(keyword)}&location=${encodeURIComponent(isRemote ? 'Remote' : location)}&countryCode=US&radius=30&radiusUnit=mi&page=1&pageSize=20${isRemote ? '&filters.workplaceTypes=Remote' : ''}`;

    try {
        let html = '';

        if (process.env.SCRAPEDO_API_KEY) {
            const proxyUrl = `http://api.scrape.do?token=${process.env.SCRAPEDO_API_KEY}&super=true&render=true&url=${encodeURIComponent(searchUrl)}`;
            try {
                const res = await fetch(proxyUrl, { signal: AbortSignal.timeout(25000) });
                if (res.ok) {
                    const text = await res.text();
                    if (text && !text.includes('403 Forbidden') && !text.includes('Access Denied')) {
                        html = text;
                    }
                }
            } catch { /* continue without proxy */ }
        }

        // Direct fetch fallback (no proxy)
        if (!html) {
            try {
                const res = await fetch(searchUrl, {
                    signal: AbortSignal.timeout(15000),
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                        'Accept-Language': 'en-US,en;q=0.9',
                    }
                });
                if (res.ok) html = await res.text();
            } catch { /* ignore */ }
        }

        if (html) {
            const $ = cheerio.load(html);

            // === PRIMARY: __NEXT_DATA__ (Dice is Next.js) ===
            const nextDataRaw = $('script#__NEXT_DATA__').html();
            if (nextDataRaw) {
                try {
                    const nextData = JSON.parse(nextDataRaw);
                    // Dice stores results at multiple possible paths
                    const payload =
                        nextData?.props?.pageProps?.initialState?.jobs?.payload ||
                        nextData?.props?.pageProps?.searchResult ||
                        nextData?.props?.pageProps?.jobs ||
                        null;

                    const results: any[] = payload?.data || payload?.results || payload || [];
                    if (Array.isArray(results)) {
                        for (const job of results) {
                            const title: string = job?.title || job?.jobTitle || job?.positionTitle || '';
                            const company: string = job?.hiringOrganization?.name || job?.companyName || job?.employerName || job?.company?.name || '';
                            const loc: string = job?.jobLocation?.[0]?.address?.addressLocality || job?.location || job?.workplaceType || location;
                            const id: string = job?.id || job?.jobId || job?.adId || '';
                            const slug: string = job?.slug || '';
                            // Inline description (occasionally present in listing JSON)
                            const inlineDesc: string = job?.description || job?.jobDescription || job?.summary || '';
                            let jobUrl = '';
                            if (id) {
                                jobUrl = `https://www.dice.com/job-detail/${id}`;
                            } else if (slug) {
                                jobUrl = `https://www.dice.com/jobs/${slug}`;
                            }
                            if (title && jobUrl) {
                                jobs.push({
                                    title,
                                    company: cleanCompanyName(company) || 'Unknown Company',
                                    location: loc,
                                    url: jobUrl,
                                    description: inlineDesc ? cheerio.load(inlineDesc).text().trim() : '',
                                    source: 'dice'
                                });
                            }
                        }
                    }
                } catch { /* fall through to JSON-LD */ }
            }

            // === FALLBACK 1: JSON-LD ItemList ===
            if (jobs.length === 0) {
                $('script[type="application/ld+json"]').each((_, el) => {
                    try {
                        const data = JSON.parse($(el).html() || '');
                        const arr = Array.isArray(data) ? data : [data];
                        for (const item of arr) {
                            if (item['@type'] === 'ItemList' && Array.isArray(item.itemListElement)) {
                                for (const entry of item.itemListElement) {
                                    const job = entry.item || entry;
                                    const title: string = job?.title || job?.name || '';
                                    const company: string = job?.hiringOrganization?.name || '';
                                    const loc: string = job?.jobLocation?.[0]?.address?.addressLocality || location;
                                    const url: string = job?.url || entry?.url || '';
                                    if (title && url) {
                                        jobs.push({
                                            title,
                                            company: cleanCompanyName(company) || 'Unknown Company',
                                            location: loc,
                                            url,
                                            source: 'dice'
                                        });
                                    }
                                }
                            } else if (item['@type'] === 'JobPosting') {
                                const title: string = item?.title || '';
                                const company: string = item?.hiringOrganization?.name || '';
                                const loc: string = item?.jobLocation?.[0]?.address?.addressLocality || location;
                                const url: string = item?.url || '';
                                if (title && url) {
                                    jobs.push({
                                        title,
                                        company: cleanCompanyName(company) || 'Unknown Company',
                                        location: loc,
                                        url,
                                        source: 'dice'
                                    });
                                }
                            }
                        }
                    } catch { /* ignore */ }
                });
            }

            // === FALLBACK 2: CSS selectors ===
            if (jobs.length === 0) {
                $('a[data-cy="card-title-link"], a[class*="card-title"], [data-testid="job-card"] a, article.card a').each((_, el) => {
                    const title = $(el).text().trim();
                    let jobUrl = $(el).attr('href') || '';
                    if (!jobUrl || !title) return;
                    if (jobUrl && !jobUrl.startsWith('http')) jobUrl = 'https://www.dice.com' + jobUrl;
                    const card = $(el).closest('article, div[data-testid], li');
                    const company = card.find('[data-cy="search-result-company-name"], [class*="company"]').first().text().trim() || 'Unknown Company';
                    const loc = card.find('[data-cy="search-result-location"], [class*="location"]').first().text().trim() || location;
                    jobs.push({
                        title,
                        company: cleanCompanyName(company) || 'Unknown Company',
                        location: loc,
                        url: jobUrl,
                        source: 'dice'
                    });
                });
            }
        }

        // === SECOND PASS: Fetch full descriptions for jobs missing them ===
        // Dice loads full descriptions only on the /job-detail/{id} page.
        // We batch-fetch up to 10 concurrently to stay within timeout budgets.
        const jobsMissingDesc = jobs.filter(j => !j.description || j.description.trim().length < 80);
        if (jobsMissingDesc.length > 0) {
            const BATCH_SIZE = 10;
            const fetchDiceDescription = async (job: any): Promise<void> => {
                try {
                    let detailHtml = '';

                    // Direct fetch first — Dice detail pages are SSR'd by Next.js so no JS
                    // rendering is needed and __NEXT_DATA__ is present in the raw HTML response.
                    try {
                        const res = await fetch(job.url, {
                            signal: AbortSignal.timeout(12000),
                            headers: {
                                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                                'Accept-Language': 'en-US,en;q=0.9',
                            }
                        });
                        if (res.ok) {
                            const text = await res.text();
                            if (text && !text.includes('403 Forbidden') && !text.includes('Access Denied') && !text.includes('captcha')) {
                                detailHtml = text;
                            }
                        }
                    } catch { /* fall through to proxy */ }

                    // Only use scrape.do if the direct fetch was blocked or returned nothing
                    if (!detailHtml && process.env.SCRAPEDO_API_KEY) {
                        try {
                            const proxyUrl = `http://api.scrape.do?token=${process.env.SCRAPEDO_API_KEY}&super=true&render=true&url=${encodeURIComponent(job.url)}`;
                            const res = await fetch(proxyUrl, { signal: AbortSignal.timeout(15000) });
                            if (res.ok) {
                                const text = await res.text();
                                if (text && !text.includes('403 Forbidden') && !text.includes('Access Denied')) detailHtml = text;
                            }
                        } catch { /* give up */ }
                    }

                    if (!detailHtml) return;


                    const $d = cheerio.load(detailHtml);

                    // Priority 1: __NEXT_DATA__ embedded JSON (most reliable for Dice)
                    const nextDataRaw = $d('script#__NEXT_DATA__').html();
                    if (nextDataRaw) {
                        try {
                            const nd = JSON.parse(nextDataRaw);
                            const jobData =
                                nd?.props?.pageProps?.job ||
                                nd?.props?.pageProps?.initialState?.jobDetail?.payload ||
                                nd?.props?.pageProps?.jobDetail ||
                                null;
                            const rawDesc: string =
                                jobData?.description ||
                                jobData?.jobDescription ||
                                jobData?.descriptionHtml ||
                                '';
                            if (rawDesc && rawDesc.trim().length > 80) {
                                job.description = cheerio.load(rawDesc).text().trim();
                                return;
                            }
                        } catch { /* fall through */ }
                    }

                    // Priority 2: JSON-LD JobPosting
                    $d('script[type="application/ld+json"]').each((_, el) => {
                        try {
                            const data = JSON.parse($d(el).html() || '');
                            const arr = Array.isArray(data) ? data : [data];
                            for (const item of arr) {
                                if (item['@type'] === 'JobPosting' && item.description) {
                                    const desc = cheerio.load(item.description).text().trim();
                                    if (desc.length > 80) { job.description = desc; return; }
                                }
                            }
                        } catch { /* ignore */ }
                    });
                    if (job.description && job.description.length > 80) return;

                    // Priority 3: CSS selectors for rendered description containers
                    const descEl = $d(
                        '[data-cy="jobDescription"], .job-description, #jobDescription, [class*="description"], [class*="job-detail__description"]'
                    ).first();
                    if (descEl.length) {
                        const desc = descEl.text().trim();
                        if (desc.length > 80) { job.description = desc; return; }
                    }
                } catch (err: any) {
                    console.warn(`[Dice Detail Fetch] Could not fetch description for ${job.url}: ${err.message}`);
                }
            };

            for (let i = 0; i < jobsMissingDesc.length; i += BATCH_SIZE) {
                const batch = jobsMissingDesc.slice(i, i + BATCH_SIZE);
                await Promise.allSettled(batch.map(j => fetchDiceDescription(j)));
            }
        }

        await prisma.scraperLog.create({
            data: {
                scraperName: 'Dice (Native)',
                targetUrl: searchUrl,
                status: 'SUCCESS',
                resultsCount: jobs.length,
                usedFirecrawl: false
            }
        }).catch(console.error);
    } catch (e: any) {
        console.error('Dice scrape error:', e);
        try {
            await prisma.scraperLog.create({
                data: {
                    scraperName: 'Dice (Native)',
                    targetUrl: searchUrl,
                    status: 'FAILURE',
                    resultsCount: 0,
                    usedFirecrawl: false,
                    errorDetails: e.message
                }
            }).catch(() => {});
        } catch {}
    }

    return jobs;
}

export async function scrapeLinkedIn(keyword: string, location: string = 'remote'): Promise<any[]> {
    try {
        const query = encodeURIComponent(keyword);
        const loc = encodeURIComponent(location);
        const url = `https://www.linkedin.com/jobs/search/?keywords=${query}&location=${loc}`;
        
        // Let's use our fetchPage which handles proxy fallbacks nicely
        const { $ } = await fetchPage(url, 1);
        if (!$) return [];

        const jobs: any[] = [];
        
        $('.base-card').each((i, el) => {
            const title = $(el).find('.base-search-card__title').text().trim();
            const company = $(el).find('.base-search-card__subtitle').text().trim();
            const jobUrl = $(el).find('.base-card__full-link').attr('href');
            const jobLoc = $(el).find('.job-search-card__location').text().trim();
            
            if (title && jobUrl) {
                jobs.push({
                    title,
                    company: company || 'Unknown Company',
                    location: jobLoc || location,
                    url: jobUrl.split('?')[0],
                    source: 'linkedin',
                    type: 'Full-time'
                });
            }
        });

        // Log to database
        await prisma.scraperLog.create({
            data: {
                scraperName: 'LinkedIn (Native)',
                targetUrl: url,
                status: 'SUCCESS',
                resultsCount: jobs.length,
                usedFirecrawl: false
            }
        }).catch(console.error);

        return jobs;
    } catch (error: any) {
        console.error("LinkedIn scrape error:", error);
        try {
            await prisma.scraperLog.create({
                data: {
                    scraperName: 'LinkedIn (Native)',
                    targetUrl: `https://www.linkedin.com/jobs/search/?keywords=${encodeURIComponent(keyword)}&location=${encodeURIComponent(location)}`,
                    status: 'FAILURE',
                    resultsCount: 0,
                    usedFirecrawl: false,
                    errorDetails: error.message
                }
            }).catch(() => {});
        } catch {}
        return [];
    }
}

export async function scrapeZipRecruiter(keyword: string, location: string = 'remote'): Promise<any[]> {
    try {
        const query = encodeURIComponent(keyword);
        const loc = encodeURIComponent(location);
        const url = `https://www.ziprecruiter.com/jobs-search?search=${query}&location=${loc}`;
        
        // super=true is required for ZipRecruiter on scrape.do
        const proxyUrl = `http://api.scrape.do?token=${process.env.SCRAPEDO_API_KEY}&super=true&url=${encodeURIComponent(url)}`;
        const res = await fetch(proxyUrl);
        const html = await res.text();
        
        const $ = cheerio.load(html);
        const jobs: any[] = [];
        
        $('script[type="application/ld+json"]').each((i, el) => {
            try {
                const data = JSON.parse($(el).text());
                const arr = Array.isArray(data) ? data : [data];
                for (const item of arr) {
                    if (item['@type'] === 'ItemList' && item.itemListElement) {
                        for (const listEl of item.itemListElement) {
                            if (listEl['@type'] === 'ListItem' && listEl.name && listEl.url) {
                                // Attempt to parse company and location from ZipRecruiter URL
                                // e.g. /c/Capital-One/Job/...-in-Mclean,VA
                                let company = 'Unknown Company';
                                let jobLoc = location;
                                
                                const companyMatch = listEl.url.match(/\/c\/([^\/]+)\//);
                                if (companyMatch && companyMatch[1]) {
                                    company = companyMatch[1].replace(/-/g, ' ');
                                }
                                
                                const locMatch = listEl.url.match(/-in-([^?]+)/);
                                if (locMatch && locMatch[1]) {
                                    jobLoc = locMatch[1].replace(/-/g, ' ');
                                }

                                jobs.push({
                                    title: listEl.name,
                                    company,
                                    location: jobLoc,
                                    url: listEl.url,
                                    source: 'ziprecruiter',
                                    type: 'Full-time'
                                });
                            }
                        }
                    }
                }
            } catch(e) {}
        });

        // Log to database
        await prisma.scraperLog.create({
            data: {
                scraperName: 'ZipRecruiter (Native)',
                targetUrl: url,
                status: 'SUCCESS',
                resultsCount: jobs.length,
                usedFirecrawl: false
            }
        }).catch(console.error);

        return jobs;
    } catch (error: any) {
        console.error("ZipRecruiter scrape error:", error);
        try {
            await prisma.scraperLog.create({
                data: {
                    scraperName: 'ZipRecruiter (Native)',
                    targetUrl: `https://www.ziprecruiter.com/jobs-search?search=${encodeURIComponent(keyword)}&location=${encodeURIComponent(location)}`,
                    status: 'FAILURE',
                    resultsCount: 0,
                    usedFirecrawl: false,
                    errorDetails: error.message
                }
            }).catch(() => {});
        } catch {}
        return [];
    }
}

/**
 * Scrapes international job boards.
 * - Job Bank CA: Canadian government job portal (scrape.do proxy, HTML)
 * - Computrabajo: Latin America's largest job board (scrape.do proxy, HTML)
 * - Arbeitsagentur: Germany's official job board (free public REST API)
 * - The Muse: Global remote-friendly jobs (free public API, full descriptions)
 */
export async function scrapeInternational(keyword: string, sources: any) {
    const jobs: any[] = [];

    async function fetchViaProxy(url: string, useSuper = false): Promise<cheerio.CheerioAPI | null> {
        try {
            if (!process.env.SCRAPEDO_API_KEY) {
                const res = await fetch(url, { signal: AbortSignal.timeout(15000), headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' } });
                if (!res.ok) return null;
                return cheerio.load(await res.text());
            }
            const proxyUrl = `http://api.scrape.do?token=${process.env.SCRAPEDO_API_KEY}${useSuper ? '&super=true' : ''}&url=${encodeURIComponent(url)}`;
            const res = await fetch(proxyUrl, { signal: AbortSignal.timeout(25000) });
            if (!res.ok) return null;
            return cheerio.load(await res.text());
        } catch (e: any) {
            console.warn(`fetchViaProxy error for ${url}: ${e.message}`);
            return null;
        }
    }

    async function logResult(scraperName: string, targetUrl: string, count: number, error?: string) {
        try {
            await prisma.scraperLog.create({
                data: { scraperName, targetUrl, status: error ? 'FAILURE' : 'SUCCESS', resultsCount: count, usedFirecrawl: false, errorDetails: error || null }
            });
        } catch (e) { console.error('Failed to log scraper:', e); }
    }

    // -------------------------
    // Job Bank (Canada) — HTML scraping via proxy
    // -------------------------
    if (sources.jobbank) {
        const url = `https://www.jobbank.gc.ca/jobsearch/jobsearch?searchstring=${encodeURIComponent(keyword)}&sort=M`;
        try {
            const $ = await fetchViaProxy(url);
            const pageJobs: any[] = [];
            if ($) {
                $('a[href*="jobposting"]').each((_, el) => {
                    const href = $(el).attr('href') || '';
                    if (!href.includes('/jobposting/')) return;
                    const fullUrl = `https://www.jobbank.gc.ca${href.split(';')[0]}`;
                    const title = $(el).find('span:not([class*="badge"])').first().text().trim() || keyword;
                    const company = $(el).find('[class*="company"], [class*="employer"]').text().trim() || 'Job Bank';
                    const location = $(el).find('[class*="location"], [class*="city"]').text().trim() || 'Canada';
                    if (fullUrl.includes('/jobposting/')) {
                        pageJobs.push({ title: title || keyword, company, location, description: `Apply at: ${fullUrl}`, url: fullUrl, source: 'Job Bank (CA)' });
                    }
                });
            }
            const seen = new Set<string>();
            for (const j of pageJobs) {
                if (!seen.has(j.url)) { seen.add(j.url); jobs.push(j); }
            }
            await logResult('Job Bank (CA)', url, pageJobs.length);
        } catch (e: any) {
            await logResult('Job Bank (CA)', url, 0, e.message);
        }
    }

    // -------------------------
    // Computrabajo (Latin America) — HTML scraping via proxy
    // -------------------------
    if (sources.computrabajo) {
        const slug = keyword.toLowerCase().replace(/\s+/g, '-');
        const url = `https://mx.computrabajo.com/trabajo-de-${slug}`;
        try {
            const $ = await fetchViaProxy(url, true);
            const pageJobs: any[] = [];
            if ($) {
                $('a[href*="/ofertas-de-trabajo/"]').each((_, el) => {
                    const href = $(el).attr('href') || '';
                    if (!href.includes('/oferta-de-trabajo')) return;
                    const fullUrl = href.startsWith('http') ? href : `https://mx.computrabajo.com${href.split('#')[0]}`;
                    const container = $(el).closest('article, li, div[class*="box"]');
                    const rawTitle = container.find('h2, h3, p strong, [class*="title"]').first().text().trim() || $(el).text().trim();
                    const title = (rawTitle.indexOf('\n') > -1 ? rawTitle.substring(0, rawTitle.indexOf('\n')) : rawTitle).trim();
                    const company = container.find('[class*="company"], [class*="empresa"]').text().trim() || 'Computrabajo';
                    const location = container.find('[class*="location"], [class*="ciudad"]').text().trim() || 'Mexico';
                    if (title && title.length > 3) {
                        pageJobs.push({ title, company, location, description: `Apply at: ${fullUrl}`, url: fullUrl, source: 'Computrabajo (LATAM)' });
                    }
                });
            }
            const seen = new Set<string>();
            for (const j of pageJobs) {
                if (!seen.has(j.url)) { seen.add(j.url); jobs.push(j); }
            }
            await logResult('Computrabajo (LATAM)', url, pageJobs.length);
        } catch (e: any) {
            await logResult('Computrabajo (LATAM)', url, 0, e.message);
        }
    }



    // -------------------------
    // The Muse — Free public API, full descriptions, global remote jobs
    // -------------------------
    if (sources.themuse) {
        const url = `https://www.themuse.com/api/public/jobs?page=1&descending=true&location=Flexible+%2F+Remote&api_key=`;
        try {
            const res = await fetch(url, { headers: { 'Accept': 'application/json' }, signal: AbortSignal.timeout(15000) });
            const pageJobs: any[] = [];
            if (res.ok) {
                const data = await res.json();
                const results = data?.results || [];
                const kwLower = keyword.toLowerCase();
                for (const item of results) {
                    const title: string = item.name || '';
                    // Filter by keyword relevance
                    if (!title.toLowerCase().includes(kwLower) && !item.contents?.toLowerCase().includes(kwLower)) continue;
                    const company: string = item.company?.name || 'The Muse';
                    const location: string = item.locations?.map((l: any) => l.name).join(', ') || 'Remote';
                    // Strip HTML from description
                    const rawDesc: string = item.contents || '';
                    const description = rawDesc.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
                    const jobUrl: string = item.refs?.landing_page || `https://www.themuse.com/jobs/${item.id}`;
                    pageJobs.push({
                        title,
                        company,
                        location,
                        description: description ? description + `\n\nApply at: ${jobUrl}` : `Apply at: ${jobUrl}`,
                        url: jobUrl,
                        source: 'The Muse (Global)'
                    });
                }
            }
            jobs.push(...pageJobs);
            await logResult('The Muse (Global)', url, pageJobs.length);
        } catch (e: any) {
            await logResult('The Muse (Global)', url, 0, e.message);
        }
    }

    return jobs;
}

/**
 * Scrape Snagajob listings (retail, hospitality, customer service, administration, warehouse, general non-tech).
 */
export async function scrapeSnagajob(keyword: string, location: string = 'Remote'): Promise<any[]> {
    const isRemote = !location || location.toLowerCase().includes('remote');
    const searchUrl = `https://www.snagajob.com/search?q=${encodeURIComponent(keyword)}&w=${encodeURIComponent(isRemote ? 'Remote' : location)}`;
    const jobs: any[] = [];

    try {
        const res = await gotScraping({
            url: searchUrl,
            timeout: { request: 12000 },
            headers: {
                'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
                'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                'accept-language': 'en-US,en;q=0.9',
            },
            throwHttpErrors: false,
        });

        if (res.statusCode >= 200 && res.statusCode < 300) {
            const $ = cheerio.load(res.body.toString());

            $('a[href*="/jobs/"]').each((_, el) => {
                const href = $(el).attr('href');
                if (!href) return;
                const fullUrl = href.startsWith('http') ? href : `https://www.snagajob.com${href}`;
                if (jobs.some(j => j.url === fullUrl || j.url.split('?')[0] === fullUrl.split('?')[0])) return;

                const card = $(el).closest('article, .job-card, [class*="JobCard"], [data-testid*="job"], div');
                const titleFromTag = card.find('[data-snagtag="job-title"]').text().trim();
                const ariaLabel = $(el).attr('aria-label') || '';
                const ariaMatch = ariaLabel.match(/Open this (.+) in a new tab/i);
                const titleFromAria = ariaMatch ? ariaMatch[1].trim() : '';
                const title = titleFromTag || titleFromAria || card.find('h2, h3').first().text().trim() || 'Job Opportunity';
                
                const company = card.find('[data-snagtag="company-name"], [class*="Company"], [class*="company"], [class*="employer"]').first().text().trim() || 'Hiring Company';
                const loc = card.find('[data-snagtag="job-location"], [class*="Location"], [class*="location"]').first().text().trim() || (isRemote ? 'Remote' : location);

                if (title && title.length > 2 && fullUrl.match(/\/jobs\/\d+/)) {
                    jobs.push({
                        title: title.replace(/open_in_new/g, '').trim(),
                        company,
                        location: loc,
                        description: `Apply at: ${fullUrl}`,
                        url: fullUrl,
                        source: 'snagajob',
                        scraperName: 'Snagajob (Native)',
                    });
                }
            });
        }

        // Fetch detail descriptions for the top batch of jobs using JSON-LD
        const jobsToFetch = jobs.slice(0, 10);
        await Promise.allSettled(jobsToFetch.map(async (job) => {
            try {
                const dRes = await gotScraping({
                    url: job.url,
                    timeout: { request: 8000 },
                    headers: {
                        'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
                    },
                    throwHttpErrors: false,
                });
                if (dRes.statusCode >= 200 && dRes.statusCode < 300) {
                    const $d = cheerio.load(dRes.body.toString());
                    $d('script[type="application/ld+json"]').each((_, el) => {
                        try {
                            const parsed = JSON.parse($d(el).html() || '{}');
                            const items = Array.isArray(parsed) ? parsed : (parsed['@graph'] || [parsed]);
                            for (const it of items) {
                                if (it['@type'] === 'JobPosting') {
                                    if (it.title) job.title = it.title.replace(/ - Now Hiring/i, '').trim();
                                    if (it.hiringOrganization?.name) job.company = it.hiringOrganization.name;
                                    if (it.jobLocation?.address?.addressLocality) {
                                        const city = it.jobLocation.address.addressLocality;
                                        const region = it.jobLocation.address.addressRegion || '';
                                        job.location = region ? `${city}, ${region}` : city;
                                    }
                                    if (it.description) {
                                        const cleanDesc = cheerio.load(it.description).text().replace(/\s+/g, ' ').trim();
                                        job.description = `${cleanDesc}\n\nApply at: ${job.url}`;
                                    }
                                    if (it.baseSalary?.value?.value) {
                                        job.salary = `$${it.baseSalary.value.value} ${it.baseSalary.value.unitText || ''}`.trim();
                                    }
                                    if (it.datePosted) {
                                        job.postedAt = it.datePosted;
                                    }
                                }
                            }
                        } catch {}
                    });
                }
            } catch {}
        }));

        await prisma.scraperLog.create({
            data: {
                scraperName: 'Snagajob (Native)',
                targetUrl: searchUrl,
                status: 'SUCCESS',
                resultsCount: jobs.length,
                usedFirecrawl: false
            }
        }).catch(console.error);

        return jobs;
    } catch (e: any) {
        console.error(`Snagajob scrape error: ${e.message}`);
        await prisma.scraperLog.create({
            data: {
                scraperName: 'Snagajob (Native)',
                targetUrl: searchUrl,
                status: 'FAILURE',
                resultsCount: 0,
                errorDetails: e.message,
                usedFirecrawl: false
            }
        }).catch(console.error);
        return jobs;
    }
}

/**
 * Scrape BuiltIn listings (tech, startup, remote hubs).
 */
export async function scrapeBuiltIn(keyword: string, location: string = 'Remote'): Promise<any[]> {
    const isRemote = !location || location.toLowerCase().includes('remote');
    const searchUrl = `https://builtin.com/jobs?search=${encodeURIComponent(keyword)}${isRemote ? '&location=Remote' : `&location=${encodeURIComponent(location)}`}`;
    const jobs: any[] = [];

    try {
        const res = await gotScraping({
            url: searchUrl,
            timeout: { request: 12000 },
            headers: {
                'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
                'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                'accept-language': 'en-US,en;q=0.9',
            },
            throwHttpErrors: false,
        });

        if (res.statusCode >= 200 && res.statusCode < 300) {
            const $ = cheerio.load(res.body.toString());

            $('a[href*="/job/"]').each((_, el) => {
                const href = $(el).attr('href');
                if (!href || !href.match(/\/job\/[^/]+\/\d+/)) return;
                const fullUrl = href.startsWith('http') ? href : `https://builtin.com${href}`;
                if (jobs.some(j => j.url === fullUrl)) return;

                const card = $(el).closest('[data-id="job-card"], .job-item, [id*="job-card"], article, div');
                const title = $(el).text().trim() || card.find('h2, h3, [data-id="job-title"]').first().text().trim();
                const company = card.find('[data-id="company-title"], .company-title, [class*="company"]').first().text().trim() || 'Built In Partner';
                const loc = card.find('[data-id="job-location"], .job-location, [class*="location"]').first().text().trim() || (isRemote ? 'Remote' : location);

                if (title && title.length > 2) {
                    jobs.push({
                        title,
                        company,
                        location: loc,
                        description: `Apply at: ${fullUrl}`,
                        url: fullUrl,
                        source: 'builtin',
                        scraperName: 'BuiltIn (Native)',
                    });
                }
            });
        }

        // Fetch detail descriptions from BuiltIn JSON-LD
        const jobsToFetch = jobs.slice(0, 10);
        await Promise.allSettled(jobsToFetch.map(async (job) => {
            try {
                const dRes = await gotScraping({
                    url: job.url,
                    timeout: { request: 8000 },
                    headers: {
                        'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
                    },
                    throwHttpErrors: false,
                });
                if (dRes.statusCode >= 200 && dRes.statusCode < 300) {
                    const $d = cheerio.load(dRes.body.toString());
                    $d('script[type="application/ld+json"]').each((_, el) => {
                        try {
                            const parsed = JSON.parse($d(el).html() || '{}');
                            const items = Array.isArray(parsed) ? parsed : (parsed['@graph'] || [parsed]);
                            for (const it of items) {
                                if (it['@type'] === 'JobPosting') {
                                    if (it.title) job.title = it.title;
                                    if (it.hiringOrganization?.name) job.company = it.hiringOrganization.name;
                                    if (it.jobLocation?.address?.addressLocality) {
                                        job.location = it.jobLocation.address.addressLocality;
                                    }
                                    if (it.description) {
                                        const cleanDesc = cheerio.load(it.description).text().replace(/\s+/g, ' ').trim();
                                        job.description = `${cleanDesc}\n\nApply at: ${job.url}`;
                                    }
                                    if (it.datePosted) {
                                        job.postedAt = it.datePosted;
                                    }
                                }
                            }
                        } catch {}
                    });
                }
            } catch {}
        }));

        await prisma.scraperLog.create({
            data: {
                scraperName: 'BuiltIn (Native)',
                targetUrl: searchUrl,
                status: 'SUCCESS',
                resultsCount: jobs.length,
                usedFirecrawl: false
            }
        }).catch(console.error);

        return jobs;
    } catch (e: any) {
        console.error(`BuiltIn scrape error: ${e.message}`);
        await prisma.scraperLog.create({
            data: {
                scraperName: 'BuiltIn (Native)',
                targetUrl: searchUrl,
                status: 'FAILURE',
                resultsCount: 0,
                errorDetails: e.message,
                usedFirecrawl: false
            }
        }).catch(console.error);
        return jobs;
    }
}

/**
 * Scrape USAJobs (federal, healthcare, administration, management, accounting, operations).
 * Uses official API if USAJOBS_API_KEY is configured.
 */
export async function scrapeUSAJobs(keyword: string, location: string = 'Remote'): Promise<any[]> {
    const isRemote = !location || location.toLowerCase().includes('remote');
    const jobs: any[] = [];
    const apiKey = process.env.USAJOBS_API_KEY;
    const userAgentEmail = process.env.USAJOBS_USER_AGENT_EMAIL || process.env.USAJOBS_EMAIL || 'contact@jobagent.internal';
    const searchTarget = `https://data.usajobs.gov/api/search?Keyword=${encodeURIComponent(keyword)}&LocationName=${encodeURIComponent(isRemote ? 'Remote' : location)}`;

    if (apiKey) {
        try {
            const res = await gotScraping({
                url: `${searchTarget}&ResultsPerPage=25`,
                timeout: { request: 12000 },
                headers: {
                    'User-Agent': userAgentEmail,
                    'Authorization-Key': apiKey,
                    'Accept': 'application/json',
                },
                throwHttpErrors: false,
            });

            if (res.statusCode >= 200 && res.statusCode < 300) {
                const data = JSON.parse(res.body.toString());
                const items = data.SearchResult?.SearchResultItems || [];
                for (const it of items) {
                    const desc = it.MatchedObjectDescriptor;
                    if (!desc) continue;
                    const salaryMin = desc.PositionRemuneration?.[0]?.MinimumRange;
                    const salaryMax = desc.PositionRemuneration?.[0]?.MaximumRange;
                    const salaryInterval = desc.PositionRemuneration?.[0]?.RateIntervalCode || 'Per Year';
                    const duties = (desc.UserArea?.Details?.MajorDuties || []).join('\n\n');
                    const qualSummary = desc.QualificationSummary || '';
                    const fullDesc = [duties, qualSummary].filter(Boolean).join('\n\n') || desc.UserArea?.Details?.JobSummary || '';

                    jobs.push({
                        title: desc.PositionTitle || 'Federal Opportunity',
                        company: desc.OrganizationName || desc.DepartmentName || 'U.S. Federal Government',
                        location: desc.PositionLocationDisplay || (isRemote ? 'Remote' : location),
                        salary: salaryMin && salaryMax ? `$${salaryMin} - $${salaryMax} ${salaryInterval}` : undefined,
                        description: fullDesc ? `${fullDesc}\n\nApply at: ${desc.PositionURI}` : `Apply at: ${desc.PositionURI}`,
                        url: desc.PositionURI || `https://www.usajobs.gov/job/${it.MatchedObjectId}`,
                        postedAt: desc.PublicationStartDate,
                        source: 'usajobs',
                        scraperName: 'USAJobs (Official API)',
                    });
                }
            }

            await prisma.scraperLog.create({
                data: {
                    scraperName: 'USAJobs (Official API)',
                    targetUrl: searchTarget,
                    status: 'SUCCESS',
                    resultsCount: jobs.length,
                    usedFirecrawl: false
                }
            }).catch(console.error);
        } catch (e: any) {
            console.error(`USAJobs API error: ${e.message}`);
            await prisma.scraperLog.create({
                data: {
                    scraperName: 'USAJobs (Official API)',
                    targetUrl: searchTarget,
                    status: 'FAILURE',
                    resultsCount: 0,
                    errorDetails: e.message,
                    usedFirecrawl: false
                }
            }).catch(console.error);
        }
    }

    return jobs;
}

