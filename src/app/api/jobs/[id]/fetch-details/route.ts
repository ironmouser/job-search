import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { fetchSingleJobJSearch } from '@/lib/jsearch';
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";

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

        let scrapedData: any = null;

        // 2. Try Firecrawl Primary
        if (process.env.FIRECRAWL_API_KEY) {
            console.log(`Attempting Firecrawl for ${job.url}...`);
            try {
                const fcRes = await fetch('https://api.firecrawl.dev/v1/scrape', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${process.env.FIRECRAWL_API_KEY}`
                    },
                    body: JSON.stringify({
                        url: job.url,
                        formats: ['markdown'],
                        onlyMainContent: true
                    })
                });

                if (fcRes.ok) {
                    const fcData = await fcRes.json();
                    if (fcData.success && fcData.data?.markdown) {
                        scrapedData = { description: fcData.data.markdown };
                        console.log("Successfully fetched via Firecrawl.");
                    }
                } else {
                    console.warn(`Firecrawl failed with status: ${fcRes.status}`);
                }
            } catch (e) {
                console.error("Firecrawl request error:", e);
            }
        }

        // 3. JSearch Backup
        if (!scrapedData) {
            console.log("Falling back to JSearch...");
            try {
                scrapedData = await fetchSingleJobJSearch(job.title, job.company);
            } catch (e) {
                console.error("JSearch fallback error:", e);
            }
        }

        if (!scrapedData || !scrapedData.description) {
            return NextResponse.json({ error: 'Failed to scrape full details from both Firecrawl and Apify (Upstream timeout or block)' }, { status: 502 });
        }

        const updatePayload: any = {
            description: scrapedData.description
        };

        if (scrapedData.salary_range) updatePayload.salaryRange = scrapedData.salary_range;
        if (scrapedData.location && job.location?.includes('Unknown')) updatePayload.location = scrapedData.location;

        // 4. Update the job
        await prisma.job.update({
            where: { id: jobId },
            data: updatePayload
        });

        // 5. Update UserJob status to discovered to trigger rescoring
        await prisma.userJob.update({
            where: { userId_jobId: { userId, jobId } },
            data: { status: 'discovered' }
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
