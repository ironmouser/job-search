import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { scrapeGlassdoor, scrapeIndeed, scrapeRemotePOC, scrapeCustomPages } from './src/lib/scrapers/crawlee';

async function main() {
    console.log("Testing Glassdoor...");
    const gdJobs = await scrapeGlassdoor("software engineer", "remote");
    console.log(`Glassdoor: ${gdJobs.length} jobs`);

    console.log("Testing Indeed...");
    const indeedJobs = await scrapeIndeed("software engineer", "remote");
    console.log(`Indeed: ${indeedJobs.length} jobs`);

    console.log("Testing RemotePOC...");
    const rpocJobs = await scrapeRemotePOC("software engineer");
    console.log(`RemotePOC: ${rpocJobs.length} jobs`);

    console.log("Testing Lever...");
    const leverJobs = await scrapeCustomPages(["https://jobs.lever.co/anthropic"]);
    console.log(`Lever: ${leverJobs.length} jobs`);
    
    console.log("Testing Greenhouse...");
    const greenhouseJobs = await scrapeCustomPages(["https://boards.greenhouse.io/anthropic"]);
    console.log(`Greenhouse: ${greenhouseJobs.length} jobs`);
}
main();
