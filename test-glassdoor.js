require('dotenv').config({ path: '.env.local' });
const cheerio = require('cheerio');
const proxyUrl = `http://api.scrape.do?token=${process.env.SCRAPEDO_API_KEY}&url=`;

async function testGlassdoor() {
    const url = encodeURIComponent('https://www.glassdoor.com/Job/jobs.htm?sc.keyword=software+engineer&locT=&locId=&locKeyword=remote');
    const res = await fetch(proxyUrl + url);
    const html = await res.text();
    const $ = cheerio.load(html);
    
    console.log("Script with __NEXT_DATA__:", $('script#__NEXT_DATA__').length);
    console.log("Apollo state:", $('script').filter((i, el) => $(el).html().includes('apolloState')).length);
    
    // Dump script tags lengths
    $('script').each((i, el) => {
        const h = $(el).html();
        if (h && h.length > 1000) {
            console.log("Large script:", h.substring(0, 100));
        }
    });
}
testGlassdoor();
