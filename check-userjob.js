const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
    const userJobs = await prisma.userJob.findMany({
        include: { job: true },
        where: { job: { source: { in: ['WWR', 'WeWorkRemotely'] } } }
    });
    console.log(userJobs.map(uj => ({ userId: uj.userId, title: uj.job.title, createdAt: uj.createdAt })));
}
main().catch(console.error).finally(() => prisma.$disconnect());
