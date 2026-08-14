import { NextResponse } from 'next/server';
import { normalizeAndSaveJobs } from '@/lib/jobs';
import { scrapeCustomPages, scrapeRemoteAggregators, scrapeRemotePOC, scrapeHimalayas, scrapeJobicy, scrapeJobspresso, scrapeIndeed, scrapeGlassdoor, scrapeLinkedIn, scrapeZipRecruiter, scrapeInternational, scrapeDice } from '@/lib/scrapers/crawlee';
import { getUserSettings, DEFAULT_PRO_SOURCES } from '@/lib/settings';
import { prisma } from '@/lib/prisma';
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { getEffectiveTier } from '@/lib/tier';


import { isUsLocation, isRemoteLocation, extractStateAbbr, isOutsideUsLocation } from '@/lib/locationUtils';

export async function POST(request: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
          return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        const userId = session.user.id;

        // Log job sync execution run
        try {
          await prisma.syncLog.create({
            data: {
              userId,
              syncType: `job_run_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
              lastSyncedAt: new Date(),
            },
          });
        } catch (e) {
          console.warn('Failed to log job sync run:', e);
        }

        const body = await request.json().catch(() => ({}));
        const settings: any = await getUserSettings(userId);
        
        const keyword = body.keyword || settings.searchKeyword || 'Software Engineer';
        const location = body.location || settings.searchLocation || 'Remote';
        const remoteOnlyOverride = typeof body.remoteOnly === 'boolean' ? body.remoteOnly : undefined;
        const noInternationalOverride = typeof body.noInternational === 'boolean' ? body.noInternational : undefined;
        const sourceParam = body.source;

        console.log(`Received omni-scrape request for "${keyword}" in "${location}" (remoteOnly: ${remoteOnlyOverride ?? settings.remoteOnly ?? false}) for user ${userId}`);

        const globalSettings = await prisma.globalSettings.findUnique({ where: { id: 'system' } });
        const userRecord = await prisma.user.findUnique({
            where: { id: userId },
            select: { planTier: true, trialEndsAt: true, subscriptionType: true, orgAccessExpiresAt: true }
        });
        const isPro = userRecord ? getEffectiveTier(userRecord) === 'PRO' : false;
        let sources = settings.sources ? { ...settings.sources } : (isPro ? { ...DEFAULT_PRO_SOURCES } : { greenhouse: true, weworkremotely: true, remotive: true, nodesk: true, himalayas: true, jobicy: true, jobspresso: true });

        const FREE_ALLOWED_SOURCES = new Set(['greenhouse', 'weworkremotely', 'remotive', 'nodesk', 'himalayas', 'jobicy', 'jobspresso']);

        if (!isPro) {
            // Free tier users ONLY have access to approved free sources
            for (const key of Object.keys(sources)) {
                if (!FREE_ALLOWED_SOURCES.has(key)) {
                    sources[key] = false;
                }
            }
        } else {
            // Ensure any un-configured Pro sources use DEFAULT_PRO_SOURCES
            for (const [key, defaultVal] of Object.entries(DEFAULT_PRO_SOURCES)) {
                if (sources[key] === undefined) {
                    sources[key] = defaultVal;
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

                    // DB-First Instant Matching: Pull recent matching jobs from global database pool
                    try {
                        const dbFirstJobs = await prisma.job.findMany({
                            where: {
                                createdAt: { gte: new Date(Date.now() - 48 * 60 * 60 * 1000) },
                                OR: [
                                    { title: { contains: keyword, mode: 'insensitive' } },
                                    { description: { contains: keyword, mode: 'insensitive' } }
                                ]
                            },
                            take: 100
                        });
                        if (dbFirstJobs.length > 0) {
                            allRawJobs.push(...dbFirstJobs);
                            totalRawJobsFound += dbFirstJobs.length;
                            sendEvent({ type: 'status', message: `Found ${dbFirstJobs.length} instant matching roles in global database pool!` });
                        }
                    } catch (dbErr: any) {
                        console.warn(`[DB-First Pre-Check Warning]: ${dbErr.message}`);
                    }

                    const tasks: Promise<void>[] = [];

                    const runScraperTask = async (name: string, fn: () => Promise<any[]>, timeoutMs = 25000) => {
                        sendEvent({ type: 'status', message: `Querying ${name}...` });
                        let timerId: NodeJS.Timeout | null = null;
                        try {
                            const timeoutPromise = new Promise<any[]>((_, reject) => {
                                timerId = setTimeout(() => reject(new Error(`${name} scraper timed out after ${timeoutMs}ms`)), timeoutMs);
                            });
                            const res = await Promise.race([fn(), timeoutPromise]);
                            if (res && res.length > 0) {
                                allRawJobs.push(...res);
                                totalRawJobsFound += res.length;
                                sendEvent({ type: 'status', message: `Found ${res.length} jobs from ${name}` });
                            }
                        } catch (err: any) {
                            console.warn(`Scraper task [${name}] issue: ${err.message}`);
                        } finally {
                            if (timerId) clearTimeout(timerId);
                        }
                    };

                    // Determine locations to query across location-aware job boards
                    const hasState = extractStateAbbr(location) !== null;
                    const isGenericRemote = isRemoteLocation(location) && !hasState;
                    const isOutsideUs = isOutsideUsLocation(location);

                    let locationList: string[];
                    if (isGenericRemote) {
                        locationList = ['Remote'];
                    } else if (isOutsideUs) {
                        locationList = [location];
                    } else if (isUsLocation(location) || hasState) {
                        // For US city/state searches (e.g. "Austin, TX"), query both the local target and broad US Remote
                        const cleanLocal = location.replace(/remote/i, '').replace(/^[\s,]+|[\s,]+$/g, '').trim() || location;
                        locationList = Array.from(new Set([cleanLocal, 'Remote']));
                    } else {
                        locationList = [location];
                    }

                    if (sources.indeed) {
                        for (const loc of locationList) {
                            tasks.push(runScraperTask(locationList.length > 1 ? `Indeed (${loc})` : 'Indeed', () => scrapeIndeed(keyword, loc), 25000));
                        }
                    }
                    if (sources.linkedin) {
                        for (const loc of locationList) {
                            tasks.push(runScraperTask(locationList.length > 1 ? `LinkedIn (${loc})` : 'LinkedIn', () => scrapeLinkedIn(keyword, loc), 25000));
                        }
                    }
                    if (sources.ziprecruiter) {
                        for (const loc of locationList) {
                            tasks.push(runScraperTask(locationList.length > 1 ? `ZipRecruiter (${loc})` : 'ZipRecruiter', () => scrapeZipRecruiter(keyword, loc), 25000));
                        }
                    }
                    if (sources.dice && isPro) {
                        for (const loc of locationList) {
                            tasks.push(runScraperTask(locationList.length > 1 ? `Dice (${loc})` : 'Dice', () => scrapeDice(keyword, loc), 25000));
                        }
                    }
                    if (customUrls.length > 0) tasks.push(runScraperTask('Custom Career Pages', () => scrapeCustomPages(customUrls), 25000));
                    if (sources.weworkremotely || sources.remoteok || sources.workingnomads || sources.remotive || sources.arbeitnow || sources.ycombinator || sources.nodesk) {
                        tasks.push(runScraperTask('Remote Aggregators', () => scrapeRemoteAggregators(keyword, sources), 15000));
                    }
                    if (sources.himalayas) {
                        tasks.push(runScraperTask('Himalayas', () => scrapeHimalayas(keyword), 10000));
                    }
                    if (sources.jobicy) {
                        tasks.push(runScraperTask('Jobicy', () => scrapeJobicy(keyword), 10000));
                    }
                    if (sources.jobspresso) {
                        tasks.push(runScraperTask('Jobspresso', () => scrapeJobspresso(keyword), 10000));
                    }
                    if (sources.remotepoc && (isPro || !globalSettings?.remotepocIsPro)) {
                        tasks.push(runScraperTask('RemotePOC', () => scrapeRemotePOC(keyword), 12000));
                    }
                    const INTERNATIONAL_SOURCE_KEYS = ['themuse', 'computrabajo', 'jobbank', 'arbeitnow'];
                    if (isPro && INTERNATIONAL_SOURCE_KEYS.some((s: string) => sources[s])) {
                        tasks.push(runScraperTask('International Boards', () => scrapeInternational(keyword, sources), 25000));
                    }

                    await Promise.allSettled(tasks);

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
                        message: `Refining ${totalRawJobsFound} discovered job listings...`
                    });

                    const savedJobs = await normalizeAndSaveJobs(allRawJobs, userId, {
                        searchKeyword: keyword,
                        searchLocation: location,
                        remoteOnly: remoteOnlyOverride,
                        noInternational: noInternationalOverride,
                        onProgress: (count, message) => {
                            sendEvent({ type: 'normalization', foundCount: count, message });
                        }
                    });
                    const newJobsSaved = (typeof (savedJobs as any)?.newSavedCount === 'number' && (savedJobs as any).newSavedCount > 0)
                        ? (savedJobs as any).newSavedCount
                        : (savedJobs?.length || 0);

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
