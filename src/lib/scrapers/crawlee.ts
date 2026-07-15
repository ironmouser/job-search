import * as cheerio from 'cheerio';

/**
 * Lightweight HTTP scraper using fetch + Cheerio.
 * Replaces PlaywrightCrawler to avoid needing Chromium on the server.
 */

import { gotScraping } from 'got-scraping';
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
                return { $: cheerio.load(res.body), usedFirecrawl: false };
            }

            console.warn(`Attempt ${attempt}: Failed to fetch ${url} (Status: ${res.statusCode})`);
            
            // If it's a 403 Forbidden (Bot Block) and we have a Firecrawl key, fallback to Firecrawl
            if (res.statusCode === 403 && process.env.FIRECRAWL_API_KEY) {
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
    const fcSites: string[] = [];

    for (const url of urls.slice(0, 10)) {
        const { $: cheerio$, usedFirecrawl } = await fetchPage(url);
        if (usedFirecrawl) fcSites.push(url);
        const $ = cheerio$;
        if (!$) continue;

        try {
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
        } catch (e: any) {
            console.warn(`Error parsing ${url}: ${e.message}`);
        }
    }

    try {
        await prisma.scraperLog.create({
            data: {
                scraperName: 'Custom Career Pages',
                status: jobs.length > 0 ? 'SUCCESS' : 'FAILURE',
                resultsCount: jobs.length,
                usedFirecrawl: fcSites.length > 0,
                firecrawlSites: fcSites
            }
        });
    } catch (dbErr) {
        console.error('Error saving scraper log:', dbErr);
    }

    return jobs;
}

export async function scrapeRemoteAggregators(keyword: string, sources: any) {
    const urls: { url: string; source: string }[] = [];
    if (sources.weworkremotely) urls.push({ url: `https://weworkremotely.com/remote-jobs/search?term=${encodeURIComponent(keyword)}`, source: 'weworkremotely' });
    if (sources.remoteco) urls.push({ url: `https://remote.co/remote-jobs/search/?search_keywords=${encodeURIComponent(keyword)}`, source: 'remoteco' });
    if (sources.remoteok) urls.push({ url: `https://remoteok.com/api?tag=${encodeURIComponent(keyword.replace(/\s+/g, '-'))}`, source: 'remoteok' });
    if (sources.workingnomads) urls.push({ url: `https://www.workingnomads.com/jobs?category=&q=${encodeURIComponent(keyword)}`, source: 'workingnomads' });
    if (sources.remotive) urls.push({ url: `https://remotive.com/remote-jobs/search?query=${encodeURIComponent(keyword)}`, source: 'remotive' });

    if (urls.length === 0) return [];

    const jobs: any[] = [];
    const fcSites: string[] = [];

    // Fetch all pages in parallel
    const results = await Promise.allSettled(
        urls.map(async ({ url, source }) => {
            if (source === 'remoteok') {
                const pageJobs: any[] = [];
                try {
                    const res = await fetch(url, {
                        headers: {
                            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                        }
                    });
                    if (res.ok) {
                        const data = await res.json();
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
                    }
                } catch (e: any) {
                    console.warn(`Error parsing remoteok API: ${e.message}`);
                }
                return pageJobs;
            }

            const { $: cheerio$, usedFirecrawl } = await fetchPage(url);
            if (usedFirecrawl) fcSites.push(url);
            const $ = cheerio$;
            if (!$) return [];

            const pageJobs: any[] = [];

            try {
                if (source === 'weworkremotely') {
                    $('li:not(.view-all) > a[href^="/remote-jobs/"]').each((_, el) => {
                        const titleEl = $(el).find('.title');
                        const companyEl = $(el).find('.company');
                        const href = $(el).attr('href') || '';
                        const fullUrl = `https://weworkremotely.com${href}`;
                        pageJobs.push({
                            title: titleEl.text().trim() || 'Unknown Role',
                            company: companyEl.text().trim() || 'We Work Remotely',
                            location: 'Remote',
                            description: `Apply at: ${fullUrl}`,
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
                } else if (source === 'workingnomads') {
                    $('.job, .job-desktop').each((_, el) => {
                        const titleEl = $(el).find('h4, h2');
                        const companyEl = $(el).find('.company-name, .company');
                        const linkEl = $(el).find('a');
                        const href = linkEl.attr('href') || '';
                        pageJobs.push({
                            title: titleEl.text().trim() || 'Unknown Role',
                            company: companyEl.text().trim() || 'Working Nomads Company',
                            location: 'Remote',
                            description: `Apply at: ${href}`,
                            url: href,
                            source: 'WorkingNomads'
                        });
                    });
                } else if (source === 'remotive') {
                    $('a[href*="/remote-jobs/"]').each((_, el) => {
                        const href = $(el).attr('href') || '';
                        const title = $(el).text().trim();
                        if (href.includes('-job-') && title.length > 5) {
                            const fullUrl = href.startsWith('http') ? href : `https://remotive.com${href}`;
                            pageJobs.push({
                                title: title,
                                company: 'Remotive Company',
                                location: 'Remote',
                                description: `Apply at: ${fullUrl}`,
                                url: fullUrl,
                                source: 'Remotive'
                            });
                        }
                    });
                }
            } catch (e: any) {
                console.warn(`Error parsing remote aggregator ${source}: ${e.message}`);
            }

            return pageJobs;
        })
    );

    for (const result of results) {
        if (result.status === 'fulfilled') {
            jobs.push(...result.value);
        }
    }

    try {
        await prisma.scraperLog.create({
            data: {
                scraperName: 'Remote Aggregators',
                status: jobs.length > 0 ? 'SUCCESS' : 'FAILURE',
                resultsCount: jobs.length,
                usedFirecrawl: fcSites.length > 0,
                firecrawlSites: fcSites
            }
        });
    } catch (dbErr) {
        console.error('Error saving scraper log:', dbErr);
    }

    return jobs;
}
