import { NextResponse } from 'next/server';
import { normalizeAndSaveJobs } from '@/lib/apify';
import { scrapeJSearch } from '@/lib/jsearch';
import { scrapeCustomPages, scrapeRemoteAggregators } from '@/lib/scrapers/crawlee';
import { getSettings } from '@/lib/settings';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const settings = await getSettings();
        
        const keyword = body.keyword || settings.searchKeyword;
        const location = body.location || settings.searchLocation;

        if (!keyword || !location) {
            return NextResponse.json({ error: 'Missing keyword or location in request body and settings.' }, { status: 400 });
        }

        console.log(`Received omni-scrape request for ${keyword} in ${location}`);

        const sources = settings.sources || { indeed: true, linkedin: false, greenhouse: true, lever: true, ashby: true, glassdoor: false, ziprecruiter: false, monster: false, wellfound: false };
        const customUrls = settings.customCareerPages || [];

        // Parallel scraping promises
        const scrapePromises: Promise<any[]>[] = [];

        // 1. JSearch (Aggregates Indeed, LinkedIn, Glassdoor, ZipRecruiter)
        if (sources.jsearch || sources.indeed || sources.linkedin || sources.glassdoor || sources.ziprecruiter || sources.monster || sources.wellfound) {
            scrapePromises.push(scrapeJSearch(keyword, location).catch(e => {
                console.error("JSearch scrape failed", e);
                return [];
            }));
        }

        // 4. Open Source Crawlee (Greenhouse, Lever, Ashby, Workable, SmartRecruiters, Breezy)
        const urlsToCrawl = customUrls.filter((url: string) => {
            if (url.includes('greenhouse.io') && sources.greenhouse) return true;
            if (url.includes('lever.co') && sources.lever) return true;
            if (url.includes('ashbyhq.com') && sources.ashby) return true;
            if (url.includes('workable.com') && sources.workable) return true;
            if (url.includes('smartrecruiters.com') && sources.smartrecruiters) return true;
            if (url.includes('breezy.hr') && sources.breezy) return true;
            return false;
        });

        if (urlsToCrawl.length > 0) {
            scrapePromises.push(scrapeCustomPages(urlsToCrawl).catch(e => {
                console.error("Crawlee custom page scrape failed", e);
                return [];
            }));
        }

        // 5. Open Source Crawlee Remote Aggregators
        if (sources.weworkremotely || sources.remoteco || sources.remoteok || sources.workingnomads || sources.remotive) {
            scrapePromises.push(scrapeRemoteAggregators(keyword, sources).catch(e => {
                console.error("Crawlee remote aggregators scrape failed", e);
                return [];
            }));
        }

        // Await all scrapers
        const results = await Promise.all(scrapePromises);
        
        // Flatten array of arrays
        const rawJobs = results.flat();

        if (!rawJobs || rawJobs.length === 0) {
             return NextResponse.json({ message: 'No jobs found for the given criteria across active sources.' }, { status: 200 });
        }

        // Normalize and save to Supabase
        const savedJobs = await normalizeAndSaveJobs(rawJobs);

        return NextResponse.json({ 
            message: 'Omni-Scraping and normalization complete.', 
            raw_jobs_found: rawJobs.length,
            new_jobs_saved: savedJobs?.length || 0,
            jobs: savedJobs
        }, { status: 200 });

    } catch (error: any) {
        console.error('Scrape API Error:', error);
        return NextResponse.json({ error: error.message || 'An error occurred during scraping.' }, { status: 500 });
    }
}
