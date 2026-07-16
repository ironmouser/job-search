import { prisma } from './prisma';

export async function scrapeJSearch(keyword: string, location: string) {
    if (!process.env.RAPIDAPI_KEY) {
        throw new Error('RAPIDAPI_KEY is missing in environment variables.');
    }

    const cacheKey = { source: 'JSearch', keyword, location };
    try {
        const cached = await prisma.scrapeCache.findUnique({
            where: { source_keyword_location: cacheKey }
        });
        if (cached && cached.expiresAt > new Date()) {
            console.log(`Cache hit for JSearch: ${keyword} in ${location}`);
            const cachedJobs = cached.rawJobs as any[];
            try {
                await prisma.scraperLog.create({
                    data: {
                        scraperName: 'JSearch (Cached)',
                        targetUrl: 'https://jsearch.p.rapidapi.com/search-v2',
                        status: 'SUCCESS',
                        resultsCount: cachedJobs.length,
                        usedFirecrawl: false,
                        firecrawlSites: [],
                        errorDetails: null
                    }
                });
            } catch (e) {}
            return cachedJobs;
        }
    } catch (e) {
        console.warn('Cache check failed:', e);
    }

    const url = new URL('https://jsearch.p.rapidapi.com/search-v2');
    url.searchParams.append('query', `${keyword} in ${location}`);

    console.log(`Starting JSearch run for ${keyword} in ${location}...`);
    
    let response;
    try {
        response = await fetch(url.toString(), {
            method: 'GET',
            headers: {
                'X-RapidAPI-Key': process.env.RAPIDAPI_KEY,
                'X-RapidAPI-Host': 'jsearch.p.rapidapi.com'
            }
        });
    } catch (err: any) {
        try {
            await prisma.scraperLog.create({
                data: {
                    scraperName: 'JSearch',
                    targetUrl: 'https://jsearch.p.rapidapi.com/search-v2',
                    status: 'FAILURE',
                    resultsCount: 0,
                    usedFirecrawl: false,
                    firecrawlSites: [],
                    errorDetails: err.message
                }
            });
        } catch (e) {}
        throw err;
    }

    if (!response.ok) {
        const errorText = await response.text();
        try {
            await prisma.scraperLog.create({
                data: {
                    scraperName: 'JSearch',
                    targetUrl: 'https://jsearch.p.rapidapi.com/search-v2',
                    status: 'FAILURE',
                    resultsCount: 0,
                    usedFirecrawl: false,
                    firecrawlSites: [],
                    errorDetails: `HTTP ${response.status}: ${errorText}`
                }
            });
        } catch (e) {}
        throw new Error(`JSearch API returned ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    const items = Array.isArray(data.data) ? data.data : (data.data?.jobs || []);
    console.log(`Scraped ${items.length} raw jobs from JSearch.`);
    
    // Normalize JSearch format
    const rawJobs = items.map((job: any) => ({
        title: job.job_title,
        company: job.employer_name,
        location: `${job.job_city ? job.job_city + ', ' : ''}${job.job_state ? job.job_state + ', ' : ''}${job.job_country || ''}`.trim().replace(/,\s*$/, '') || 'Remote',
        salary_range: job.job_min_salary && job.job_max_salary ? `$${job.job_min_salary} - $${job.job_max_salary}` : null,
        description: job.job_description || '',
        url: job.job_apply_link || job.job_google_link,
        source: job.job_publisher || 'JSearch'
    }));

    try {
        await prisma.scrapeCache.upsert({
            where: { source_keyword_location: cacheKey },
            update: { rawJobs, expiresAt: new Date(Date.now() + 60 * 60 * 1000) },
            create: { ...cacheKey, rawJobs, expiresAt: new Date(Date.now() + 60 * 60 * 1000) }
        });
    } catch (e) {
        console.warn('Failed to save JSearch cache:', e);
    }
    
    try {
        await prisma.scraperLog.create({
            data: {
                scraperName: 'JSearch',
                targetUrl: 'https://jsearch.p.rapidapi.com/search-v2',
                status: 'SUCCESS',
                resultsCount: rawJobs.length,
                usedFirecrawl: false,
                firecrawlSites: [],
                errorDetails: null
            }
        });
    } catch (e) {}

    return rawJobs;
}

export async function fetchSingleJobJSearch(title: string, company: string) {
    if (!process.env.RAPIDAPI_KEY) {
        return null;
    }

    const url = new URL('https://jsearch.p.rapidapi.com/search-v2');
    url.searchParams.append('query', `${title} at ${company}`);

    console.log(`Starting JSearch fallback run for ${title} at ${company}...`);
    
    try {
        const response = await fetch(url.toString(), {
            method: 'GET',
            headers: {
                'X-RapidAPI-Key': process.env.RAPIDAPI_KEY,
                'X-RapidAPI-Host': 'jsearch.p.rapidapi.com'
            }
        });

        if (!response.ok) {
            return null;
        }

        const data = await response.json();
        const items = Array.isArray(data.data) ? data.data : (data.data?.jobs || []);
        
        if (items.length > 0) {
            const bestMatch = items[0]; // Assuming the first result is the best match
            return {
                description: bestMatch.job_description || null,
                salary_range: bestMatch.job_min_salary && bestMatch.job_max_salary ? `$${bestMatch.job_min_salary} - $${bestMatch.job_max_salary}` : null,
                location: `${bestMatch.job_city ? bestMatch.job_city + ', ' : ''}${bestMatch.job_state ? bestMatch.job_state + ', ' : ''}${bestMatch.job_country || ''}`.trim().replace(/,\s*$/, '') || null,
                title: bestMatch.job_title || null,
                company: bestMatch.employer_name || null,
            };
        }
    } catch (e) {
        console.error("JSearch fallback error:", e);
    }
    
    return null;
}
