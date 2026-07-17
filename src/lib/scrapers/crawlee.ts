import * as cheerio from 'cheerio';

/**
 * Lightweight HTTP scraper using fetch + Cheerio.
 * Replaces PlaywrightCrawler to avoid needing Chromium on the server.
 */

import { gotScraping } from 'got-scraping';
import got from 'got';
import { prisma } from '../prisma';

async function fetchPage(url: string, retries = 3): Promise<{ $: cheerio.CheerioAPI | null, usedFirecrawl: boolean }> {
    for (let attempt = 1; attempt <= retries; attempt++) {
        let needsFallback = false;
        try {
            const res = await gotScraping({
                url,
                timeout: { request: 15000 },
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
            } else {
                console.warn(`Attempt ${attempt}: Failed to fetch ${url} (Status: ${res.statusCode})`);
                needsFallback = true;
            }
        } catch (e: any) {
            console.warn(`Attempt ${attempt}: Error fetching ${url}: ${e.message}`);
            needsFallback = true;
        }

        if (needsFallback) {
            // Fallback to Scrape.do proxy for any block or non-200 status
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
                    const companyName = $('title').text().replace('Job Board', '').trim();
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

                } else if (url.includes('jobs.lever.co')) {
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

                } else if (url.includes('jobs.ashbyhq.com')) {
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
    if (sources.remoteco) urls.push({ url: `https://remote.co/remote-jobs/search/?search_keywords=${encodeURIComponent(keyword)}`, source: 'remoteco' });
    if (sources.remoteok) urls.push({ url: `https://remoteok.com/api?tag=${encodeURIComponent(keyword.replace(/\s+/g, '-'))}`, source: 'remoteok' });
    if (sources.workingnomads) urls.push({ url: `https://www.workingnomads.com/api/exposed_jobs/`, source: 'workingnomads' });
    if (sources.remotive) urls.push({ url: `https://remotive.com/api/remote-jobs?search=${encodeURIComponent(keyword)}`, source: 'remotive' });

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
                    let res = await gotScraping({ url, responseType: 'json', throwHttpErrors: false });
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        const data = res.body as any;
                        if (Array.isArray(data)) {
                            for (const job of data) {
                                if (keyword && !job.title?.toLowerCase().includes(keyword.toLowerCase()) && !job.company_name?.toLowerCase().includes(keyword.toLowerCase())) continue;
                                pageJobs.push({
                                    title: job.title,
                                    company: job.company_name,
                                    location: job.location || 'Remote',
                                    description: job.description ? (cheerio.load(job.description).text().replace(/\s+/g, ' ').trim() + `\n\nApply at: ${job.url}`) : `Apply at: ${job.url}`,
                                    url: job.url,
                                    source: 'WorkingNomads'
                                });
                            }
                        }
                    } else {
                        errorMsg = `HTTP Error: ${res.statusCode}`;
                    }
                } catch (e: any) {
                    console.warn(`Error parsing workingnomads API: ${e.message}`);
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
                        const titleEl = $(el).find('.new-listing__header__title__text').length > 0 
                            ? $(el).find('.new-listing__header__title__text') 
                            : $(el).find('.title');
                        const companyEl = $(el).find('.new-listing__company-name').length > 0 
                            ? $(el).find('.new-listing__company-name') 
                            : $(el).find('.company');
                        const href = $(el).attr('href') || '';
                        
                        if (!href.includes('/remote-jobs/')) return;
                        
                        const fullUrl = href.startsWith('http') ? href : `https://weworkremotely.com${href}`;
                        
                        let salaryText = '';
                        let locationText = 'Remote';
                        $(el).find('.new-listing__categories__category, .region').each((_, cat) => {
                            const text = $(cat).text().trim();
                            if (text.includes('$') || text.includes('€') || text.includes('£')) {
                                salaryText = text;
                            } else if (!text.toLowerCase().includes('time') && !text.toLowerCase().includes('contract') && !text.toLowerCase().includes('boosted') && !text.toLowerCase().includes('top 100')) {
                                locationText = text;
                            }
                        });

                        const title = titleEl.text().trim();
                        if (!title) return; // Skip non-job links (like marketing/nav links)

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

                    // Fetch actual job descriptions for WWR to avoid "Apply at: [URL]" only descriptions
                    const batchSize = 3;
                    for (let i = 0; i < pageJobs.length; i += batchSize) {
                        const batch = pageJobs.slice(i, i + batchSize);
                        await Promise.all(batch.map(async (job) => {
                            try {
                                const { $ } = await fetchPage(job.url, 1);
                                if ($) {
                                    const desc = $('.listing-container, #job-listing-show-container, .lis-container__job__content__description, .lis-container').text().trim();
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
        remotive: 'Remotive'
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
    try {
        const params = new URLSearchParams();
        params.append('search_keywords', keyword);
        params.append('per_page', '50');
        params.append('orderby', 'featured');
        params.append('order', 'DESC');
        
        const response = await fetch('https://remotepoc.com/jm-ajax/get_listings/', {
            method: 'POST',
            body: params
        });

        const body = await response.json();
        if (body && body.html) {
            const $ = cheerio.load(body.html);
            $('li.job_listing').each((i, el) => {
                const title = $(el).find('h3.job_listing-title').text().trim();
                const company = $(el).find('.job_listing-company strong').text().trim();
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
    } catch (e) {
        console.error("RemotePOC Scrape Error:", e);
    }
    
    try {
        await prisma.scraperLog.create({
            data: {
                scraperName: 'RemotePOC',
                targetUrl: 'https://remotepoc.com/jm-ajax/get_listings/',
                status: jobs.length > 0 ? 'SUCCESS' : 'FAILURE',
                resultsCount: jobs.length,
                usedFirecrawl: false
            }
        });
    } catch (logErr) {
        console.error('Failed to log RemotePOC scraper', logErr);
    }
    
    return jobs;
}

export async function scrapeKforce(keyword: string) {
    const jobs: any[] = [];
    try {
        const response = await fetch('https://kforcewebeast.search.windows.net/indexes/kforcewebjobentity/docs/search?api-version=2016-09-01', {
            method: 'POST',
            headers: {
                'api-key': '1603E4DC4C87A8E41D6BBDE4EEA4EFB7',
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                count: true,
                select: "Industry, Title, Id, PostDate, Responsibilities, Skills, City, State, Zip, SalaryMin, SalaryMax, SalaryText, ReferenceCode, TypeCode, VisaSponsorshipJob, ApplyUrl, Remote",
                search: keyword,
                top: 25
            })
        });

        const body = await response.json();
        if (body && body.value) {
            body.value.forEach((job: any) => {
                let location = [job.City, job.State, job.Zip].filter(Boolean).join(', ');
                if (!location) location = "US";
                if (job.Remote && job.Remote !== 'No') {
                    location = `Remote (${location})`;
                }
                
                let url = `https://www.kforce.com/jobs/${job.ReferenceCode}/`;
                if (!job.ReferenceCode) {
                    url = job.ApplyUrl || `https://www.kforce.com/find-work/search-jobs/`;
                }
                
                const salary = job.SalaryText || (job.SalaryMin ? `$${job.SalaryMin}-$${job.SalaryMax}` : undefined);
                
                let fullDescription = '';
                if (job.Responsibilities) fullDescription += `Responsibilities:\n${job.Responsibilities}\n\n`;
                if (job.Skills) fullDescription += `Requirements:\n${job.Skills}\n\n`;
                if (fullDescription) {
                    fullDescription = cheerio.load(fullDescription).text().replace(/\s+/g, ' ').trim() + `\n\nApply at: ${url}`;
                } else {
                    fullDescription = `Apply at: ${url}`;
                }
                
                if (job.Title && url && job.Title !== 'Unknown Role') {
                    jobs.push({
                        title: job.Title,
                        company: "Kforce",
                        location,
                        url,
                        salary,
                        description: fullDescription,
                        source: 'kforce'
                    });
                }
            });
        }
    } catch (e) {
        console.error("Kforce Scrape Error:", e);
    }

    try {
        await prisma.scraperLog.create({
            data: {
                scraperName: 'Kforce',
                targetUrl: 'https://www.kforce.com/find-work/search-jobs/',
                status: jobs.length > 0 ? 'SUCCESS' : 'FAILURE',
                resultsCount: jobs.length,
                usedFirecrawl: false
            }
        });
    } catch (logErr) {
        console.error('Failed to log Kforce scraper', logErr);
    }

    return jobs;
}

export async function scrapeHimalayas(keyword: string) {
    const jobs: any[] = [];
    try {
        const res = await fetch(`https://himalayas.app/jobs/api?limit=50`);
        const data = await res.json();
        
        if (data && data.jobs) {
            for (const job of data.jobs) {
                // simple keyword filter since their API keyword search isn't always documented well
                if (keyword && !job.title.toLowerCase().includes(keyword.toLowerCase()) && !job.companyName.toLowerCase().includes(keyword.toLowerCase())) {
                    continue;
                }
                jobs.push({
                    title: job.title,
                    company: job.companyName,
                    location: job.location || 'Remote',
                    url: job.applicationLink || job.jobUrl,
                    salary: (job.minSalary && job.maxSalary) ? `$${job.minSalary} - $${job.maxSalary}` : null,
                    source: 'himalayas'
                });
            }
        }

        await prisma.scraperLog.create({
            data: {
                scraperName: 'Himalayas',
                targetUrl: 'https://himalayas.app/jobs/api',
                status: jobs.length > 0 ? 'SUCCESS' : 'FAILURE',
                resultsCount: jobs.length,
                usedFirecrawl: false
            }
        });
    } catch (e) {
        console.error("Himalayas Scrape Error:", e);
    }
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
                status: jobs.length > 0 ? 'SUCCESS' : 'FAILURE',
                resultsCount: jobs.length,
                usedFirecrawl: false
            }
        });
    } catch (e) {
        console.error("Indeed Scrape Error:", e);
    }
    
    return jobs;
}

export async function scrapeGlassdoor(keyword: string, location: string) {
    const jobs: any[] = [];
    const targetUrl = `https://www.glassdoor.com/Job/jobs.htm?sc.keyword=${encodeURIComponent(keyword)}&locT=&locId=&locKeyword=${encodeURIComponent(location)}`;

    try {
        const proxyUrl = `http://api.scrape.do?token=${process.env.SCRAPEDO_API_KEY}&super=true&url=${encodeURIComponent(targetUrl)}`;
        const res = await fetch(proxyUrl);
        const html = await res.text();
        const $ = cheerio.load(html);

        $('li[data-test="jobListing"]').each((i, el) => {
            const title = $(el).find('a[data-test="job-title"]').text().trim();
            const company = $(el).find('span.EmployerProfile_employerName__...').text().trim() || $(el).find('.job-search-8wag7x').text().trim(); // Need to handle obfuscated classes or just extract text properly
            const jobLoc = $(el).find('.job-search-12qntd3').text().trim() || $(el).find('.JobCard_location__rCz3x').text().trim();
            let url = $(el).find('a[data-test="job-title"]').attr('href');
            
            // Note: Glassdoor obfuscates classes, so we can use a more robust way to find text
            const textContent = $(el).text();
            
            // Let's use a more generic approach to find the job title and link
            const aTag = $(el).find('a[data-test="job-link"], a[data-test="job-title"], a.JobCard_jobTitle___eVHi');
            const jobTitle = aTag.text().trim() || $(el).find('.JobCard_seoLink__WdqQv').text().trim();
            let jobUrl = aTag.attr('href') || $(el).find('.JobCard_seoLink__WdqQv').attr('href');
            if (jobUrl && !jobUrl.startsWith('http')) jobUrl = 'https://www.glassdoor.com' + jobUrl;

            // Company is usually the first text element in the card before the rating
            const companyText = $(el).find('div[class*="EmployerProfile"]').text().trim() || $(el).find('span:first-child').text().trim();
            const locationText = $(el).find('div[data-test="emp-location"]').text().trim() || location;

            if (jobTitle && jobUrl) {
                jobs.push({
                    title: jobTitle,
                    company: companyText || 'Unknown Company',
                    location: locationText || location,
                    url: jobUrl.split('?')[0],
                    source: 'glassdoor'
                });
            }
        });

        // Let's also check if it's the old dom just in case
        if (jobs.length === 0) {
            const nextData = $('script#__NEXT_DATA__').html();
            if (nextData) {
                const parsed = JSON.parse(nextData);
                const results = parsed?.props?.pageProps?.searchResultQueries?.[0]?.jobResults || [];
                
                for (const job of results) {
                    jobs.push({
                        title: job.jobHeader?.jobTitleText,
                        company: job.jobHeader?.employerName,
                        location: job.jobHeader?.locationName || location,
                        url: `https://www.glassdoor.com${job.jobLink}`,
                        salary: job.jobHeader?.salaryText || null,
                        source: 'glassdoor'
                    });
                }
            }
        }
        
        await prisma.scraperLog.create({
            data: {
                scraperName: 'Glassdoor (Native)',
                targetUrl,
                status: jobs.length > 0 ? 'SUCCESS' : 'FAILURE',
                resultsCount: jobs.length,
                usedFirecrawl: false
            }
        });
    } catch (e) {
        console.error("Glassdoor Scrape Error:", e);

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
                status: jobs.length > 0 ? 'SUCCESS' : 'FAILURE',
                resultsCount: jobs.length,
                usedFirecrawl: false
            }
        }).catch(console.error);

        return jobs;
    } catch (error) {
        console.error("LinkedIn scrape error:", error);
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
                status: jobs.length > 0 ? 'SUCCESS' : 'FAILURE',
                resultsCount: jobs.length,
                usedFirecrawl: false
            }
        }).catch(console.error);

        return jobs;
    } catch (error) {
        console.error("ZipRecruiter scrape error:", error);
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
                data: { scraperName, targetUrl, status: error ? 'FAILURE' : (count > 0 ? 'SUCCESS' : 'FAILURE'), resultsCount: count, usedFirecrawl: false, errorDetails: error || null }
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
    // Arbeitsagentur (Germany) — Free public REST API, no key needed
    // -------------------------
    if (sources.arbeitsagentur) {
        const url = `https://rest.arbeitsagentur.de/jobboerse/jobsuche-service/pc/v4/jobs?was=${encodeURIComponent(keyword)}&angebotsart=1&page=1&size=25`;
        try {
            const res = await fetch(url, {
                headers: { 'X-API-Key': 'jobboerse-jobsuche', 'Accept': 'application/json' },
                signal: AbortSignal.timeout(15000)
            });
            const pageJobs: any[] = [];
            if (res.ok) {
                const data = await res.json();
                const listings = data?.stellenangebote || [];
                for (const item of listings) {
                    const refnr = item.refnr || '';
                    const jobUrl = `https://www.arbeitsagentur.de/jobsuche/jobdetail/${refnr}`;
                    const city = item.arbeitsort?.ort || '';
                    const region = item.arbeitsort?.region || '';
                    const location = [city, region, 'Germany'].filter(Boolean).join(', ');
                    const descriptionParts = [
                        item.titel || item.beruf || keyword,
                        item.arbeitgeber ? `Company: ${item.arbeitgeber}` : '',
                        item.aktuelleVeroeffentlichungsdatum ? `Posted: ${item.aktuelleVeroeffentlichungsdatum}` : '',
                        `Apply at: ${jobUrl}`
                    ].filter(Boolean);
                    pageJobs.push({
                        title: item.titel || item.beruf || keyword,
                        company: item.arbeitgeber || 'Arbeitsagentur',
                        location,
                        description: descriptionParts.join('\n'),
                        url: jobUrl,
                        source: 'Arbeitsagentur (DE)'
                    });
                }
            }
            jobs.push(...pageJobs);
            await logResult('Arbeitsagentur (DE)', url, pageJobs.length);
        } catch (e: any) {
            await logResult('Arbeitsagentur (DE)', url, 0, e.message);
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
