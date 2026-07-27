import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { fetchJobDescription, extractUrlFromStubDescription, isDescriptionAdequate } from '@/lib/jobFetcher';

export const maxDuration = 300;

export async function POST(request: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const scanAll = searchParams.get('all') === 'true' || true; // Default to all inadequate jobs

        let whereClause: any = {};
        if (!scanAll) {
            const startOfToday = new Date();
            startOfToday.setHours(0, 0, 0, 0);
            whereClause.createdAt = { gte: startOfToday };
        }

        const candidateJobs = await prisma.job.findMany({
            where: whereClause,
            select: { id: true, title: true, company: true, url: true, description: true, createdAt: true }
        });

        const stubJobs = candidateJobs.filter(j => !isDescriptionAdequate(j.description));

        if (stubJobs.length === 0) {
            return NextResponse.json({
                message: 'No stub/inadequate jobs found in database.',
                totalExamined: candidateJobs.length,
                stubCount: 0,
                updatedCount: 0
            });
        }

        const results = [];
        let updatedCount = 0;
        let failedCount = 0;

        for (const job of stubJobs) {
            const stubUrl = extractUrlFromStubDescription(job.description);
            const urlsToTry = Array.from(new Set([stubUrl, job.url].filter((u): u is string => Boolean(u))));

            if (urlsToTry.length === 0) {
                results.push({ id: job.id, title: job.title, company: job.company, status: 'skipped_no_url' });
                failedCount++;
                continue;
            }

            let newDesc: string | null = null;
            let usedUrl = job.url;

            for (const tryUrl of urlsToTry) {
                try {
                    const fetched = await fetchJobDescription(tryUrl);
                    if (fetched && isDescriptionAdequate(fetched)) {
                        newDesc = fetched;
                        usedUrl = tryUrl;
                        break;
                    }
                } catch (e: any) {
                    console.warn(`Failed fetch for ${tryUrl}:`, e.message);
                }
            }

            if (newDesc) {
                const finalDesc = newDesc + `\n\nApply at: ${usedUrl}`;
                await prisma.job.update({
                    where: { id: job.id },
                    data: { description: finalDesc }
                });

                await prisma.userJob.updateMany({
                    where: { jobId: job.id },
                    data: { status: 'discovered' }
                });

                results.push({ id: job.id, title: job.title, company: job.company, status: 'success', descLength: finalDesc.length });
                updatedCount++;
            } else {
                results.push({ id: job.id, title: job.title, company: job.company, status: 'failed_scraping' });
                failedCount++;
            }
        }

        return NextResponse.json({
            message: `Processed ${stubJobs.length} inadequate job descriptions across database.`,
            totalExamined: candidateJobs.length,
            stubCount: stubJobs.length,
            updatedCount,
            failedCount,
            results
        });
    } catch (e: any) {
        console.error('Error rescraping stub jobs:', e);
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
