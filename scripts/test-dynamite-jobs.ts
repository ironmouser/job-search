import { PrismaClient } from '@prisma/client';
import * as cheerio from 'cheerio';
import dns from 'dns';
import { reformatJobDescriptionWithGemini } from '../src/lib/formatter';

try {
    dns.setDefaultResultOrder('ipv4first');
} catch {}

const prisma = new PrismaClient();

async function inspectAndScrape() {
    console.log("Analyzing DynamiteJobs HTML layout...");
    const url = "https://www.dynamitejobs.com/remote-jobs";
    
    const response = await fetch(url, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
        }
    });

    if (!response.ok) {
        console.error(`HTTP error: ${response.status}`);
        return;
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    console.log(`Retrieved page HTML (${html.length} chars).`);

    // 1. Inspect all <a> links
    const allLinks: string[] = [];
    $('a').each((_, el) => {
        const href = $(el).attr('href');
        if (href && !allLinks.includes(href)) {
            allLinks.push(href);
        }
    });

    console.log(`Total <a> links found on page: ${allLinks.length}`);
    const jobLikeLinks = allLinks.filter(l => l.includes('job') || l.includes('posting') || l.includes('remote'));
    console.log(`Job-like links (${jobLikeLinks.length}):`);
    jobLikeLinks.slice(0, 20).forEach(l => console.log(`  - ${l}`));

    // 2. Check JSON-LD
    $('script[type="application/ld+json"]').each((i, el) => {
        console.log(`JSON-LD script ${i + 1}: ${$(el).html()?.substring(0, 200)}`);
    });

    // 3. Check for embedded data objects (e.g. window.__INITIAL_STATE__, __NEXT_DATA__, __NUXT__, etc.)
    $('script').each((i, el) => {
        const scriptText = $(el).html() || '';
        if (scriptText.includes('jobs') || scriptText.includes('Product Manager')) {
            console.log(`Found script with job data (${scriptText.length} chars), sample: ${scriptText.substring(0, 300)}`);
        }
    });
}

inspectAndScrape().finally(() => prisma.$disconnect());
