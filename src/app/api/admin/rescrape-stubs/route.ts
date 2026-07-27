import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import * as cheerio from 'cheerio';
import { reformatJobDescriptionWithGemini } from '@/lib/formatter';

export const maxDuration = 300;

async function extractContent(rawHtml: string): Promise<string | null> {
    const $ = cheerio.load(rawHtml);

    let jsonLdDesc = '';
    $('script[type="application/ld+json"]').each((_, el) => {
        try {
            const data = JSON.parse($(el).html() || '');
            if (typeof data.description === 'string') {
                jsonLdDesc = data.description;
            } else if (data['@graph'] && Array.isArray(data['@graph'])) {
                const item = data['@graph'].find((g: any) => typeof g?.description === 'string');
                if (item?.description) jsonLdDesc = item.description;
            }
        } catch {}
    });

    const cleanDesc = jsonLdDesc.trim();
    if (cleanDesc.length > 100) {
        return await reformatJobDescriptionWithGemini(cleanDesc);
    }

    $('script, style, noscript, nav, header, footer, iframe, svg').remove();
    const containerSelector = 'main, article, .job-description, .job_description, #job-description, #jobDescriptionText, .posting-requirements, .section-description, [data-automation-id="jobPostingDescription"], [class*="description"], [class*="posting"], [class*="details"], [id*="description"], [id*="posting"]';
    const htmlStr = $(containerSelector).html() || $('body').html() || '';
    if (htmlStr.trim().length > 100) {
        return await reformatJobDescriptionWithGemini(htmlStr.trim());
    }

    return null;
}

async function fetchWithFallback(url: string): Promise<string | null> {
    try {
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
            }
        });
        if (response.ok) {
            const bodyStr = await response.text();
            if (!bodyStr.includes('Just a moment...') && !bodyStr.includes('cf-challenge-error-title')) {
                const extracted = await extractContent(bodyStr);
                if (extracted) return extracted;
            }
        }
    } catch (e: any) {
        console.warn(`Direct fetch failed for ${url}: ${e.message}`);
    }

    if (process.env.SCRAPEDO_API_KEY) {
        try {
            const scrapeDoUrl = `http://api.scrape.do?token=${process.env.SCRAPEDO_API_KEY}&super=true&render=true&url=${encodeURIComponent(url)}`;
            const sdRes = await fetch(scrapeDoUrl);
            if (sdRes.ok) {
                const sdBody = await sdRes.text();
                const extracted = await extractContent(sdBody);
                if (extracted) return extracted;
            }
        } catch (err: any) {
            console.warn(`Scrape.do fallback error for ${url}: ${err.message}`);
        }
    }

    return null;
}

export async function POST() {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const startOfToday = new Date();
        startOfToday.setHours(0, 0, 0, 0);

        const jobsToday = await prisma.job.findMany({
            where: {
                createdAt: {
                    gte: startOfToday
                }
            },
            select: { id: true, title: true, company: true, url: true, description: true, createdAt: true }
        });

        const stubJobs = jobsToday.filter(j => {
            const desc = (j.description || '').trim();
            return (
                !desc ||
                desc.length < 1000 ||
                desc.toLowerCase().startsWith('apply at:') ||
                /position at/i.test(desc) ||
                /found via email/i.test(desc) ||
                /^https?:\/\/\S+$/.test(desc)
            );
        });

        if (stubJobs.length === 0) {
            return NextResponse.json({
                message: 'No stub jobs added today found in the database.',
                totalToday: jobsToday.length,
                stubCount: 0,
                updatedCount: 0
            });
        }

        const results = [];
        let updatedCount = 0;
        let failedCount = 0;

        for (const job of stubJobs) {
            if (!job.url) {
                results.push({ id: job.id, title: job.title, company: job.company, status: 'skipped_no_url' });
                failedCount++;
                continue;
            }

            const newDesc = await fetchWithFallback(job.url);

            if (newDesc && newDesc.trim().length > 50) {
                const finalDesc = newDesc + `\n\nApply at: ${job.url}`;
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
            message: `Processed ${stubJobs.length} stub jobs added today.`,
            totalToday: jobsToday.length,
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
