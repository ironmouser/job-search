import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    // 1. Find user Kurt Charles
    const user = await prisma.user.findFirst({
        where: {
            OR: [
                { email: { contains: 'kurt', mode: 'insensitive' } },
                { name: { contains: 'Kurt', mode: 'insensitive' } }
            ]
        }
    });

    console.log(`Found user: ${user ? `${user.name} (${user.email}) [ID: ${user.id}]` : 'Not Found'}`);

    const jobsToday = await prisma.job.findMany({
        where: {
            createdAt: {
                gte: startOfToday
            }
        },
        select: {
            id: true,
            title: true,
            company: true,
            description: true,
            createdAt: true,
            addedById: true,
            userJobs: {
                select: { userId: true }
            }
        }
    });

    const stubJobsToday = jobsToday.filter(j => {
        const desc = (j.description || '').trim();
        return (
            !desc ||
            desc.length < 250 ||
            desc.toLowerCase().startsWith('apply at:') ||
            /position at/i.test(desc) ||
            /found via email/i.test(desc)
        );
    });

    if (!user) {
        console.log(`Total jobs added today: ${jobsToday.length}`);
        console.log(`Total stub jobs today: ${stubJobsToday.length}`);
        return;
    }

    const kurtStubJobs = stubJobsToday.filter(j => 
        j.addedById === user.id || j.userJobs.some(uj => uj.userId === user.id)
    );

    const kurtAllJobsToday = jobsToday.filter(j => 
        j.addedById === user.id || j.userJobs.some(uj => uj.userId === user.id)
    );

    console.log(`\n========================================`);
    console.log(`TODAY'S BREAKDOWN FOR ${user.name || user.email}:`);
    console.log(`  Total jobs in DB added today: ${jobsToday.length}`);
    console.log(`  Total stub jobs in DB added today: ${stubJobsToday.length}`);
    console.log(`  Jobs for ${user.email} added today: ${kurtAllJobsToday.length}`);
    console.log(`  Stub jobs for ${user.email} added today: ${kurtStubJobs.length}`);
    console.log(`========================================\n`);

    if (kurtStubJobs.length > 0) {
        console.log(`Sample stub jobs for ${user.email}:`);
        kurtStubJobs.slice(0, 10).forEach((job, idx) => {
            console.log(`  ${idx + 1}. "${job.title}" at "${job.company}"`);
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
