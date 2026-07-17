import { gotScraping } from 'got-scraping';

async function testWorkingNomadsAPI() {
    console.log("WorkingNomads API Job structure:");
    try {
        const res = await gotScraping({ url: 'https://www.workingnomads.com/api/exposed_jobs/', responseType: 'json', throwHttpErrors: false });
        if (res.body && res.body.length > 0) {
            console.log(JSON.stringify(res.body[0], null, 2));
        }
    } catch(e) { console.error("Error:", e.message); }
}

async function testRemoteOKAPI() {
    console.log("\nTesting RemoteOK API no tags...");
    try {
        const res = await gotScraping({ url: 'https://remoteok.com/api', responseType: 'json', throwHttpErrors: false });
        console.log("RemoteOK API no tags length:", res.body.length);
        if (res.body.length > 1) {
            console.log("RemoteOK API job keys:", Object.keys(res.body[1]));
        }
    } catch(e) { console.error("Error:", e.message); }
}

async function testRemoteCoHTML() {
    console.log("\nTesting Remote.co HTML...");
    try {
        const res = await gotScraping({ url: 'https://remote.co/remote-jobs/search/?search_keywords=developer', throwHttpErrors: false });
        console.log("Remote.co HTML snippet:", res.body.toString().substring(0, 300));
        if (res.body.toString().includes('Cloudflare') || res.body.toString().includes('Just a moment')) {
            console.log("Remote.co is blocked by Cloudflare.");
        }
    } catch(e) { console.error("Error:", e.message); }
}

await testWorkingNomadsAPI();
await testRemoteOKAPI();
await testRemoteCoHTML();
