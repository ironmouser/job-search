require('dotenv').config({ path: '.env.local' });
const { scrapeGlassdoor, scrapeRemotePOC, scrapeRemoteAggregators } = require('./src/lib/scrapers/crawlee.ts');

async function main() {
    console.log("Testing Glassdoor...");
    const gdJobs = await scrapeGlassdoor("software engineer", "remote");
    console.log(`Glassdoor returned ${gdJobs.length} jobs.`);

    console.log("Testing RemotePOC...");
    const rpocJobs = await scrapeRemotePOC("software engineer");
    console.log(`RemotePOC returned ${rpocJobs.length} jobs.`);

    console.log("Testing Remote Aggregators...");
    const aggJobs = await scrapeRemoteAggregators("software engineer", { 
        workingnomads: true, 
        remoteok: true, 
        remoteco: true 
    });
    console.log(`Remote Aggregators returned ${aggJobs.length} jobs.`);
}
main();
