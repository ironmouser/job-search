require('dotenv').config({ path: '.env.local' });
const proxyUrl = `http://api.scrape.do?token=${process.env.SCRAPEDO_API_KEY}&super=true&url=`;

async function testZipRecruiter() {
    try {
        const url = encodeURIComponent(`https://www.ziprecruiter.com/jobs-search?search=software&location=remote`);
        const res = await fetch(proxyUrl + url);
        const text = await res.text();
        console.log(`ZipRecruiter HTTP ${res.status}. Size: ${text.length}`);
        const hasJobs = text.includes("jobList") || text.includes("job_list") || text.includes("JobPosting");
        console.log(`ZipRecruiter has jobs JSON/DOM: ${hasJobs}`);
    } catch(e) { console.error("ZipRecruiter error", e); }
}

testZipRecruiter();
