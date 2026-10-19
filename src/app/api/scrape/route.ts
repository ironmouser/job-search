import { NextResponse } from 'next/server';
import { normalizeAndSaveJobs } from '@/lib/jobs';
import { runSearch } from '@/lib/search/runSearch';
import { getUserSettings, DEFAULT_PRO_SOURCES, DEFAULT_FREE_SOURCES, FREE_ALLOWED_SOURCES } from '@/lib/settings';
import { prisma } from '@/lib/prisma';
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { getEffectiveTier } from '@/lib/tier';


import { isUsLocation, isRemoteLocation, extractStateAbbr, isOutsideUsLocation } from '@/lib/locationUtils';
import { expandSearchKeywords, expandSearchKeywordsWithAI, splitTargetRoles } from '@/lib/keywordExpansion';
import { extractTopTitlesFromResults } from '@/lib/serpapi';
import { isClosedJobRecord } from '@/lib/jobStatusDetector';
import { computeRoleMatchScore } from '@/lib/roleMatcher';

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
        
        const keyword = (typeof body.keyword === 'string' && body.keyword.trim().length > 0) 
            ? body.keyword.trim() 
            : (settings.searchKeyword || 'Software Engineer');
        const location = (typeof body.location === 'string' && body.location.trim().length > 0)
            ? body.location.trim()
            : (settings.searchLocation || 'Remote');
        const remoteOnlyOverride = typeof body.remoteOnly === 'boolean' ? body.remoteOnly : undefined;
        const noInternationalOverride = typeof body.noInternational === 'boolean' ? body.noInternational : undefined;
        const effectiveRemoteOnly = remoteOnlyOverride !== undefined ? remoteOnlyOverride : (settings.remoteOnly || false);
        const effectiveNoInternational = noInternationalOverride !== undefined ? noInternationalOverride : (settings.noInternational || false);
        const sourceParam = body.source;

        // Ensure search keyword is auto-persisted to userPreferences if missing
        if (typeof body.keyword === 'string' && body.keyword.trim().length > 0) {
            try {
                const userPref = await prisma.userPreferences.findUnique({ where: { userId } });
                if (!userPref) {
                    await prisma.userPreferences.create({
                        data: {
                            userId,
                            searchKeyword: keyword,
                            searchLocation: location,
                            remoteOnly: remoteOnlyOverride ?? false,
                            theme: 'light',
                            profile: `# Job Search Goal\nSeeking high-growth tech opportunities as a ${keyword}.`
                        }
                    });
                } else if (!userPref.searchKeyword || !userPref.searchKeyword.trim()) {
                    await prisma.userPreferences.update({
                        where: { userId },
                        data: {
                            searchKeyword: keyword,
                            searchLocation: userPref.searchLocation || location,
                        }
                    });
                }
            } catch (prefErr) {
                console.warn('[Scrape] Auto-save keyword to userPreferences notice:', prefErr);
            }
        }

        console.log(`Received omni-scrape request for "${keyword}" in "${location}" (remoteOnly: ${effectiveRemoteOnly}) for user ${userId}`);

        const globalSettings = await prisma.globalSettings.findUnique({ where: { id: 'system' } });
        const userRecord = await prisma.user.findUnique({
            where: { id: userId },
            select: { planTier: true, trialEndsAt: true, subscriptionType: true, orgAccessExpiresAt: true }
        });

        // New users in their 7-day Pro Free Trial or active Pro subscribers evaluate to 'PRO'
        const isPro = userRecord ? getEffectiveTier(userRecord) === 'PRO' : false;

        let sources = settings.sources ? { ...settings.sources } : (isPro ? { ...DEFAULT_PRO_SOURCES } : { ...DEFAULT_FREE_SOURCES });

        const freeAllowedSet = new Set(FREE_ALLOWED_SOURCES);

        if (!isPro) {
            // Post-trial Free tier users are restricted to standard open sources
            for (const key of Object.keys(sources)) {
                if (!freeAllowedSet.has(key)) {
                    sources[key] = false;
                }
            }
        } else {
            // Active Pro Trial users and Pro subscribers have full access to all premium sources (Indeed, LinkedIn, ZipRecruiter, Dice, etc.)
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
                    try {
                        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
                    } catch (e) {}
                };

                try {
                    const { rawJobs: allRawJobs, totalRawFound: totalRawJobsFound } = await runSearch({
                        keyword,
                        location,
                        remoteOnly: effectiveRemoteOnly,
                        noInternational: effectiveNoInternational,
                        sources,
                        customCareerPages: customUrls,
                        isPro,
                        remotepocIsPro: globalSettings?.remotepocIsPro ?? true,
                        enableAiExpansion: true,
                        userId,
                        onProgress: (evt) => sendEvent(evt),
                    });

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

                    // Extract top distinct discovered role titles for user search refinement suggestions
                    const topRoleSuggestions = extractTopTitlesFromResults(allRawJobs, keyword, 5);

                    sendEvent({
                        type: 'complete',
                        foundCount: totalRawJobsFound,
                        raw_jobs_found: totalRawJobsFound,
                        new_jobs_saved: newJobsSaved,
                        jobs: savedJobs,
                        topRoleSuggestions,
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
