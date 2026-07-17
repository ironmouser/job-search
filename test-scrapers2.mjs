import { gotScraping } from 'got-scraping';
import * as cheerio from 'cheerio';

async function testRemoteOK() {
    try {
        const res = await gotScraping({ url: 'https://remoteok.com/api?tag=developer', responseType: 'json', throwHttpErrors: false });
        console.log("RemoteOK is array:", Array.isArray(res.body));
        console.log("RemoteOK keys:", Object.keys(res.body).slice(0, 5));
        if (Array.isArray(res.body)) {
           console.log("RemoteOK length:", res.body.length);
        } else {
           console.log("RemoteOK length property:", res.body.length);
        }
    } catch(e) {}
}

async function testWorkingNomads() {
    try {
        const res = await gotScraping({ url: 'https://www.workingnomads.com/jobs?category=&q=developer', throwHttpErrors: false });
        const $ = cheerio.load(res.body);
        console.log("WorkingNomads script tags with JSON:", $('script[type="application/json"]').length);
        console.log("WorkingNomads any API calls in scripts?", $('script').text().substring(0, 200));
    } catch(e) {}
}

async function testRemoteCo() {
    try {
        const res = await gotScraping({ url: 'https://remote.co/remote-jobs/search/?search_keywords=developer', throwHttpErrors: false });
        const $ = cheerio.load(res.body);
        console.log("Remote.co links:", $('a').map((i, el) => $(el).attr('href')).get().filter(h => h && h.includes('job')).slice(0, 5));
    } catch(e) {}
}

await testRemoteOK();
await testWorkingNomads();
await testRemoteCo();
