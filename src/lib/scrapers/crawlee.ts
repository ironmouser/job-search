import * as cheerio from 'cheerio';

/**
 * Lightweight HTTP scraper using fetch + Cheerio.
 * Replaces PlaywrightCrawler to avoid needing Chromium on the server.
 */

const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
};

async function fetchPage(url: string): Promise<cheerio.CheerioAPI | null> {
    try {
        const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(15000) });
        if (!res.ok) {
            console.warn(`Failed to fetch ${url}: ${res.status}`);
            return null;
        }
        const html = await res.text();
        return cheerio.load(html);
    } catch (e: any) {
        console.warn(`Error fetching ${url}: ${e.message}`);
        return null;
    }
}

export async function scrapeCustomPages(urls: string[]) {
    if (!urls || urls.length === 0) return [];

    const jobs: any[] = [];

    for (const url of urls.slice(0, 10)) {
        const $ = await fetchPage(url);
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

    return jobs;
}

export async function scrapeRemoteAggregators(keyword: string, sources: any) {
    const urls: { url: string; source: string }[] = [];
    if (sources.weworkremotely) urls.push({ url: `https://weworkremotely.com/remote-jobs/search?term=${encodeURIComponent(keyword)}`, source: 'weworkremotely' });
    if (sources.remoteco) urls.push({ url: `https://remote.co/remote-jobs/search/?search_keywords=${encodeURIComponent(keyword)}`, source: 'remoteco' });
    if (sources.remoteok) urls.push({ url: `https://remoteok.com/remote-${encodeURIComponent(keyword.replace(/\s+/g, '-'))}-jobs`, source: 'remoteok' });
    if (sources.workingnomads) urls.push({ url: `https://www.workingnomads.com/jobs?category=&q=${encodeURIComponent(keyword)}`, source: 'workingnomads' });
    if (sources.remotive) urls.push({ url: `https://remotive.com/remote-jobs/search?query=${encodeURIComponent(keyword)}`, source: 'remotive' });

    if (urls.length === 0) return [];

    const jobs: any[] = [];

    // Fetch all pages in parallel
    const results = await Promise.allSettled(
        urls.map(async ({ url, source }) => {
            const $ = await fetchPage(url);
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
                } else if (source === 'remoteok') {
                    $('tr.job').each((_, el) => {
                        const titleEl = $(el).find('h2');
                        const companyEl = $(el).find('h3');
                        const urlAttr = $(el).data('url') || '';
                        pageJobs.push({
                            title: titleEl.text().trim() || 'Unknown Role',
                            company: companyEl.text().trim() || 'RemoteOK Company',
                            location: 'Remote',
                            description: `Apply at: https://remoteok.com${urlAttr}`,
                            url: `https://remoteok.com${urlAttr}`,
                            source: 'RemoteOK'
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

    return jobs;
}
