import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log("Checking database for jobs with stub or short descriptions...");

    const allJobs = await prisma.job.findMany({
        select: { id: true, title: true, company: true, url: true, description: true }
    });

    const stubJobs = allJobs.filter(j => {
        const desc = (j.description || '').trim();
        return (
            !desc ||
            desc.length < 250 ||
            desc.toLowerCase().startsWith('apply at:') ||
            /position at/i.test(desc) ||
            /found via email/i.test(desc)
        );
    });

    console.log(`\n========================================`);
    console.log(`DATABASE SUMMARY:`);
    console.log(`  Total jobs in DB: ${allJobs.length}`);
    console.log(`  Jobs with stub/short descriptions: ${stubJobs.length}`);
    console.log(`========================================\n`);

    if (stubJobs.length > 0) {
        console.log(`Sample stub jobs:`);
        stubJobs.slice(0, 10).forEach((job, idx) => {
            console.log(`  ${idx + 1}. "${job.title}" at "${job.company}" (${(job.description || '').length} chars)`);
            console.log(`     URL: ${job.url}`);
            console.log(`     Current desc: "${(job.description || '').replace(/\n/g, ' ')}"`);
        });
    }
}

main()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });

export {};
