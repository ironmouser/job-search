import * as cheerio from 'cheerio';
import got from 'got';
import { gotScraping } from 'got-scraping';

const SCRAPEDO_API_KEY = process.env.SCRAPEDO_API_KEY || "e2dff0640e404b23a25ced6e7ebea71e0c6f185f3ca";

async function testHimalayas() {
    console.log("--- Testing Himalayas ---");
    try {
        const res = await got('https://himalayas.app/jobs/api?limit=5');
        const data = JSON.parse(res.body);
        console.log(`Himalayas Success. Received ${data.jobs?.length} jobs.`);
        if (data.jobs?.length) {
            const j = data.jobs[0];
            console.log(`Sample: ${j.title} at ${j.companyName} (${j.location}) - ${j.applicationLink}`);
        }
    } catch(e) {
        console.error("Himalayas Error:", e.message);
    }
}

async function fetchWithScrapeDo(targetUrl) {
    const scrapeDoUrl = `http://api.scrape.do?token=${SCRAPEDO_API_KEY}&url=${encodeURIComponent(targetUrl)}`;
    const res = await gotScraping({ url: scrapeDoUrl, timeout: { request: 30000 } });
    return res.body;
}

async function testIndeed() {
    console.log("\n--- Testing Indeed ---");
    const targetUrl = 'https://www.indeed.com/jobs?q=software&l=remote';
    try {
        const body = await fetchWithScrapeDo(targetUrl);
        const $ = cheerio.load(body);
        
        const mosaicData = $('script#mosaic-data').html();
        if (mosaicData) {
            console.log("Found mosaic-data script!");
            // Try to extract window.mosaic.providerData["mosaic-provider-jobcards"]
            if (mosaicData.includes('window.mosaic.providerData["mosaic-provider-jobcards"]')) {
                 console.log("Found mosaic-provider-jobcards!");
            }
        } else {
            console.log("No mosaic-data found. Look for _initialData...");
            const html = body.toString();
            if (html.includes('_initialData')) {
                console.log("Found _initialData!");
            } else {
                console.log("Could not find hidden JSON for Indeed.");
                console.log("Title of page:", $('title').text());
            }
        }
    } catch(e) {
        console.error("Indeed Error:", e.message);
    }
}

async function testGlassdoor() {
    console.log("\n--- Testing Glassdoor ---");
    const targetUrl = 'https://www.glassdoor.com/Job/jobs.htm?sc.keyword=software&locT=&locId=&locKeyword=remote';
    try {
        const body = await fetchWithScrapeDo(targetUrl);
        const $ = cheerio.load(body);
        const nextData = $('script#__NEXT_DATA__').html();
        if (nextData) {
            console.log("Found __NEXT_DATA__!");
        } else {
            const html = body.toString();
            if (html.includes('apolloState')) {
                console.log("Found apolloState!");
            } else {
                console.log("Could not find hidden JSON for Glassdoor.");
                console.log("Title of page:", $('title').text());
            }
        }
    } catch(e) {
        console.error("Glassdoor Error:", e.message);
    }
}

await testHimalayas();
await testIndeed();
await testGlassdoor();
