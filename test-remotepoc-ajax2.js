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
    console.log("li count:", $('li').length);
    console.log("Classes on first li:", $('li').first().attr('class'));
}
testRPOC();
