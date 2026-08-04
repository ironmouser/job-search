import cheerio from 'cheerio';

async function testAll() {
    console.log('=== TESTING INTERNATIONAL SCRAPERS ===\n');

    // 1. Arbeitnow
    try {
        console.log('Testing Arbeitnow...');
        const res = await fetch('https://www.arbeitnow.com/api/job-board-api?search=engineer');
        console.log('Arbeitnow status:', res.status);
        if (res.ok) {
            const data = await res.json();
            console.log('Arbeitnow count:', data.data?.length || 0);
        }
    } catch (e: any) {
        console.log('Arbeitnow error:', e.message);
    }

    // 2. Arbeitsagentur
    try {
        console.log('\nTesting Arbeitsagentur (DE)...');
        const url = 'https://rest.arbeitsagentur.de/jobboerse/jobsuche-service/pc/v4/jobs?was=engineer&angebotsart=1&page=1&size=25';
        const res = await fetch(url, {
            headers: {
                'X-API-Key': 'jobboerse-jobsuche',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'application/json'
            }
        });
        console.log('Arbeitsagentur status:', res.status);
        if (res.ok) {
            const data = await res.json();
            console.log('Arbeitsagentur count:', data.stellenangebote?.length || 0);
        } else {
            console.log('Arbeitsagentur body:', await res.text());
        }
    } catch (e: any) {
        console.log('Arbeitsagentur error:', e.message);
    }

    // 3. The Muse
    try {
        console.log('\nTesting The Muse...');
        const url = 'https://www.themuse.com/api/public/jobs?page=1&descending=true';
        const res = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
                'Accept': 'application/json'
            }
        });
        console.log('The Muse status:', res.status);
        if (res.ok) {
            const data = await res.json();
            console.log('The Muse count:', data.results?.length || 0);
        }
    } catch (e: any) {
        console.log('The Muse error:', e.message);
    }

    // 4. Computrabajo (LATAM) via Scrape.do
    try {
        console.log('\nTesting Computrabajo (LATAM)...');
        const url = 'https://mx.computrabajo.com/trabajo-de-engineer';
        const token = process.env.SCRAPEDO_API_KEY;
        const proxyUrl = token ? `http://api.scrape.do?token=${token}&super=true&url=${encodeURIComponent(url)}` : url;
        const res = await fetch(proxyUrl);
        console.log('Computrabajo status:', res.status);
        if (res.ok) {
            const html = await res.text();
            const $ = cheerio.load(html);
            const items = $('a[href*="/oferta-de-trabajo"]').length;
            console.log('Computrabajo items found:', items);
        }
    } catch (e: any) {
        console.log('Computrabajo error:', e.message);
    }

    // 5. Job Bank (Canada) via Scrape.do
    try {
        console.log('\nTesting Job Bank (CA)...');
        const url = 'https://www.jobbank.gc.ca/jobsearch/jobsearch?searchstring=engineer&sort=M';
        const token = process.env.SCRAPEDO_API_KEY;
        const proxyUrl = token ? `http://api.scrape.do?token=${token}&url=${encodeURIComponent(url)}` : url;
        const res = await fetch(proxyUrl);
        console.log('Job Bank status:', res.status);
        if (res.ok) {
            const html = await res.text();
            const $ = cheerio.load(html);
            const items = $('a[href*="jobposting"]').length;
            console.log('Job Bank items found:', items);
        }
    } catch (e: any) {
        console.log('Job Bank error:', e.message);
    }
}

testAll();
