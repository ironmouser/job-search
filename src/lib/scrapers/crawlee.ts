import { PlaywrightCrawler } from 'crawlee';

export async function scrapeCustomPages(urls: string[]) {
    if (!urls || urls.length === 0) return [];

    const jobs: any[] = [];

    const crawler = new PlaywrightCrawler({
        maxRequestsPerCrawl: 10,
        async requestHandler({ request, page, log }) {
            log.info(`Processing ${request.url}...`);
            
            // Check domain to determine extractor
            if (request.url.includes('boards.greenhouse.io')) {
                await page.waitForSelector('.level-0', { timeout: 10000 }).catch(() => {});
                const company = await page.title();
                const jobNodes = await page.$$eval('.opening', (nodes) => {
                    return nodes.map(node => {
                        const titleEl = node.querySelector('a') as HTMLAnchorElement;
                        const locationEl = node.querySelector('.location');
                        return {
                            title: titleEl?.textContent?.trim() || 'Unknown Role',
                            company: '', 
                            location: locationEl?.textContent?.trim() || 'Unknown Location',
                            description: `Apply at: ${titleEl?.href}`,
                            url: titleEl?.href || '',
                            source: 'Greenhouse'
                        };
                    });
                });
                const companyName = company.replace('Job Board', '').trim();
                jobNodes.forEach(j => { j.company = companyName; });
                jobs.push(...jobNodes);

            } else if (request.url.includes('jobs.lever.co')) {
                await page.waitForSelector('.posting', { timeout: 10000 }).catch(() => {});
                const companyNode = await page.$('.main-header-logo img, .main-header-text');
                let companyName = 'Lever Company';
                if (companyNode) {
                    const alt = await companyNode.getAttribute('alt');
                    const text = await companyNode.textContent();
                    companyName = (alt || text || companyName).trim();
                }

                const jobNodes = await page.$$eval('.posting', (nodes) => {
                    return nodes.map(node => {
                        const titleEl = node.querySelector('h5');
                        const locationEl = node.querySelector('.sort-by-location');
                        const linkEl = node.querySelector('a.posting-title') as HTMLAnchorElement;
                        return {
                            title: titleEl?.textContent?.trim() || 'Unknown Role',
                            company: '',
                            location: locationEl?.textContent?.trim() || 'Unknown Location',
                            description: `Apply at: ${linkEl?.href}`,
                            url: linkEl?.href || '',
                            source: 'Lever'
                        };
                    });
                });
                jobNodes.forEach(j => { j.company = companyName; });
                jobs.push(...jobNodes);

            } else if (request.url.includes('jobs.ashbyhq.com')) {
                await page.waitForSelector('a[href*="/jobs/"]', { timeout: 10000 }).catch(() => {});
                const companyName = await page.title();
                
                const jobNodes = await page.$$eval('a[href*="/jobs/"]', (nodes) => {
                    return nodes.map(node => {
                        const titleEl = node.querySelector('h3');
                        const locationEl = node.querySelector('p');
                        const url = (node as HTMLAnchorElement).href;
                        return {
                            title: titleEl?.textContent?.trim() || node.textContent?.trim() || 'Unknown Role',
                            company: '',
                            location: locationEl?.textContent?.trim() || 'Unknown Location',
                            description: `Apply at: ${url}`,
                            url: url,
                            source: 'Ashby'
                        };
                    });
                });
                jobNodes.forEach(j => { j.company = companyName; });
                jobs.push(...jobNodes);

            } else if (request.url.includes('workable.com')) {
                // Workable Extractor
                await page.waitForSelector('[data-ui="job-posting"], li.job', { timeout: 10000 }).catch(() => {});
                const companyName = await page.title();
                
                const jobNodes = await page.$$eval('[data-ui="job-posting"], li.job', (nodes) => {
                    return nodes.map(node => {
                        const titleEl = node.querySelector('a, h2, h3') as HTMLAnchorElement;
                        const url = titleEl?.href || (node.querySelector('a') as HTMLAnchorElement)?.href || '';
                        return {
                            title: titleEl?.textContent?.trim() || 'Unknown Role',
                            company: '',
                            location: node.textContent?.includes('Remote') ? 'Remote' : 'Unknown Location',
                            description: `Apply at: ${url}`,
                            url: url,
                            source: 'Workable'
                        };
                    });
                });
                jobNodes.forEach(j => { j.company = companyName; });
                jobs.push(...jobNodes);

            } else if (request.url.includes('smartrecruiters.com')) {
                // SmartRecruiters Extractor
                await page.waitForSelector('li.opening-job, a.link--block', { timeout: 10000 }).catch(() => {});
                const companyName = await page.title();
                
                const jobNodes = await page.$$eval('li.opening-job, a.link--block', (nodes) => {
                    return nodes.map(node => {
                        const titleEl = node.querySelector('h4') || node;
                        const linkEl = node.tagName === 'A' ? node : node.querySelector('a');
                        const url = (linkEl as HTMLAnchorElement)?.href || '';
                        return {
                            title: titleEl?.textContent?.trim() || 'Unknown Role',
                            company: '',
                            location: 'Unknown Location',
                            description: `Apply at: ${url}`,
                            url: url,
                            source: 'SmartRecruiters'
                        };
                    });
                });
                jobNodes.forEach(j => { j.company = companyName; });
                jobs.push(...jobNodes);

            } else if (request.url.includes('breezy.hr')) {
                // Breezy HR Extractor
                await page.waitForSelector('li.position', { timeout: 10000 }).catch(() => {});
                const companyName = await page.title();
                
                const jobNodes = await page.$$eval('li.position', (nodes) => {
                    return nodes.map(node => {
                        const titleEl = node.querySelector('h2');
                        const linkEl = node.querySelector('a');
                        const url = (linkEl as HTMLAnchorElement)?.href || '';
                        const locationEl = node.querySelector('.location');
                        return {
                            title: titleEl?.textContent?.trim() || 'Unknown Role',
                            company: '',
                            location: locationEl?.textContent?.trim() || 'Unknown Location',
                            description: `Apply at: ${url}`,
                            url: url,
                            source: 'Breezy'
                        };
                    });
                });
                jobNodes.forEach(j => { j.company = companyName; });
                jobs.push(...jobNodes);
            }
        },
    });

    await crawler.run(urls);
    return jobs;
}

export async function scrapeRemoteAggregators(keyword: string, sources: any) {
    const urls: string[] = [];
    if (sources.weworkremotely) urls.push(`https://weworkremotely.com/remote-jobs/search?term=${encodeURIComponent(keyword)}`);
    if (sources.remoteco) urls.push(`https://remote.co/remote-jobs/search/?search_keywords=${encodeURIComponent(keyword)}`);
    if (sources.remoteok) urls.push(`https://remoteok.com/remote-${encodeURIComponent(keyword.replace(/\s+/g, '-'))}-jobs`);
    if (sources.workingnomads) urls.push(`https://www.workingnomads.com/jobs?category=&q=${encodeURIComponent(keyword)}`);
    if (sources.remotive) urls.push(`https://remotive.com/remote-jobs/search?query=${encodeURIComponent(keyword)}`);

    if (urls.length === 0) return [];

    const jobs: any[] = [];

    const crawler = new PlaywrightCrawler({
        maxRequestsPerCrawl: 3, // only 3 search pages max
        async requestHandler({ request, page, log }) {
            log.info(`Processing Remote Aggregator: ${request.url}...`);
            
            if (request.url.includes('weworkremotely.com')) {
                await page.waitForSelector('li:not(.view-all) > a[href^="/remote-jobs/"]', { timeout: 10000 }).catch(() => {});
                const jobNodes = await page.$$eval('li:not(.view-all) > a[href^="/remote-jobs/"]', (nodes) => {
                    return nodes.map(node => {
                        const titleEl = node.querySelector('.title');
                        const companyEl = node.querySelector('.company');
                        const url = (node as HTMLAnchorElement).href;
                        return {
                            title: titleEl?.textContent?.trim() || 'Unknown Role',
                            company: companyEl?.textContent?.trim() || 'We Work Remotely',
                            location: 'Remote',
                            description: `Apply at: ${url}`,
                            url: url,
                            source: 'WWR'
                        };
                    });
                });
                jobs.push(...jobNodes);
            } else if (request.url.includes('remote.co')) {
                await page.waitForSelector('.card, .m-0', { timeout: 10000 }).catch(() => {});
                const jobNodes = await page.$$eval('a[href*="/job/"]', (nodes) => {
                    return nodes.map(node => {
                        const titleEl = node.querySelector('p.font-weight-bold') || node;
                        const companyEl = node.querySelector('p.m-0') || node;
                        const url = (node as HTMLAnchorElement).href;
                        return {
                            title: titleEl?.textContent?.trim() || 'Unknown Role',
                            company: companyEl?.textContent?.split('|')[0]?.trim() || 'Remote.co',
                            location: 'Remote',
                            description: `Apply at: ${url}`,
                            url: url,
                            source: 'Remote.co'
                        };
                    });
                });
                jobs.push(...jobNodes);
            } else if (request.url.includes('remoteok.com')) {
                await page.waitForSelector('tr.job', { timeout: 10000 }).catch(() => {});
                const jobNodes = await page.$$eval('tr.job', (nodes) => {
                    return nodes.map(node => {
                        const titleEl = node.querySelector('h2');
                        const companyEl = node.querySelector('h3');
                        const urlAttr = (node as HTMLElement).dataset.url || '';
                        return {
                            title: titleEl?.textContent?.trim() || 'Unknown Role',
                            company: companyEl?.textContent?.trim() || 'RemoteOK Company',
                            location: 'Remote',
                            description: `Apply at: https://remoteok.com${urlAttr}`,
                            url: `https://remoteok.com${urlAttr}`,
                            source: 'RemoteOK'
                        };
                    });
                });
                jobs.push(...jobNodes);
            } else if (request.url.includes('workingnomads.com')) {
                await page.waitForSelector('.job, .job-desktop', { timeout: 10000 }).catch(() => {});
                const jobNodes = await page.$$eval('.job, .job-desktop', (nodes) => {
                    return nodes.map(node => {
                        const titleEl = node.querySelector('h4, h2');
                        const companyEl = node.querySelector('.company-name, .company');
                        const linkEl = node.querySelector('a');
                        return {
                            title: titleEl?.textContent?.trim() || 'Unknown Role',
                            company: companyEl?.textContent?.trim() || 'Working Nomads Company',
                            location: 'Remote',
                            description: `Apply at: ${linkEl?.href || ''}`,
                            url: linkEl?.href || '',
                            source: 'WorkingNomads'
                        };
                    });
                });
                jobs.push(...jobNodes);
            } else if (request.url.includes('remotive.com')) {
                await page.waitForSelector('a[href*="/remote-jobs/"]', { timeout: 10000 }).catch(() => {});
                const jobNodes = await page.$$eval('a[href*="/remote-jobs/"]', (nodes) => {
                    return nodes.map(node => {
                        const titleEl = node.textContent;
                        return {
                            title: titleEl?.trim() || 'Unknown Role',
                            company: 'Remotive Company',
                            location: 'Remote',
                            description: `Apply at: ${(node as HTMLAnchorElement).href}`,
                            url: (node as HTMLAnchorElement).href,
                            source: 'Remotive'
                        };
                    });
                });
                jobs.push(...jobNodes.filter(j => j.url && j.url.includes('-job-') && j.title.length > 5));
            }
        }
    });

    await crawler.run(urls);
    return jobs;
}
