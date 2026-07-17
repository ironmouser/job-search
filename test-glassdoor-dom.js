require('dotenv').config({ path: '.env.local' });
const cheerio = require('cheerio');
const proxyUrl = `http://api.scrape.do?token=${process.env.SCRAPEDO_API_KEY}&url=`;

async function main() {
    const url = encodeURIComponent('https://www.glassdoor.com/Job/jobs.htm?sc.keyword=software+engineer&locT=&locId=&locKeyword=remote');
    const res = await fetch(proxyUrl + url);
    const html = await res.text();
    const $ = cheerio.load(html);
    console.log("Title:", $('title').text());
    console.log("Any jobs?", $('li[data-test="jobListing"]').length);
    $('script').each((i, el) => {
        const t = $(el).html();
        if(t && t.includes('window.appCache')) {
            console.log("Found appCache");
        }
        if(t && t.includes('jobListing')) {
            console.log("Found jobListing in script:", t.substring(0, 100));
        }
    });
}
main();
