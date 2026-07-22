import { NextResponse } from 'next/server';
import { normalizeAndSaveJobs } from '@/lib/jobs';
import { scrapeCustomPages, scrapeRemoteAggregators, scrapeRemotePOC, scrapeHimalayas, scrapeIndeed, scrapeGlassdoor, scrapeLinkedIn, scrapeZipRecruiter, scrapeInternational } from '@/lib/scrapers/crawlee';
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
        let sources = settings.sources || { indeed: true, linkedin: true, greenhouse: true, lever: true, ashby: true, glassdoor: false, ziprecruiter: true, monster: false, wellfound: false, remotepoc: true, himalayas: true, arbeitnow: true, ycombinator: true, otta: true, jobspresso: true, justremote: true };
        
        if (!isPro && globalSettings) {
            // Standard job boards are Pro-only by default
            sources.indeed = false;
            sources.linkedin = false;
            sources.glassdoor = false;
            sources.ziprecruiter = false;
            sources.monster = false;
            sources.wellfound = false;
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
            if (globalSettings.arbeitnowIsPro) sources.arbeitnow = false;
            if (globalSettings.ycombinatorIsPro) sources.ycombinator = false;
            if (globalSettings.himalayasIsPro) sources.himalayas = false;
            if (globalSettings.ottaIsPro) sources.otta = false;
            if (globalSettings.jobspressoIsPro) sources.jobspresso = false;
            if (globalSettings.justremoteIsPro) sources.justremote = false;
        }

        const INTERNATIONAL_SOURCES = ['eures', 'computrabajo', 'bumeran', 'jobbank', 'workopolis', 'workana'];

        if (!isPro) {
            // Block international sources for free users
            for (const src of INTERNATIONAL_SOURCES) {
                sources[src] = false;
            }
        }

        // Custom career pages are Pro-only — clear them for free accounts
        const customUrls = isPro ? (settings.customCareerPages || []) : [];


        const scrapePromises: Promise<any[]>[] = [];

        if (sources.indeed) {
            scrapePromises.push(scrapeIndeed(keyword, location).catch(e => {
                console.error("Indeed native scrape failed", e);
                return [];
            }));
        }

        if (sources.glassdoor) {
            scrapePromises.push(scrapeGlassdoor(keyword, location).catch(e => {
                console.error("Glassdoor native scrape failed", e);
                return [];
            }));
        }

        if (sources.himalayas) {
            scrapePromises.push(scrapeHimalayas(keyword).catch(e => {
                console.error("Himalayas scrape failed", e);
                return [];
            }));
        }

        if (sources.linkedin) {
            scrapePromises.push(scrapeLinkedIn(keyword, location).catch(e => {
                console.error("LinkedIn scrape failed", e);
                return [];
            }));
        }

        if (sources.ziprecruiter) {
            scrapePromises.push(scrapeZipRecruiter(keyword, location).catch(e => {
                console.error("ZipRecruiter scrape failed", e);
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

        if (sources.weworkremotely || sources.remoteco || sources.remoteok || sources.workingnomads || sources.remotive || sources.arbeitnow || sources.ycombinator || sources.otta || sources.jobspresso || sources.justremote) {
            scrapePromises.push(scrapeRemoteAggregators(keyword, sources).catch(e => {
                console.error("Crawlee remote aggregators scrape failed", e);
                return [];
            }));
        }

        if (sources.remotepoc) {
            if (isPro || !globalSettings?.remotepocIsPro) {
                scrapePromises.push(scrapeRemotePOC(keyword).catch(e => {
                    console.error("Crawlee RemotePOC scrape failed", e);
                    return [];
                }));
            }
        }


        const INTERNATIONAL_SOURCE_KEYS = ['arbeitsagentur', 'themuse', 'computrabajo', 'jobbank'];
        if (isPro && INTERNATIONAL_SOURCE_KEYS.some(s => sources[s])) {
            scrapePromises.push(scrapeInternational(keyword, sources).catch(e => {
                console.error('International scrape failed', e);
                return [];
            }));
        }

        const results = await Promise.all(scrapePromises);
        let rawJobs = results.flat();

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
