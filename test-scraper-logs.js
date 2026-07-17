const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const logs = await prisma.scraperLog.findMany({
        orderBy: { createdAt: 'desc' },
        take: 15
    });
    for (const log of logs) {
        console.log(`${log.scraperName}: ${log.resultsCount} jobs. URL: ${log.targetUrl}`);
    }
}
main();
