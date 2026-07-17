require('ts-node').register();
const { scrapeRemotePOC, scrapeKforce } = require('./src/lib/scrapers/crawlee.ts');

async function main() {
    const poc = await scrapeRemotePOC('');
    console.log('POC empty keyword length:', poc?.length);
    
    const kforce = await scrapeKforce('');
    console.log('Kforce empty keyword length:', kforce?.length);
}
main().catch(console.error);
