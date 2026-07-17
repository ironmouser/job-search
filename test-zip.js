require('dotenv').config({ path: '.env.local' });
const cheerio = require('cheerio');
const proxyUrl = `http://api.scrape.do?token=${process.env.SCRAPEDO_API_KEY}&super=true&url=`;

async function testZipRecruiter() {
    try {
        const keyword = "software";
        const location = "remote";
        const url = encodeURIComponent(`https://www.ziprecruiter.com/jobs-search?search=${keyword}&location=${location}`);
        const res = await fetch(proxyUrl + url);
        const html = await res.text();
        
        const $ = cheerio.load(html);
        
        $('script[type="application/ld+json"]').each((i, el) => {
            try {
                const data = JSON.parse($(el).text());
                const arr = Array.isArray(data) ? data : [data];
                for (const item of arr) {
                    if (item['@type'] === 'ItemList') {
                        console.log(JSON.stringify(item.itemListElement.slice(0, 1), null, 2));
                    }
                }
            } catch(e) {}
        });
    } catch(e) { console.error("ZipRecruiter error", e); }
}
testZipRecruiter();
