const cheerio = require('cheerio');
async function testRPOC() {
    const params = new URLSearchParams();
    params.append('search_keywords', 'Senior Product Manager');
    
    const response = await fetch('https://remotepoc.com/jm-ajax/get_listings/', {
        method: 'POST',
        body: params
    });

    const body = await response.json();
    const $ = cheerio.load(body.html);
    $('li.job_listing').each((i, el) => {
        const title = $(el).find('h3.job_listing-title').text().trim();
        const company = $(el).find('.job_listing-company strong').text().trim();
        const url = $(el).find('a').attr('href');
        console.log(`Title: ${title}, Company: ${company}, URL: ${url}`);
    });
}
testRPOC();
