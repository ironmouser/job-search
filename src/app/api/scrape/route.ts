import { NextResponse } from 'next/server';
import { normalizeAndSaveJobs } from '@/lib/jobs';
import { scrapeCustomPages, scrapeRemoteAggregators, scrapeRemotePOC, scrapeHimalayas, scrapeIndeed, scrapeGlassdoor, scrapeLinkedIn, scrapeZipRecruiter, scrapeInternational, scrapeDice } from '@/lib/scrapers/crawlee';
import { getUserSettings } from '@/lib/settings';
import { prisma } from '@/lib/prisma';
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { getEffectiveTier } from '@/lib/tier';


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
        const sourceParam = body.source;

        console.log(`Received omni-scrape request for ${keyword} in ${location} for user ${userId}`);

        const globalSettings = await prisma.globalSettings.findUnique({ where: { id: 'system' } });
        const userRecord = await prisma.user.findUnique({
            where: { id: userId },
            select: { planTier: true, trialEndsAt: true, subscriptionType: true, orgAccessExpiresAt: true }
        });
        const isPro = userRecord ? getEffectiveTier(userRecord) === 'PRO' : false;
        let sources = settings.sources || { greenhouse: true, linkedin: true, remotepoc: true, remotive: true, nodesk: true };

        
        const FREE_ALLOWED_SOURCES = new Set(['greenhouse', 'linkedin', 'remotepoc', 'remotive', 'nodesk']);

        if (!isPro) {
            // Free tier users ONLY have access to greenhouse, linkedin, remotepoc, remotive, and nodesk
            for (const key of Object.keys(sources)) {
                if (!FREE_ALLOWED_SOURCES.has(key)) {
                    sources[key] = false;
                }
            }
        }

        // Force enable specified source if parameter provided
        if (sourceParam) {
            sources = { [sourceParam]: true };
        }

        // Custom career pages are Pro-only — clear them for free accounts
        const customUrls = isPro ? (settings.customCareerPages || []) : [];

        const encoder = new TextEncoder();
        const stream = new ReadableStream({
            async start(controller) {
                const sendEvent = (data: any) => {
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
                };

                try {
                    sendEvent({ type: 'status', message: `Initializing search for ${keyword}...` });

                    let totalRawJobsFound = 0;
                    const allRawJobs: any[] = [];

                    const tasks: Promise<void>[] = [];

                    const runScraperTask = async (name: string, fn: () => Promise<any[]>) => {
                        sendEvent({ type: 'status', message: `Querying ${name}...` });
                        try {
                            const res = await fn();
                            if (res && res.length > 0) {
                                allRawJobs.push(...res);
                                totalRawJobsFound += res.length;
                                sendEvent({ type: 'status', message: `Found ${res.length} jobs from ${name}` });
                            }
                        } catch (err: any) {
                            console.error(`Error in ${name} scraper:`, err);
                        }
                    };

                    if (sources.indeed) tasks.push(runScraperTask('Indeed', () => scrapeIndeed(keyword, location)));
                    if (sources.linkedin) tasks.push(runScraperTask('LinkedIn', () => scrapeLinkedIn(keyword, location)));
                    if (sources.ziprecruiter) tasks.push(runScraperTask('ZipRecruiter', () => scrapeZipRecruiter(keyword, location)));
                    if (sources.dice && isPro) tasks.push(runScraperTask('Dice', () => scrapeDice(keyword, location)));
                    if (customUrls.length > 0) tasks.push(runScraperTask('Custom Career Pages', () => scrapeCustomPages(customUrls)));
                    if (sources.weworkremotely || sources.remoteok || sources.workingnomads || sources.remotive || sources.arbeitnow || sources.ycombinator || sources.himalayas || sources.nodesk) {
                        tasks.push(runScraperTask('Remote Aggregators', () => scrapeRemoteAggregators(keyword, sources)));
                    }
                    if (sources.himalayas) {
                        tasks.push(runScraperTask('Himalayas', () => scrapeHimalayas(keyword)));
                    }
                    if (sources.remotepoc && (isPro || !globalSettings?.remotepocIsPro)) {
                        tasks.push(runScraperTask('RemotePOC', () => scrapeRemotePOC(keyword)));
                    }
                    const INTERNATIONAL_SOURCE_KEYS = ['themuse', 'computrabajo', 'jobbank', 'arbeitnow'];
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
                    const newJobsSaved = (savedJobs as any)?.newSavedCount ?? savedJobs?.length ?? 0;

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
