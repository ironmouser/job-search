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
            // Fallback to Scrape.do or Firecrawl for any block or non-200 status
            if (process.env.SCRAPEDO_API_KEY) {
                console.info(`Falling back to Scrape.do for ${url}`);
                try {
                    const scrapeDoUrl = `http://api.scrape.do?token=${process.env.SCRAPEDO_API_KEY}&url=${encodeURIComponent(url)}`;
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
            
            if (process.env.FIRECRAWL_API_KEY && !process.env.SCRAPEDO_API_KEY) {
                console.info(`Falling back to Firecrawl for ${url}`);
                try {
                    const fcRes = await fetch('https://api.firecrawl.dev/v1/scrape', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${process.env.FIRECRAWL_API_KEY}`
                        },
                        body: JSON.stringify({ url, formats: ['html'] })
                    });
                    
                    if (fcRes.ok) {
                        const fcData = await fcRes.json();
                        if (fcData.success && fcData.data && fcData.data.html) {
                            return { $: cheerio.load(fcData.data.html), usedFirecrawl: true };
                        }
                    }
                    console.warn(`Firecrawl fallback failed for ${url}`);
                } catch (fcErr: any) {
                    console.warn(`Firecrawl fallback error for ${url}: ${fcErr.message}`);
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
                    status: 'SUCCESS',
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
    if (sources.workingnomads) urls.push({ url: `https://www.workingnomads.com/jobs?category=&q=${encodeURIComponent(keyword)}`, source: 'workingnomads' });
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
                    let res = await gotScraping({ url, responseType: 'json', throwHttpErrors: false });
                    if ((res.statusCode < 200 || res.statusCode >= 300) && process.env.SCRAPEDO_API_KEY) {
                        const scrapeDoUrl = `http://api.scrape.do?token=${process.env.SCRAPEDO_API_KEY}&url=${encodeURIComponent(url)}`;
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
                        const scrapeDoUrl = `http://api.scrape.do?token=${process.env.SCRAPEDO_API_KEY}&url=${encodeURIComponent(url)}`;
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
                                        description: `Apply at: ${job.url}`,
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
                } else if (source === 'workingnomads') {
                    $('.job, .job-desktop').each((_, el) => {
                        const titleEl = $(el).find('h4, h2');
                        const companyEl = $(el).find('.company-name, .company');
                        const linkEl = $(el).find('a');
                        const href = linkEl.attr('href') || '';
                        pageJobs.push({
                            title: titleEl.text().trim() || 'Unknown Role',
                            company: companyEl.text().trim() || 'Working Nomads',
                            location: 'Remote',
                            description: `Apply at: ${href}`,
                            url: href,
                            source: 'WorkingNomads'
                        });
                    });

                    const batchSize = 3;
                    for (let i = 0; i < pageJobs.length; i += batchSize) {
                        const batch = pageJobs.slice(i, i + batchSize);
                        await Promise.all(batch.map(async (job) => {
                            if (!job.url.startsWith('http')) return;
                            try {
                                const { $ } = await fetchPage(job.url, 1);
                                if ($) {
                                    const desc = $('#job-description, .job-description, .job-details-content').text().trim();
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
                        status: data.error ? 'FAILURE' : (data.jobs.length > 0 ? 'SUCCESS' : 'SUCCESS'),
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
                status: 'SUCCESS',
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
                
                let url = job.ApplyUrl;
                if (!url && job.ReferenceCode) {
                    url = `https://www.kforce.com/jobs/${job.ReferenceCode}/`;
                } else if (!url) {
                    url = `https://www.kforce.com/find-work/search-jobs/`;
                }
                
                const salary = job.SalaryText || (job.SalaryMin ? `$${job.SalaryMin}-$${job.SalaryMax}` : undefined);
                
                if (job.Title && url && job.Title !== 'Unknown Role') {
                    jobs.push({
                        title: job.Title,
                        company: "Kforce",
                        location,
                        url,
                        salary,
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
                status: 'SUCCESS',
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
                status: 'SUCCESS',
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
    let usedFirecrawl = false;

    try {
        const { $, usedFirecrawl: usedFc } = await fetchPage(targetUrl, 1);
        usedFirecrawl = usedFc;
        
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
                usedFirecrawl
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
    let usedFirecrawl = false;

    try {
        const { $, usedFirecrawl: usedFc } = await fetchPage(targetUrl, 1);
        usedFirecrawl = usedFc;
        
        if ($) {
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
                usedFirecrawl
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
