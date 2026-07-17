import { gotScraping } from 'got-scraping';
import * as cheerio from 'cheerio';

async function testWorkingNomadsAPI() {
    console.log("Testing WorkingNomads API...");
    try {
        const res = await gotScraping({ url: 'https://www.workingnomads.com/api/exposed_jobs/', responseType: 'json', throwHttpErrors: false });
        console.log("WorkingNomads API status:", res.statusCode);
        if (res.body && Array.isArray(res.body)) {
            console.log("WorkingNomads API jobs:", res.body.length);
        } else {
            console.log("WorkingNomads API not array:", Array.isArray(res.body));
        }
    } catch(e) { console.error("Error:", e.message); }
}

async function testRemoteOKAPI() {
    console.log("\nTesting RemoteOK API with real UA...");
    try {
        const res = await gotScraping({ 
            url: 'https://remoteok.com/api?tag=developer', 
            responseType: 'json',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            },
            throwHttpErrors: false 
        });
        console.log("RemoteOK API status:", res.statusCode);
        if (Array.isArray(res.body)) {
            console.log("RemoteOK API jobs:", res.body.length);
        }
    } catch(e) { console.error("Error:", e.message); }
}

async function testRemoteCoHTML() {
    console.log("\nTesting Remote.co HTML...");
    try {
        const res = await gotScraping({ url: 'https://remote.co/remote-jobs/search/?search_keywords=developer', throwHttpErrors: false });
        const $ = cheerio.load(res.body);
        console.log("Remote.co all links with job:", $('a').map((i, el) => $(el).attr('href')).get().filter(h => h && h.toLowerCase().includes('job')).slice(0, 5));
        console.log("Remote.co job cards:", $('.job_listing, .job-card, .card').length);
        console.log("Remote.co job cards text:", $('.job_listing, .job-card, .card').first().text().replace(/\n/g, ' ').substring(0, 100));
    } catch(e) { console.error("Error:", e.message); }
}

await testWorkingNomadsAPI();
await testRemoteOKAPI();
await testRemoteCoHTML();
