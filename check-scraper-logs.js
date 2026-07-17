const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
    const logs = await prisma.scraperLog.findMany({
        where: { status: 'FAILURE' },
        orderBy: { createdAt: 'desc' },
        take: 5
    });
    console.log(logs.map(l => ({ name: l.scraperName, err: l.errorDetails })));
}
main().catch(console.error).finally(() => prisma.$disconnect());
