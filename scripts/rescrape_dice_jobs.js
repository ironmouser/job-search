require('dotenv').config({ path: '.env.local' });
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const cheerio = require('cheerio');
const prisma = new PrismaClient();

async function rescrapeDiceJobs() {
    console.log('Finding all Dice jobs in DB...');
    const diceJobs = await prisma.job.findMany({
        where: {
            OR: [
                { source: { contains: 'dice', mode: 'insensitive' } },
                { url: { contains: 'dice.com', mode: 'insensitive' } }
            ]
        }
    });

    console.log(`Found ${diceJobs.length} Dice jobs in database.`);

    let updatedCount = 0;
    let failedCount = 0;
    let skippedCount = 0;

    const fetchDiceDescription = async (job) => {
        if (job.description && job.description.length > 200 && !job.description.startsWith('Found via job search:')) {
            console.log(`[Skip] Job ${job.id} ("${job.title}") already has a valid description (${job.description.length} chars).`);
            skippedCount++;
            return;
        }

        console.log(`[Fetching] Job ${job.id} ("${job.title}") from ${job.url}...`);
        let detailHtml = '';

        try {
            const res = await fetch(job.url, {
                signal: AbortSignal.timeout(12000),
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.9',
                }
            });
            if (res.ok) {
                const text = await res.text();
                if (text && !text.includes('403 Forbidden') && !text.includes('Access Denied') && !text.includes('captcha')) {
                    detailHtml = text;
                }
            }
        } catch (e) {
            console.warn(`Direct fetch failed for ${job.url}: ${e.message}`);
        }

        if (!detailHtml && process.env.SCRAPEDO_API_KEY) {
            try {
                const proxyUrl = `http://api.scrape.do?token=${process.env.SCRAPEDO_API_KEY}&super=true&url=${encodeURIComponent(job.url)}`;
                const res = await fetch(proxyUrl, { signal: AbortSignal.timeout(15000) });
                if (res.ok) {
                    const text = await res.text();
                    if (text && !text.includes('403 Forbidden') && !text.includes('Access Denied')) {
                        detailHtml = text;
                    }
                }
            } catch (e) {
                console.warn(`Scrape.do fetch failed for ${job.url}: ${e.message}`);
            }
        }

        if (!detailHtml) {
            console.error(`[Failed] Could not fetch HTML for job ${job.id}`);
            failedCount++;
            return;
        }

        const $d = cheerio.load(detailHtml);
        let extractedDesc = '';

        // Priority 1: __NEXT_DATA__
        const nextDataRaw = $d('script#__NEXT_DATA__').html();
        if (nextDataRaw) {
            try {
                const nd = JSON.parse(nextDataRaw);
                const jobData =
                    nd?.props?.pageProps?.job ||
                    nd?.props?.pageProps?.initialState?.jobDetail?.payload ||
                    nd?.props?.pageProps?.jobDetail ||
                    null;
                const rawDesc =
                    jobData?.description ||
                    jobData?.jobDescription ||
                    jobData?.descriptionHtml ||
                    '';
                if (rawDesc && rawDesc.trim().length > 80) {
                    extractedDesc = cheerio.load(rawDesc).text().trim();
                }
            } catch {}
        }

        // Priority 2: JSON-LD
        if (!extractedDesc || extractedDesc.length < 80) {
            $d('script[type="application/ld+json"]').each((_, el) => {
                try {
                    const data = JSON.parse($d(el).html() || '');
                    const arr = Array.isArray(data) ? data : [data];
                    for (const item of arr) {
                        if (item['@type'] === 'JobPosting' && item.description) {
                            const desc = cheerio.load(item.description).text().trim();
                            if (desc.length > 80) {
                                extractedDesc = desc;
                                return;
                            }
                        }
                    }
                } catch {}
            });
        }

        // Priority 3: CSS selectors
        if (!extractedDesc || extractedDesc.length < 80) {
            const descEl = $d(
                '[data-cy="jobDescription"], .job-description, #jobDescription, [class*="description"], [class*="job-detail__description"]'
            ).first();
            if (descEl.length) {
                const desc = descEl.text().trim();
                if (desc.length > 80) {
                    extractedDesc = desc;
                }
            }
        }

        if (extractedDesc && extractedDesc.length > 80) {
            await prisma.job.update({
                where: { id: job.id },
                data: { description: extractedDesc }
            });
            console.log(`[Updated] Job ${job.id} ("${job.title}") updated (${extractedDesc.length} chars).`);
            updatedCount++;
        } else {
            console.warn(`[No Description Found] Could not extract description for job ${job.id}`);
            failedCount++;
        }
    };

    const BATCH_SIZE = 5;
    for (let i = 0; i < diceJobs.length; i += BATCH_SIZE) {
        const batch = diceJobs.slice(i, i + BATCH_SIZE);
        await Promise.allSettled(batch.map(j => fetchDiceDescription(j)));
    }

    console.log(`\n=== Rescrape Complete ===`);
    console.log(`Total Dice Jobs: ${diceJobs.length}`);
    console.log(`Updated: ${updatedCount}`);
    console.log(`Skipped: ${skippedCount}`);
    console.log(`Failed: ${failedCount}`);

    await prisma.$disconnect();
}

rescrapeDiceJobs().catch((err) => {
    console.error('Fatal error during rescrape:', err);
    process.exit(1);
});
