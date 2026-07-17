const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
    const jobs = await prisma.job.findMany({
        where: { source: { in: ['WWR', 'WeWorkRemotely'] } },
        orderBy: { createdAt: 'desc' },
        take: 10
    });
    console.log(jobs.map(j => ({ id: j.id, title: j.title, url: j.url, descLength: j.description?.length })));
}
main().catch(console.error).finally(() => prisma.$disconnect());
