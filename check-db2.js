const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
    const jobs = await prisma.job.findMany({
        where: { source: { in: ['WWR', 'WeWorkRemotely'] } },
        orderBy: { createdAt: 'desc' },
        take: 5
    });
    for (const j of jobs) {
        console.log(`\n--- ${j.title} ---`);
        console.log(`URL: ${j.url}`);
        console.log(`Desc length: ${j.description?.length}`);
        console.log(`Description preview: ${j.description?.substring(0, 100)}`);
        console.log(`Rejected: ${j.rejected}, Status: ${j.status}, isRelevant: ${j.isRelevant}`);
    }
}
main().catch(console.error).finally(() => prisma.$disconnect());
