async function testKforce() {
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
                select: "*", // Get all fields to see what's available
                search: "software",
                top: 2
            })
        });
        const body = await res.json();
        console.log(body.value[0]);
    } catch (e) { console.error(e); }
}
testKforce();
