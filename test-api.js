async function testKforce() {
    console.log("--- Kforce ---");
    try {
        const res = await fetch('https://kforcewebeast.search.windows.net/indexes/kforcewebjobentity/docs/search?api-version=2016-09-01', {
            method: 'POST',
            headers: {
                'api-key': '1603E4DC4C87A8E41D6BBDE4EEA4EFB7',
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                count: true,
                select: "Industry, Title, Id, PostDate, Responsibilities, Skills, City, State, Zip, SalaryMin, SalaryMax, SalaryText, ReferenceCode, TypeCode, VisaSponsorshipJob, ApplyUrl",
                search: "software",
                top: 5
            })
        });
        const body = await res.json();
        if (body.value) {
            body.value.forEach(j => {
                let location = [j.City, j.State, j.Zip].filter(Boolean).join(', ');
                console.log(`Title: ${j.Title}, Location: ${location}`);
            });
        } else {
            console.log(body);
        }
    } catch (e) { console.error(e); }
}

async function testRemotePOC() {
    console.log("\n--- RemotePOC ---");
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
            console.log("Got HTML. Length:", body.html.length);
        } else {
            console.log(body);
        }
    } catch (e) { console.error(e); }
}

Promise.all([testKforce(), testRemotePOC()]);
