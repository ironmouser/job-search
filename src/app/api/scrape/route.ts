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

        const body = await request.json().catch(() => ({}));
        const settings: any = await getUserSettings(userId);
        
        const keyword = body.keyword || settings.searchKeyword || 'Software Engineer';
        const location = body.location || settings.searchLocation || 'Remote';

        console.log(`Received omni-scrape request for ${keyword} in ${location} for user ${userId}`);

        const globalSettings = await prisma.globalSettings.findUnique({ where: { id: 'system' } });
        const isPro = (session.user as any).planTier === 'PRO';
        let sources = settings.sources || { indeed: true, glassdoor: true, ziprecruiter: true, weworkremotely: true, remoteco: true, remoteok: true, workingnomads: true, remotive: true, remotepoc: true, arbeitnow: true, ycombinator: true, linkedin: true, greenhouse: true, lever: true, ashby: true, himalayas: true, otta: true, jobspresso: true, justremote: true };
        
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


        const encoder = new TextEncoder();
        const stream = new ReadableStream({
            async start(controller) {
                const sendEvent = (data: any) => {
                    try {
                        controller.enqueue(encoder.encode(JSON.stringify(data) + '\n'));
                    } catch (e) {}
                };

                try {
                    sendEvent({ type: 'progress', foundCount: 0, message: 'Initiating Omni-Scrape across job boards...' });

                    let totalRawJobsFound = 0;
                    const allRawJobs: any[] = [];

                    const runScraperTask = async (sourceName: string, fn: () => Promise<any[]>) => {
                        try {
                            const jobs = await fn();
                            if (Array.isArray(jobs) && jobs.length > 0) {
                                allRawJobs.push(...jobs);
                                totalRawJobsFound += jobs.length;
                                sendEvent({
                                    type: 'progress',
                                    source: sourceName,
                                    foundCount: totalRawJobsFound,
                                    message: `Discovered ${jobs.length} job${jobs.length === 1 ? '' : 's'} from ${sourceName} (${totalRawJobsFound} total)...`
                                });
                            } else {
                                sendEvent({
                                    type: 'progress',
                                    source: sourceName,
                                    foundCount: totalRawJobsFound,
                                    message: `Scanned ${sourceName} (${totalRawJobsFound} total found so far)...`
                                });
                            }
                        } catch (e) {
                            console.error(`${sourceName} scrape failed`, e);
                        }
                    };

                    const tasks: Promise<void>[] = [];
                    if (sources.indeed) tasks.push(runScraperTask('Indeed', () => scrapeIndeed(keyword, location)));
                    if (sources.glassdoor) tasks.push(runScraperTask('Glassdoor', () => scrapeGlassdoor(keyword, location)));
                    if (sources.himalayas) tasks.push(runScraperTask('Himalayas', () => scrapeHimalayas(keyword)));
                    if (sources.linkedin) tasks.push(runScraperTask('LinkedIn', () => scrapeLinkedIn(keyword, location)));
                    if (sources.ziprecruiter) tasks.push(runScraperTask('ZipRecruiter', () => scrapeZipRecruiter(keyword, location)));
                    if (customUrls.length > 0) tasks.push(runScraperTask('Custom Career Pages', () => scrapeCustomPages(customUrls)));
                    if (sources.weworkremotely || sources.remoteco || sources.remoteok || sources.workingnomads || sources.remotive || sources.arbeitnow || sources.ycombinator || sources.otta || sources.jobspresso || sources.justremote) {
                        tasks.push(runScraperTask('Remote Aggregators', () => scrapeRemoteAggregators(keyword, sources)));
                    }
                    if (sources.remotepoc && (isPro || !globalSettings?.remotepocIsPro)) {
                        tasks.push(runScraperTask('RemotePOC', () => scrapeRemotePOC(keyword)));
                    }
                    const INTERNATIONAL_SOURCE_KEYS = ['arbeitsagentur', 'themuse', 'computrabajo', 'jobbank'];
                    if (isPro && INTERNATIONAL_SOURCE_KEYS.some((s: string) => sources[s])) {
                        tasks.push(runScraperTask('International Boards', () => scrapeInternational(keyword, sources)));
                    }

                    const timeoutPromise = new Promise<void>((resolve) => setTimeout(resolve, 15000));
                    await Promise.race([Promise.all(tasks), timeoutPromise]);

                    if (allRawJobs.length === 0) {
                        sendEvent({
                            type: 'complete',
                            foundCount: 0,
                            raw_jobs_found: 0,
                            new_jobs_saved: 0,
                            message: 'No jobs found for the given criteria across active sources.'
                        });
                        return;
                    }

                    sendEvent({
                        type: 'progress',
                        foundCount: totalRawJobsFound,
                        message: `Saving and normalizing ${totalRawJobsFound} discovered jobs...`
                    });

                    const savedJobs = await normalizeAndSaveJobs(allRawJobs, userId, {
                        onProgress: (count, message) => {
                            sendEvent({ type: 'normalization', foundCount: count, message });
                        }
                    });
                    const newJobsSaved = savedJobs?.length || 0;

                    sendEvent({
                        type: 'complete',
                        foundCount: totalRawJobsFound,
                        raw_jobs_found: totalRawJobsFound,
                        new_jobs_saved: newJobsSaved,
                        jobs: savedJobs,
                        message: `Scraping complete! Added ${newJobsSaved} new jobs.`
                    });
                } catch (err: any) {
                    console.error('Omni-Scrape stream error:', err);
                    sendEvent({ type: 'error', error: err.message || 'An error occurred during scraping.' });
                } finally {
                    try {
                        controller.close();
                    } catch (e) {}
                }
            }
        });

        return new Response(stream, {
            headers: {
                'Content-Type': 'application/x-ndjson',
                'Cache-Control': 'no-cache, no-transform',
                'Connection': 'keep-alive'
            }
        });

    } catch (error: any) {
        console.error('Scrape API Error:', error);
        return NextResponse.json({ error: error.message || 'An error occurred during scraping.' }, { status: 500 });
    }
}
