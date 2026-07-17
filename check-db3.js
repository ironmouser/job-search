const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
    const jobs = await prisma.job.findMany({
        where: { source: { in: ['WWR', 'WeWorkRemotely'] } },
        orderBy: { createdAt: 'desc' },
        take: 5
    });
    console.log(jobs.map(j => ({ id: j.id, title: j.title, status: j.status, userId: j.userId, hidden: j.hidden })));
}
main().catch(console.error).finally(() => prisma.$disconnect());
