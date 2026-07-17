import * as cheerio from 'cheerio';
async function scrapeRemotePOC(keyword) {
    const jobs = [];
    const params = new URLSearchParams();
    params.append('search_keywords', keyword);
    params.append('per_page', '50');
    const response = await fetch('https://remotepoc.com/jm-ajax/get_listings/', {
        method: 'POST',
        body: params
    });
    const body = await response.json();
    if (body && body.html) {
        const $ = cheerio.load(body.html);
        $('li.job_listing').each((i, el) => {
            const title = $(el).find('h3.job_listing-title').text().trim();
            const url = $(el).find('a').attr('href');
            if (title && url) jobs.push(title);
        });
    }
    return jobs;
}
scrapeRemotePOC('Senior Product Manager').then(j => console.log('Found:', j.length, j.slice(0,2))).catch(console.error);
