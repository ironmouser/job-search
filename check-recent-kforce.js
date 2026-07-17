const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
    const jobs = await prisma.job.findMany({
        where: {
            source: { in: ['kforce', 'remotepoc'] }
        },
        orderBy: { createdAt: 'desc' }
    });
    console.log("Found jobs:", jobs.length);
    if (jobs.length > 0) {
        console.log(jobs.map(j => ({ id: j.id, title: j.title, source: j.source, loc: j.location, createdAt: j.createdAt })));
    }
}
main().catch(console.error).finally(() => prisma.$disconnect());
