import { NextResponse } from 'next/server';
import { normalizeAndSaveJobs } from '@/lib/apify';
import { scrapeJSearch } from '@/lib/jsearch';
import { scrapeCustomPages, scrapeRemoteAggregators } from '@/lib/scrapers/crawlee';
import { getUserSettings } from '@/lib/settings';
import { prisma } from '@/lib/prisma';
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";

export async function POST(request: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
          return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        const userId = session.user.id;

        const body = await request.json();
        const settings: any = await getUserSettings(userId);
        
        const keyword = body.keyword || settings.searchKeyword;
        const location = body.location || settings.searchLocation;

        if (!keyword || !location) {
            return NextResponse.json({ error: 'Missing keyword or location in request body and settings.' }, { status: 400 });
        }

        console.log(`Received omni-scrape request for ${keyword} in ${location} for user ${userId}`);

        const globalSettings = await prisma.globalSettings.findUnique({ where: { id: 'system' } });
        const isPro = (session.user as any).planTier === 'PRO';
        let sources = settings.sources || { indeed: true, linkedin: false, greenhouse: true, lever: true, ashby: true, glassdoor: false, ziprecruiter: false, monster: false, wellfound: false };
        
        if (!isPro && globalSettings) {
            if (globalSettings.jsearchIsPro) {
                sources.jsearch = false;
                sources.indeed = false;
                sources.linkedin = false;
                sources.glassdoor = false;
                sources.ziprecruiter = false;
                sources.monster = false;
                sources.wellfound = false;
            }
            if (globalSettings.greenhouseIsPro) sources.greenhouse = false;
            if (globalSettings.leverIsPro) sources.lever = false;
            if (globalSettings.ashbyIsPro) sources.ashby = false;
            if (globalSettings.workableIsPro) sources.workable = false;
            if (globalSettings.smartrecruitersIsPro) sources.smartrecruiters = false;
            if (globalSettings.breezyIsPro) sources.breezy = false;
            if (globalSettings.remotiveIsPro) sources.remotive = false;
            if (globalSettings.weworkremotelyIsPro) sources.weworkremotely = false;
            if (globalSettings.remotecoIsPro) sources.remoteco = false;
            if (globalSettings.remoteokIsPro) sources.remoteok = false;
            if (globalSettings.workingnomadsIsPro) sources.workingnomads = false;
        }

        const customUrls = settings.customCareerPages || [];

        const scrapePromises: Promise<any[]>[] = [];

        if (sources.jsearch || sources.indeed || sources.linkedin || sources.glassdoor || sources.ziprecruiter || sources.monster || sources.wellfound) {
            scrapePromises.push(scrapeJSearch(keyword, location).catch(e => {
                console.error("JSearch scrape failed", e);
                return [];
            }));
        }

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

        if (sources.weworkremotely || sources.remoteco || sources.remoteok || sources.workingnomads || sources.remotive) {
            scrapePromises.push(scrapeRemoteAggregators(keyword, sources).catch(e => {
                console.error("Crawlee remote aggregators scrape failed", e);
                return [];
            }));
        }

        const results = await Promise.all(scrapePromises);
        const rawJobs = results.flat();

        if (!rawJobs || rawJobs.length === 0) {
             return NextResponse.json({ message: 'No jobs found for the given criteria across active sources.' }, { status: 200 });
        }

        const savedJobs = await normalizeAndSaveJobs(rawJobs, userId);

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
