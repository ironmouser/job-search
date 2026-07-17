const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
    const logs = await prisma.scraperLog.findMany({
        where: { scraperName: { startsWith: 'JSearch' } },
        orderBy: { createdAt: 'desc' },
        take: 3
    });
    console.log(logs.map(l => ({ name: l.scraperName, status: l.status, err: l.errorDetails, date: l.createdAt })));
}
main().catch(console.error).finally(() => prisma.$disconnect());
