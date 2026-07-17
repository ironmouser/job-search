const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
    const deletedCache = await prisma.scrapeCache.deleteMany({});
    console.log(`Deleted ${deletedCache.count} scrape cache entries.`);
    const deletedJobs = await prisma.job.deleteMany({
        where: { title: 'Unknown Role' }
    });
    console.log(`Deleted ${deletedJobs.count} bad jobs.`);
}
main().catch(console.error).finally(() => prisma.$disconnect());
