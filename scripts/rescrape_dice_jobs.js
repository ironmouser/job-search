require('dotenv').config({ path: '.env.local' });
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const cheerio = require('cheerio');
const prisma = new PrismaClient();

function cleanCompanyName(company) {
    if (!company) return '';
    let cleaned = company.trim();
    cleaned = cleaned.replace(/^data:\s*/gi, '');
    cleaned = cleaned.replace(/\s*★?\s*\d\.\d\s*★?\s*$/gi, '');
    cleaned = cleaned.replace(/^(.+?)\s*\d\.\d\s*★?\s*$/gi, '$1');
    cleaned = cleaned.replace(/^([A-Za-z\s&.\-]+?)\d\.\d\s*★?\s*$/gi, '$1');
    cleaned = cleaned.replace(/\s*\([^)]*\)/g, '');
    cleaned = cleaned.replace(/\s*[\-\|–—]\s*(remote|scraped|email|careers|jobs|hiring|via).*$/gi, '');
    return cleaned.replace(/\s+/g, ' ').trim();
}

function convertHtmlToMarkdown(html) {
    if (!html) return '';
    return html
        .replace(/<br\s*[\/]?>/gi, '\n')
        .replace(/<\/p>/gi, '\n\n')
        .replace(/<\/li>/gi, '\n')
        .replace(/<li>/gi, '• ')
        .replace(/<h[1-6][^>]*>/gi, '\n### ')
        .replace(/<\/h[1-6]>/gi, '\n')
        .replace(/<strong>|<b>/gi, '**')
        .replace(/<\/strong>|<\/b>/gi, '**')
        .replace(/<em>|<i>/gi, '*')
        .replace(/<\/em>|<\/i>/gi, '*')
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

async function rescrapeDiceJobs() {
    console.log('=== Step 1: Cleaning up fake company profile / non-job entries ===');
    const fakeJobs = await prisma.job.findMany({
        where: {
            OR: [
                { url: { contains: 'dice.com/company-profile', mode: 'insensitive' } },
                { url: { contains: 'dice.com/company/', mode: 'insensitive' } },
            ]
        },
        select: { id: true, title: true, url: true }
    });

    console.log(`Found ${fakeJobs.length} fake company profile jobs in DB.`);
    if (fakeJobs.length > 0) {
        const fakeIds = fakeJobs.map(j => j.id);
        // Clean related tables first if foreign keys exist
        try {
            await prisma.userJob.deleteMany({ where: { jobId: { in: fakeIds } } });
            await prisma.jobFeedback.deleteMany({ where: { jobId: { in: fakeIds } } });
            await prisma.application.deleteMany({ where: { jobId: { in: fakeIds } } });
        } catch (e) {
            console.warn('Note during cascade cleanup:', e.message);
        }
        const deleteRes = await prisma.job.deleteMany({ where: { id: { in: fakeIds } } });
        console.log(`Successfully deleted ${deleteRes.count} fake company profile jobs.`);
    }

    console.log('\n=== Step 2: Finding real Dice jobs needing company name or description update ===');
    const diceJobs = await prisma.job.findMany({
        where: {
            OR: [
                { source: { contains: 'dice', mode: 'insensitive' } },
                { url: { contains: 'dice.com/job-detail', mode: 'insensitive' } }
            ]
        }
    });

    console.log(`Found ${diceJobs.length} total Dice job postings in database.`);

    let updatedCount = 0;
    let failedCount = 0;
    let skippedCount = 0;

    const fetchDiceDetails = async (job) => {
        const hasValidDesc = job.description && job.description.length > 300 && !job.description.startsWith('Found via');
        const hasValidCompany = job.company && !job.company.toLowerCase().includes('unknown');

        if (hasValidDesc && hasValidCompany) {
            skippedCount++;
            return;
        }

        console.log(`[Fetching] Job ${job.id} ("${job.title}"): ${job.url}`);
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
            } else if (res.status === 404 || res.status === 410) {
                console.warn(`[Expired 404/410] Job ${job.id} no longer exists on Dice.`);
                failedCount++;
                return;
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
        let extractedTitle = '';
        let extractedCompany = '';
        let extractedDesc = '';

        // Priority 1: JSON-LD JobPosting
        $d('script[type="application/ld+json"]').each((_, el) => {
            try {
                const data = JSON.parse($d(el).html() || '');
                const arr = Array.isArray(data) ? data : [data];
                for (const item of arr) {
                    if (item['@type'] === 'JobPosting') {
                        extractedTitle = item.title || extractedTitle;
                        extractedCompany = item.hiringOrganization?.name || extractedCompany;
                        if (item.description) {
                            extractedDesc = convertHtmlToMarkdown(item.description);
                        }
                    }
                }
            } catch {}
        });

        // Priority 2: Next.js App Router RSC Stream (self.__next_f)
        if (!extractedDesc || !extractedCompany) {
            const rscRegex = /self\.__next_f\.push\(\[1,"([\s\S]*?)"\]\)/g;
            let m;
            while ((m = rscRegex.exec(detailHtml)) !== null) {
                try {
                    const raw = JSON.parse(`"${m[1]}"`);
                    if (!extractedDesc && (raw.includes('jobDescription') || raw.includes('descriptionHtml') || raw.includes('jobSummary'))) {
                        const descMatch = raw.match(/"(?:jobDescription|descriptionHtml|description)"\s*:\s*("(?:[^"\\]|\\.)*")/);
                        if (descMatch && descMatch[1]) {
                            extractedDesc = convertHtmlToMarkdown(JSON.parse(descMatch[1]));
                        }
                    }
                    if (!extractedCompany && raw.includes('companyName')) {
                        const compMatch = raw.match(/"companyName"\s*:\s*"([^"]+)"/);
                        if (compMatch && compMatch[1]) extractedCompany = compMatch[1];
                    }
                    if (!extractedTitle && raw.includes('jobTitle')) {
                        const titleMatch = raw.match(/"jobTitle"\s*:\s*"([^"]+)"/);
                        if (titleMatch && titleMatch[1]) extractedTitle = titleMatch[1];
                    }
                } catch {}
            }
        }

        // Priority 3: __NEXT_DATA__
        if (!extractedDesc || !extractedCompany) {
            const nextDataRaw = $d('script#__NEXT_DATA__').html();
            if (nextDataRaw) {
                try {
                    const nd = JSON.parse(nextDataRaw);
                    const jobData =
                        nd?.props?.pageProps?.job ||
                        nd?.props?.pageProps?.initialState?.jobDetail?.payload ||
                        nd?.props?.pageProps?.jobDetail ||
                        null;
                    const rawDesc = jobData?.description || jobData?.jobDescription || jobData?.descriptionHtml || '';
                    if (rawDesc && rawDesc.trim().length > 80) {
                        extractedDesc = convertHtmlToMarkdown(rawDesc);
                    }
                    if (jobData?.companyName && !extractedCompany) {
                        extractedCompany = jobData.companyName;
                    }
                    if (jobData?.jobTitle && !extractedTitle) {
                        extractedTitle = jobData.jobTitle;
                    }
                } catch {}
            }
        }

        // Priority 4: CSS selectors for description
        if (!extractedDesc || extractedDesc.length < 80) {
            const descEl = $d(
                '[data-cy="jobDescription"], .job-description, #jobDescription, [class*="description"], [class*="job-detail__description"]'
            ).first();
            if (descEl.length) {
                const desc = convertHtmlToMarkdown(descEl.html() || '');
                if (desc.length > 80) {
                    extractedDesc = desc;
                }
            }
        }

        const updateData = {};
        if (extractedDesc && extractedDesc.length > 80) {
            updateData.description = extractedDesc;
        }
        if (extractedCompany && (!job.company || job.company.toLowerCase().includes('unknown'))) {
            updateData.company = cleanCompanyName(extractedCompany);
        }
        if (extractedTitle && (!job.title || job.title.toLowerCase().includes('unknown'))) {
            updateData.title = extractedTitle.trim();
        }

        if (Object.keys(updateData).length > 0) {
            await prisma.job.update({
                where: { id: job.id },
                data: updateData
            });
            console.log(`[Updated] Job ${job.id} -> Company: "${updateData.company || job.company}", Title: "${updateData.title || job.title}", Desc length: ${updateData.description?.length || job.description?.length}`);
            updatedCount++;
        } else {
            console.warn(`[No Data Extracted] Job ${job.id}`);
            failedCount++;
        }
    };

    const BATCH_SIZE = 10;
    for (let i = 0; i < diceJobs.length; i += BATCH_SIZE) {
        const batch = diceJobs.slice(i, i + BATCH_SIZE);
        await Promise.allSettled(batch.map(j => fetchDiceDetails(j)));
    }

    console.log(`\n=== Rescrape Complete ===`);
    console.log(`Total Dice Postings: ${diceJobs.length}`);
    console.log(`Updated: ${updatedCount}`);
    console.log(`Skipped (already clean): ${skippedCount}`);
    console.log(`Failed/Expired: ${failedCount}`);

    await prisma.$disconnect();
}

rescrapeDiceJobs().catch((err) => {
    console.error('Fatal error during rescrape:', err);
    process.exit(1);
});

