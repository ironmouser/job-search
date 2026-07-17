require('dotenv').config({ path: '.env.local' });
const cheerio = require('cheerio');
const proxyUrl = `http://api.scrape.do?token=${process.env.SCRAPEDO_API_KEY}&url=`;

async function testLinkedIn() {
    try {
        const keyword = "software";
        const location = "remote";
        const url = encodeURIComponent(`https://www.linkedin.com/jobs/search/?keywords=${keyword}&location=${location}`);
        const res = await fetch(proxyUrl + url);
        const html = await res.text();
        
        const $ = cheerio.load(html);
        const jobs = [];
        
        $('.base-card').each((i, el) => {
            const title = $(el).find('.base-search-card__title').text().trim();
            const company = $(el).find('.base-search-card__subtitle').text().trim();
            const link = $(el).find('.base-card__full-link').attr('href');
            const loc = $(el).find('.job-search-card__location').text().trim();
            if (title && link) {
                jobs.push({ title, company, location: loc, url: link.split('?')[0] });
            }
        });
        
        console.log(`Parsed ${jobs.length} LinkedIn jobs.`);
        if (jobs.length > 0) {
            console.log(jobs.slice(0, 2));
        }
    } catch(e) { console.error("LinkedIn error", e); }
}
testLinkedIn();
