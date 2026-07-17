require('dotenv').config({ path: '.env.local' });
const cheerio = require('cheerio');
const proxyUrl = `http://api.scrape.do?token=${process.env.SCRAPEDO_API_KEY}&url=`;

async function testLever() {
    const url = encodeURIComponent('https://jobs.lever.co/anthropic');
    const res = await fetch(proxyUrl + url);
    const html = await res.text();
    const $ = cheerio.load(html);
    
    console.log("Lever postings count:", $('.posting').length);
    console.log("Lever posting titles:", $('.posting-title h5').length);
}
testLever();
