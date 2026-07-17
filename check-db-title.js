const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
    const jobs = await prisma.job.findMany({
        where: { title: 'Product Manager' },
        orderBy: { createdAt: 'desc' },
        take: 5
    });
    console.log(jobs.map(j => ({ id: j.id, title: j.title, source: j.source, loc: j.location, createdAt: j.createdAt })));
}
main().catch(console.error).finally(() => prisma.$disconnect());
