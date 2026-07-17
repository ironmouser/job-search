import * as cheerio from 'cheerio';

async function scrapeRemotePOC(keyword) {
    const jobs = [];
    try {
        const params = new URLSearchParams();
        params.append('search_keywords', keyword);
        params.append('per_page', '50');
        params.append('orderby', 'featured');
        params.append('order', 'DESC');
        
        const response = await fetch('https://remotepoc.com/jm-ajax/get_listings/', {
            method: 'POST',
            body: params
        });

        const body = await response.json();
        if (body && body.html) {
            const $ = cheerio.load(body.html);
            $('li.job_listing').each((i, el) => {
                const title = $(el).find('h3.job_listing-title').text().trim();
                const company = $(el).find('.job_listing-company strong').text().trim();
                const location = $(el).find('.job_listing-location').text().trim();
                const url = $(el).find('a').attr('href');
                if (title && url && title !== 'Unknown Role') {
                    jobs.push({
                        title,
                        company: company || 'RemotePOC Company',
                        location: location || 'Remote',
                        url
                    });
                }
            });
        }
    } catch (e) {
        console.error("RemotePOC Scrape Error:", e);
    }
    return jobs;
}

async function scrapeKforce(keyword) {
    const jobs = [];
    try {
        const response = await fetch(`https://www.kforce.com/api/jobs/search?Keyword=${encodeURIComponent(keyword)}&Location=&IsRemote=true&Radius=50&SortBy=Relevance&PageSize=50&Page=1`, {
            headers: {
                'Accept': 'application/json, text/plain, */*',
                'User-Agent': 'Mozilla/5.0'
            }
        });
        const data = await response.json();
        if (data && data.Results) {
            const jobsList = data.Results;
            if (jobsList && Array.isArray(jobsList)) {
                for (const job of jobsList) {
                    const url = `https://www.kforce.com/jobs/${job.JobId}/`;
                    let location = job.Location || 'Remote';
                    if (job.Remote && !location.toLowerCase().includes('remote')) {
                        location = 'Remote (' + location + ')';
                    }
                    const salary = (job.PayRateMin && job.PayRateMax) ? `$${job.PayRateMin} - $${job.PayRateMax}` : null;
                    jobs.push({
                        title: job.Title,
                        company: "Kforce",
                        location,
                        url,
                        salary
                    });
                }
            }
        }
    } catch (e) {
        console.error("Kforce Scrape Error:", e);
    }
    return jobs;
}

async function main() {
    console.log('--- Empty Keyword ---');
    let poc = await scrapeRemotePOC('');
    console.log('POC empty keyword length:', poc?.length);
    if(poc?.length) console.log(poc[0]);
    
    let kforce = await scrapeKforce('');
    console.log('Kforce empty keyword length:', kforce?.length);
    if(kforce?.length) console.log(kforce[0]);
    
    console.log('--- Keyword: software ---');
    poc = await scrapeRemotePOC('software');
    console.log('POC empty keyword length:', poc?.length);
    if(poc?.length) console.log(poc[0]);
    
    kforce = await scrapeKforce('software');
    console.log('Kforce empty keyword length:', kforce?.length);
    if(kforce?.length) console.log(kforce[0]);
}
main().catch(console.error);
