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
                } else {
                    return { $, usedFirecrawl: false };
                }
            }

            console.warn(`Attempt ${attempt}: Failed to fetch ${url} (Status: ${res.statusCode})`);
            
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
            continue;
        } catch (e: any) {
            console.warn(`Attempt ${attempt}: Error fetching ${url}: ${e.message}`);
            if (attempt === retries) return { $: null, usedFirecrawl: false };
            await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
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
        const response = await got.post('https://remotepoc.com/jm-ajax/get_listings/', {
            form: {
                search_keywords: keyword,
                per_page: 50,
                orderby: 'featured',
                order: 'DESC'
            },
            responseType: 'json',
            timeout: { request: 15000 }
        });

        const body = response.body as any;
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
                        url
                    });
                }
            });
        }
    } catch (e) {
        console.error("RemotePOC Scrape Error:", e);
    }
    
    return [{
        source: 'remotepoc',
        url: 'https://remotepoc.com/jm-ajax/get_listings/',
        jobs,
        usedFirecrawl: false
    }];
}

export async function scrapeKforce(keyword: string) {
    const jobs: any[] = [];
    try {
        const response = await got.post('https://kforcewebeast.search.windows.net/indexes/kforcewebjobentity/docs/search?api-version=2016-09-01', {
            headers: {
                'api-key': '1603E4DC4C87A8E41D6BBDE4EEA4EFB7',
                'Accept': 'application/json'
            },
            json: {
                count: true,
                select: "Industry, Title, Id, PostDate, Responsibilities, Skills, City, State, Zip, SalaryMin, SalaryMax, SalaryText, ReferenceCode, TypeCode, VisaSponsorshipJob, ApplyUrl",
                search: keyword,
                top: 25
            },
            responseType: 'json',
            timeout: { request: 15000 }
        });

        const body = response.body as any;
        if (body && body.value) {
            body.value.forEach((job: any) => {
                let location = [job.City, job.State, job.Zip].filter(Boolean).join(', ');
                if (!location) location = "Remote / US";
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
                        salary
                    });
                }
            });
        }
    } catch (e) {
        console.error("Kforce Scrape Error:", e);
    }

    return [{
        source: 'kforce',
        url: 'https://www.kforce.com/find-work/search-jobs/',
        jobs,
        usedFirecrawl: false
    }];
}
