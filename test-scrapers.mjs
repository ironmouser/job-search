import { gotScraping } from 'got-scraping';
import * as cheerio from 'cheerio';

async function testRemoteOK() {
    console.log("Testing RemoteOK...");
    try {
        const res = await gotScraping({ url: 'https://remoteok.com/api?tag=developer', responseType: 'json', throwHttpErrors: false });
        console.log("RemoteOK status:", res.statusCode);
        if (res.statusCode === 200) {
            console.log("RemoteOK body preview:", JSON.stringify(res.body).substring(0, 200));
        } else {
            console.log("RemoteOK error body:", res.body ? res.body.toString().substring(0, 200) : 'none');
        }
    } catch(e) { console.error("RemoteOK Error:", e.message); }
}

async function testWorkingNomads() {
    console.log("\nTesting WorkingNomads...");
    try {
        const res = await gotScraping({ url: 'https://www.workingnomads.com/jobs?category=&q=developer', throwHttpErrors: false });
        console.log("WorkingNomads status:", res.statusCode);
        const $ = cheerio.load(res.body);
        const jobs = $('.job, .job-desktop').length;
        console.log("WorkingNomads parsed jobs:", jobs);
        if (jobs === 0) {
           console.log("WorkingNomads title:", $('title').text());
           console.log("WorkingNomads body preview:", res.body.toString().substring(0, 300));
        }
    } catch(e) { console.error("WorkingNomads Error:", e.message); }
}

async function testRemoteCo() {
    console.log("\nTesting Remote.co...");
    try {
        const res = await gotScraping({ url: 'https://remote.co/remote-jobs/search/?search_keywords=developer', throwHttpErrors: false });
        console.log("Remote.co status:", res.statusCode);
        const $ = cheerio.load(res.body);
        const jobs = $('a[href*="/job/"]').length;
        console.log("Remote.co parsed jobs:", jobs);
        if (jobs === 0) {
            console.log("Remote.co title:", $('title').text());
        }
    } catch(e) { console.error("Remote.co Error:", e.message); }
}

async function run() {
    await testRemoteOK();
    await testWorkingNomads();
    await testRemoteCo();
}
run();
