const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
    const jobs = await prisma.job.findMany({
        where: { url: { contains: 'remotepoc.com' } }
    });
    console.log(jobs.map(j => ({ id: j.id, title: j.title })));
}
main().catch(console.error).finally(() => prisma.$disconnect());
