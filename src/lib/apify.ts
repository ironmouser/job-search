import { ApifyClient } from 'apify-client';
import { supabase } from './supabase';
import { getSettings } from './settings';

// Initialize the ApifyClient with your API token
const apifyClient = new ApifyClient({
    token: process.env.APIFY_API_TOKEN,
});

export async function scrapeIndeedApify(keyword: string, location: string) {
    if (!process.env.APIFY_API_TOKEN) {
        throw new Error('APIFY_API_TOKEN is missing in environment variables.');
    }

    const actorId = 'borderline/indeed-jobs-scraper'; 
    const input = {
        query: keyword,
        location: location,
        maxItems: 15,
    };

    console.log(`Starting Apify Indeed run for ${keyword} in ${location}...`);
    const run = await apifyClient.actor(actorId).call(input);
    const { items } = await apifyClient.dataset(run.defaultDatasetId).listItems();
    console.log(`Scraped ${items.length} raw jobs from Indeed.`);
    
    // Normalize Indeed format
    return items.map((job: any) => ({
        title: job.positionName || job.title,
        company: job.company || job.companyName,
        location: job.location,
        salary_range: job.salary || null,
        description: job.descriptionText || job.description || '',
        url: job.url || job.jobUrl,
        source: 'Indeed'
    }));
}

export async function scrapeLinkedInApify(keyword: string, location: string) {
    if (!process.env.APIFY_API_TOKEN) return [];

    const actorId = 'bebity/linkedin-jobs-scraper'; 
    const input = {
        keyword: keyword,
        location: location,
        limit: 15, // Limit to keep it fast
    };

    console.log(`Starting Apify LinkedIn run for ${keyword} in ${location}...`);
    const run = await apifyClient.actor(actorId).call(input);
    const { items } = await apifyClient.dataset(run.defaultDatasetId).listItems();
    console.log(`Scraped ${items.length} raw jobs from LinkedIn.`);

    // Normalize LinkedIn format from bebity
    return items.map((job: any) => ({
        title: job.title,
        company: job.companyName,
        location: job.location,
        salary_range: null,
        description: job.description || '',
        url: job.jobUrl || job.url,
        source: 'LinkedIn'
    }));
}

export async function scrapeGlassdoorApify(keyword: string, location: string) {
    if (!process.env.APIFY_API_TOKEN) return [];
    const actorId = 'bebity/glassdoor-scraper'; 
    console.log(`Starting Apify Glassdoor run for ${keyword} in ${location}...`);
    const run = await apifyClient.actor(actorId).call({ keyword, location, limit: 15 });
    const { items } = await apifyClient.dataset(run.defaultDatasetId).listItems();
    console.log(`Scraped ${items.length} raw jobs from Glassdoor.`);
    return items.map((job: any) => ({
        title: job.jobTitle || job.title || job.header?.jobTitleText,
        company: job.companyName || job.company || job.header?.employerNameFromSearch,
        location: job.location || job.header?.locationName,
        salary_range: job.salary || job.salaryEstimate?.currencySymbol ? `${job.salaryEstimate.currencySymbol}${job.salaryEstimate.min}-${job.salaryEstimate.max}` : null,
        description: job.description || job.jobDescriptionText || '',
        url: job.jobUrl || job.url || job.header?.jobLink,
        source: 'Glassdoor'
    }));
}

export async function scrapeZipRecruiterApify(keyword: string, location: string) {
    if (!process.env.APIFY_API_TOKEN) return [];
    const actorId = 'orgupdate/ziprecruiter-jobs-scraper'; 
    console.log(`Starting Apify ZipRecruiter run for ${keyword} in ${location}...`);
    const run = await apifyClient.actor(actorId).call({ keywords: keyword, location: location, limit: 15 });
    const { items } = await apifyClient.dataset(run.defaultDatasetId).listItems();
    console.log(`Scraped ${items.length} raw jobs from ZipRecruiter.`);
    return items.map((job: any) => ({
        title: job.title || job.jobTitle,
        company: job.companyName || job.company,
        location: job.location,
        salary_range: job.salary || job.salaryText || null,
        description: job.description || job.snippet || '',
        url: job.url || job.jobUrl,
        source: 'ZipRecruiter'
    }));
}

export async function scrapeMonsterApify(keyword: string, location: string) {
    if (!process.env.APIFY_API_TOKEN) return [];
    const actorId = 'parseforge/monster-scraper'; 
    console.log(`Starting Apify Monster run for ${keyword} in ${location}...`);
    const run = await apifyClient.actor(actorId).call({ query: keyword, location: location, maxItems: 15 });
    const { items } = await apifyClient.dataset(run.defaultDatasetId).listItems();
    console.log(`Scraped ${items.length} raw jobs from Monster.`);
    return items.map((job: any) => ({
        title: job.title || job.jobTitle,
        company: job.company?.name || job.companyName || job.company,
        location: job.location?.name || job.location,
        salary_range: job.salary || null,
        description: job.description || '',
        url: job.url || job.jobUrl,
        source: 'Monster'
    }));
}

export async function scrapeWellfoundApify(keyword: string, location: string) {
    if (!process.env.APIFY_API_TOKEN) return [];
    const actorId = 'radeance/wellfound-scraper'; 
    console.log(`Starting Apify Wellfound run for ${keyword} in ${location}...`);
    const run = await apifyClient.actor(actorId).call({ keyword: keyword, location: location, maxItems: 15 });
    const { items } = await apifyClient.dataset(run.defaultDatasetId).listItems();
    console.log(`Scraped ${items.length} raw jobs from Wellfound.`);
    return items.map((job: any) => ({
        title: job.title || job.jobTitle,
        company: job.companyName || job.startup?.name,
        location: job.location || job.locationNames?.join(', '),
        salary_range: job.salary || job.compensation || null,
        description: job.description || '',
        url: job.url || job.jobUrl,
        source: 'Wellfound'
    }));
}

export async function normalizeAndSaveJobs(rawJobs: any[]) {
    if (!rawJobs || rawJobs.length === 0) return [];
    const settings = await getSettings();

    let normalizedJobs = rawJobs.map((job) => ({
        title: job.title,
        company: job.company,
        location: job.location || 'Remote',
        salary_range: job.salary_range || null,
        description: job.description || '',
        requirements: null,
        url: job.url,
        source: job.source || 'Direct',
        status: 'discovered'
    })).filter(j => j.url && j.title);

    if (settings.remoteOnly) {
        normalizedJobs = normalizedJobs.filter(j => (j.location || '').toLowerCase().includes('remote'));
    }

    // 2. Deduplication & Saving
    // We use upsert with onConflict on the 'url' column. 
    // If we've seen this URL before, ignoreDuplicates ensures we don't save it twice.
    const { data, error } = await supabase
        .from('jobs')
        .upsert(normalizedJobs, { onConflict: 'url', ignoreDuplicates: true })
        .select();

    if (error) {
        console.error('Error saving jobs to Supabase:', error);
        throw error;
    }
    
    console.log(`Successfully saved ${data?.length || 0} new jobs to Supabase.`);
    return data;
}

export async function scrapeSingleJobApify(title: string, company: string, source: string, url: string) {
    if (!process.env.APIFY_API_TOKEN) {
        throw new Error('APIFY_API_TOKEN is missing in environment variables.');
    }

    // Try Indeed first
    if (source.toLowerCase().includes('indeed') || url.toLowerCase().includes('indeed')) {
        console.log(`Falling back to Apify Indeed scraper for ${title} at ${company}...`);
        // Use borderline/indeed-jobs-scraper which accepts urls
        const actorId = 'borderline/indeed-jobs-scraper'; 
        const input = {
            urls: [url],
            maxItems: 1
        };
        const run = await apifyClient.actor(actorId).call(input);
        const { items } = await apifyClient.dataset(run.defaultDatasetId).listItems();
        if (items && items.length > 0) {
            const job: any = items[0];
            return {
                description: job.descriptionText || job.description || null,
                salary_range: job.salary || null,
                location: job.location || null,
                title: job.positionName || job.title || null,
                company: job.company || job.companyName || null,
            };
        }
    }

    // Try LinkedIn
    if (source.toLowerCase().includes('linkedin') || url.toLowerCase().includes('linkedin')) {
        console.log(`Falling back to Apify LinkedIn scraper for ${title} at ${company}...`);
        // bebity/linkedin-jobs-scraper usually expects searchUrls or keywords
        const actorId = 'bebity/linkedin-jobs-scraper'; 
        const input = {
            keyword: title,
            location: company, // Using company as location to narrow search since there's no company filter
            limit: 5,
        };
        const run = await apifyClient.actor(actorId).call(input);
        const { items } = await apifyClient.dataset(run.defaultDatasetId).listItems();
        
        // Find the one that matches our company closest
        if (items && items.length > 0) {
            let bestMatch = items.find((j: any) => j.companyName?.toLowerCase().includes(company.toLowerCase().replace(' (scraped via email)', '')));
            if (!bestMatch) bestMatch = items[0];
            return {
                description: bestMatch.description || null,
                salary_range: null,
                location: bestMatch.location || null,
                title: bestMatch.title || null,
                company: bestMatch.companyName || null,
            };
        }
    }

    return null;
}
