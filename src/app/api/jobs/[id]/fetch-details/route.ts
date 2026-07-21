import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { gotScraping } from 'got-scraping';
import * as cheerio from 'cheerio';
import { reformatJobDescriptionWithGemini } from '@/lib/formatter';

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

        let description: string | null = null;

        // 2. Try direct fetch first, fallback to Scrape.do proxy
        const formatWithGemini = async (html: string): Promise<string> => {
            return await reformatJobDescriptionWithGemini(html);
        };

        const fetchWithFallback = async (url: string): Promise<string | null> => {
            // Direct attempt
            try {
                const res = await gotScraping({
                    url,
                    timeout: { request: 15000 },
                    retry: { limit: 0 },
                    throwHttpErrors: false,
                });
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    const bodyStr = res.body.toString();
                    if (!bodyStr.includes('Just a moment...') && !bodyStr.includes('cf-challenge-error-title')) {
                        const $ = cheerio.load(bodyStr);
                        $('script, style, noscript, nav, header, footer, iframe, svg').remove();
                        const htmlStr = $('main, article, .job-description, #job-description, [class*="description"], [id*="description"]').html() || $('body').html() || '';
                        if (htmlStr.length > 100) return await formatWithGemini(htmlStr);
                    }
                }
            } catch (e: any) {
                console.warn(`Direct fetch failed for ${url}: ${e.message}`);
            }

            // Scrape.do proxy fallback
            if (process.env.SCRAPEDO_API_KEY) {
                console.info(`Falling back to Scrape.do for ${url}`);
                try {
                    const scrapeDoUrl = `http://api.scrape.do?token=${process.env.SCRAPEDO_API_KEY}&super=true&render=true&url=${encodeURIComponent(url)}`;
                    const sdRes = await gotScraping({
                        url: scrapeDoUrl,
                        timeout: { request: 30000 },
                        retry: { limit: 0 },
                        throwHttpErrors: false,
                    });
                    if (sdRes.statusCode >= 200 && sdRes.statusCode < 300) {
                        const $ = cheerio.load(sdRes.body);
                        $('script, style, noscript, nav, header, footer, iframe, svg').remove();
                        const htmlStr = $('main, article, .job-description, #job-description, [class*="description"], [id*="description"]').html() || $('body').html() || '';
                        if (htmlStr.length > 100) return await formatWithGemini(htmlStr);
                    }
                    console.warn(`Scrape.do fallback failed for ${url} (Status: ${sdRes.statusCode})`);
                } catch (err: any) {
                    console.warn(`Scrape.do fallback error for ${url}: ${err.message}`);
                }
            }

            return null;
        };

        description = await fetchWithFallback(job.url);

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

        return NextResponse.json({ success: true });

    } catch (error: any) {
        console.error('Error fetching job details:', error);
        return NextResponse.json(
            { error: error.message || 'Internal server error' },
            { status: 500 }
        );
    }
}
