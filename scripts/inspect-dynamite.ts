import * as cheerio from 'cheerio';

async function testDynamite() {
    console.log("Fetching Dynamite Jobs search page...");
    const url = "https://dynamitejobs.com/remote-jobs?query=Sr.+Product+Manager";
    try {
        const res = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
            }
        });

        console.log(`Status: ${res.status}`);
        const html = await res.text();
        console.log(`HTML length: ${html.length}`);

        const $ = cheerio.load(html);

        // Check for JSON-LD, script data, or HTML job cards
        let jsonLdItems: any[] = [];
        $('script[type="application/ld+json"]').each((_, el) => {
            try {
                const parsed = JSON.parse($(el).html() || '');
                if (Array.isArray(parsed)) jsonLdItems.push(...parsed);
                else jsonLdItems.push(parsed);
            } catch {}
        });

        console.log(`JSON-LD items found: ${jsonLdItems.length}`);
        jsonLdItems.forEach((item, i) => {
            if (item['@type'] === 'JobPosting') {
                console.log(`JSON-LD Job ${i + 1}: ${item.title} at ${item.hiringOrganization?.name} -> ${item.url || item.description?.substring(0, 50)}`);
            }
        });

        // Search links in DOM
        const links: { title: string; href: string }[] = [];
        $('a[href*="/job/"]').each((_, el) => {
            const href = $(el).attr('href') || '';
            const title = $(el).text().trim();
            if (href && !links.some(l => l.href === href)) {
                const fullHref = href.startsWith('http') ? href : `https://dynamitejobs.com${href}`;
                links.push({ title, href: fullHref });
            }
        });

        console.log(`DOM Job links found: ${links.length}`);
        links.slice(0, 10).forEach((l, i) => {
            console.log(`  ${i + 1}. [${l.title.replace(/\s+/g, ' ')}] -> ${l.href}`);
        });

        // Also check if there's any Next.js __NEXT_DATA__ or Nuxt data script
        const nextDataScript = $('#__NEXT_DATA__').html();
        if (nextDataScript) {
            console.log(`Found __NEXT_DATA__ script (${nextDataScript.length} chars)`);
        }

    } catch (e: any) {
        console.error("Error fetching dynamitejobs:", e);
    }
}

testDynamite();
