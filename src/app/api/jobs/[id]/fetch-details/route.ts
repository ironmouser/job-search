import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { scoreJob } from '@/lib/scoring';

import { fetchJobDescriptionDetailed, extractUrlFromStubDescription, FetchJobDescriptionResult } from '@/lib/jobFetcher';
import { cleanJobUrl } from '@/lib/urlUtils';
import { searchJobDescriptionFromSerpApi } from '@/lib/serpapi';

export const maxDuration = 60;

export async function POST(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
          return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        const userId = session.user.id;

        const { id: jobId } = await params;
        if (!jobId) {
            return NextResponse.json({ error: 'Job ID is required' }, { status: 400 });
        }

        // 1. Fetch the job
        const job = await prisma.job.findUnique({
            where: { id: jobId }
        });

        if (!job) {
            return NextResponse.json({ error: 'Job not found' }, { status: 404 });
        }

        // Try URLs in priority order: embedded URL in stub description, then job.url
        const stubUrl = extractUrlFromStubDescription(job.description);
        const urlsToTry = [...new Set([stubUrl, job.url].map(u => u ? cleanJobUrl(u) : '').filter(Boolean))];

        let fetchResult: FetchJobDescriptionResult | null = null;
        let usedUrl: string = urlsToTry[0] || '';

        for (const tryUrl of urlsToTry) {
            fetchResult = await fetchJobDescriptionDetailed(tryUrl);
            if (fetchResult?.description) { 
                usedUrl = fetchResult.finalUrl || tryUrl; 
                break; 
            }
        }

        // 2. Fallback: If URL scraping failed, search Google Jobs (SerpAPI) by Title + Company
        if (!fetchResult?.description && job.title && job.company && !job.company.toLowerCase().includes('unknown')) {
            console.log(`[FetchDetails] Direct URL scrape returned no content for job ${jobId}. Attempting SerpAPI Google Jobs fallback for "${job.title}" at "${job.company}"...`);
            const serpFallback = await searchJobDescriptionFromSerpApi(job.title, job.company);
            if (serpFallback?.description) {
                fetchResult = {
                    description: serpFallback.description,
                    company: job.company,
                    title: job.title,
                    finalUrl: serpFallback.finalUrl || usedUrl || job.url,
                    resolvedApplicationUrl: serpFallback.applicationUrl || null
                };
                if (serpFallback.finalUrl) {
                    usedUrl = serpFallback.finalUrl;
                }
            }
        }

        if (!fetchResult?.description) {
            return NextResponse.json({ error: 'Could not automatically extract full job details. The site may be blocking automated access.' }, { status: 502 });
        }

        // Prefer the direct ATS URL extracted during scraping (e.g. from ZipRecruiter JSON-LD),
        // fall back to the final URL that successfully returned the description.
        const directATSUrl = fetchResult.resolvedApplicationUrl || null;
        const updatePayload: any = {
            description: fetchResult.description + `\n\nApply at: ${usedUrl}`,
            applicationUrl: directATSUrl || usedUrl,
        };

        if (fetchResult.company && (!job.company || job.company.toLowerCase().includes('unknown'))) {
            updatePayload.company = fetchResult.company;
        }
        if (fetchResult.title && (!job.title || job.title.toLowerCase().includes('unknown'))) {
            updatePayload.title = fetchResult.title;
        }

        // 3. Update the job
        await prisma.job.update({
            where: { id: jobId },
            data: updatePayload
        });

        // 4. Update or ensure UserJob exists
        await prisma.userJob.upsert({
            where: { userId_jobId: { userId, jobId } },
            create: { userId, jobId, status: 'discovered' },
            update: {}
        });

        // 5. Fire-and-forget background scoring so HTTP response returns immediately once description is saved
        scoreJob(userId, jobId, job.title, updatePayload.description).catch((scoreErr: any) => {
            console.warn(`Failed to auto-score job ${jobId} after fetching details:`, scoreErr.message);
        });

        return NextResponse.json({ success: true });

    } catch (error: any) {
        console.error('Error fetching job details:', error);
        return NextResponse.json(
            { error: error.message || 'Internal server error' },
            { status: 500 }
        );
    }
}
