import { PrismaClient } from '@prisma/client';
import * as cheerio from 'cheerio';
import { reformatJobDescriptionWithGemini } from '../src/lib/formatter';

const prisma = new PrismaClient();

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

async function main() {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    // 1. Find user Kurt Charles
    const user = await prisma.user.findFirst({
        where: {
            OR: [
                { email: { contains: 'kurt', mode: 'insensitive' } },
                { name: { contains: 'Kurt', mode: 'insensitive' } }
            ]
        }
    });

    console.log(`User target: ${user ? `${user.name} (${user.email})` : 'All Users'}`);
    console.log(`Querying database for jobs added today (${startOfToday.toISOString().split('T')[0]})...`);

    const jobsToday = await prisma.job.findMany({
        where: {
            createdAt: {
                gte: startOfToday
            }
        },
        select: {
            id: true,
            title: true,
            company: true,
            url: true,
            description: true,
            createdAt: true,
            addedById: true,
            userJobs: { select: { userId: true } }
        }
    });

    let stubJobs = jobsToday.filter(j => {
        const desc = (j.description || '').trim();
        return (
            !desc ||
            desc.length < 250 ||
            desc.toLowerCase().startsWith('apply at:') ||
            /position at/i.test(desc) ||
            /found via email/i.test(desc)
        );
    });

    console.log(`Total stub jobs added today across all users: ${stubJobs.length} out of ${jobsToday.length} total jobs.`);

    if (user) {
        stubJobs = stubJobs.filter(j => 
            j.addedById === user.id || j.userJobs.some(uj => uj.userId === user.id)
        );
        console.log(`Stub jobs added today SPECIFICALLY for ${user.name} (${user.email}): ${stubJobs.length}`);
    }

    if (stubJobs.length === 0) {
        console.log("No stub jobs require re-scraping.");
        return;
    }

    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < stubJobs.length; i++) {
        const job = stubJobs[i];
        console.log(`\n[${i + 1}/${stubJobs.length}] Processing: ${job.title} at ${job.company}`);
        console.log(`  URL: ${job.url}`);

        if (!job.url) {
            console.log(`  Skipping: No URL available.`);
            failCount++;
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

            console.log(`  SUCCESS: Updated description (${finalDesc.length} chars) & queued rescoring.`);
            successCount++;
        } else {
            console.log(`  FAILED: Could not scrape full details (site may require browser or authentication).`);
            failCount++;
        }
    }

    console.log(`\n========================================`);
    console.log(`Rescrape complete!`);
    console.log(`  Successfully updated: ${successCount}`);
    console.log(`  Failed / Skipped: ${failCount}`);
    console.log(`========================================`);
}

main()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });

export {};
