const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
    const jobs = await prisma.job.findMany({
        where: { source: { in: ['kforce', 'remotepoc'] } },
        orderBy: { createdAt: 'desc' }
    });
    
    if(jobs.length === 0) return;
    
    const userJobs = await prisma.userJob.findMany({
        where: { jobId: { in: jobs.map(j => j.id) } }
    });
    console.log("UserJobs found:", userJobs.length);
}
main().catch(console.error).finally(() => prisma.$disconnect());
