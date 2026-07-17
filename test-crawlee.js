require('ts-node').register();
const { scrapeIndeed, scrapeHimalayas } = require('./src/lib/scrapers/crawlee.ts');

async function main() {
    console.log("Testing Indeed...");
    const indeed = await scrapeIndeed("software", "remote");
    console.log(`Indeed returned ${indeed.length} jobs.`);
    if (indeed.length > 0) console.log(indeed[0]);

    console.log("\nTesting Himalayas...");
    const him = await scrapeHimalayas("software");
    console.log(`Himalayas returned ${him.length} jobs.`);
    if (him.length > 0) console.log(him[0]);
}

main().catch(console.error);
