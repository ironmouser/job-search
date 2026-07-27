import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { gotScraping } from 'got-scraping';
import * as cheerio from 'cheerio';
import { reformatJobDescriptionWithGemini } from '@/lib/formatter';
import { scoreJob } from '@/lib/scoring';

import { fetchJobDescription } from '@/lib/jobFetcher';

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

        if (!job.url) {
            return NextResponse.json({ error: 'Job has no URL' }, { status: 400 });
        }

        const description = await fetchJobDescription(job.url);

        if (!description) {
            return NextResponse.json({ error: 'Failed to scrape full job details. The site may be blocking automated access.' }, { status: 502 });
        }

        const updatePayload: any = {
            description: description + `\n\nApply at: ${job.url}`
        };

        // 3. Update the job
        await prisma.job.update({
            where: { id: jobId },
            data: updatePayload
        });

        // 4. Update UserJob status to discovered to trigger rescoring
        await prisma.userJob.update({
            where: { userId_jobId: { userId, jobId } },
            data: { status: 'discovered' }
        });

        // 5. Automatically score the job with the new description
        try {
            await scoreJob(userId, jobId, job.title, updatePayload.description);
        } catch (scoreErr: any) {
            console.warn(`Failed to auto-score job ${jobId} after fetching details:`, scoreErr.message);
        }

        return NextResponse.json({ success: true });

    } catch (error: any) {
        console.error('Error fetching job details:', error);
        return NextResponse.json(
            { error: error.message || 'Internal server error' },
            { status: 500 }
        );
    }
}
