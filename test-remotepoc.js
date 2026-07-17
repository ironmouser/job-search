require('dotenv').config({ path: '.env.local' });
const cheerio = require('cheerio');

async function testRPOC() {
    console.log("Fetching remotepoc...");
    const res = await fetch("https://remotepoc.com/jobs");
    const html = await res.text();
    const $ = cheerio.load(html);
    
    console.log("Status:", res.status);
    console.log("Job listings (.job-card, .job, etc):");
    console.log("  .job-card:", $('.job-card').length);
    console.log("  .job-listing:", $('.job-listing').length);
    console.log("  .job:", $('.job').length);
    console.log("  a tags containing 'job':", $('a[href*="job"]').length);
    
    // Dump a snippet of body
    console.log(html.substring(0, 300));
}
testRPOC();
