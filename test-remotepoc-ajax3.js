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
    console.log("Title h3.job_listing-title:", el.find('h3.job_listing-title').text().trim());
    console.log("Title h3:", el.find('h3').text().trim());
    console.log("Company .job_listing-company strong:", el.find('.job_listing-company strong').text().trim());
    console.log("Company .job_listing-company:", el.find('.job_listing-company').text().trim());
}
testRPOC();
