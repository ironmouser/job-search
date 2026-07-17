const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
    const jobs = await prisma.job.findMany({
        where: { source: { in: ['remotepoc', 'kforce'] } },
        orderBy: { createdAt: 'desc' },
        take: 10
    });
    console.log(jobs.map(j => ({ title: j.title, source: j.source, loc: j.location, createdAt: j.createdAt })));
}
main().catch(console.error).finally(() => prisma.$disconnect());
