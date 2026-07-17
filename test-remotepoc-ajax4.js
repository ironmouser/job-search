const cheerio = require('cheerio');
async function testRPOC() {
    const params = new URLSearchParams();
    params.append('search_keywords', 'software engineer');
    
    const response = await fetch('https://remotepoc.com/jm-ajax/get_listings/', {
        method: 'POST',
        body: params
    });

    const body = await response.json();
    const $ = cheerio.load(body.html);
    const el = $('li.job_listing').first();
    console.log("Location .job_listing-location:", el.find('.job_listing-location').text().trim());
    console.log("URL a href:", el.find('a').attr('href'));
}
testRPOC();
