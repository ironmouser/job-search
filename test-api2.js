const cheerio = require('cheerio');
async function testRemotePOC() {
    try {
        const params = new URLSearchParams();
        params.append('search_keywords', 'software');
        params.append('per_page', '5');
        params.append('orderby', 'featured');
        params.append('order', 'DESC');
        
        const res = await fetch('https://remotepoc.com/jm-ajax/get_listings/', {
            method: 'POST',
            body: params
        });
        const body = await res.json();
        if (body.html) {
            const $ = cheerio.load(body.html);
            $('li.job_listing').each((i, el) => {
                const title = $(el).find('h3.job_listing-title').text().trim();
                const location = $(el).find('.job_listing-location').text().trim();
                console.log(`Title: ${title}, Location: ${location}`);
            });
        }
    } catch (e) { console.error(e); }
}
testRemotePOC();
