import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const email = 'kurt.charles@gmail.com';
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const user = await prisma.user.findFirst({
        where: {
            email: { equals: email, mode: 'insensitive' }
        }
    });

    if (!user) {
        console.error(`User with email ${email} not found in database.`);
        process.exit(1);
    }

    console.log(`Found user: ${user.name || 'User'} (${user.email}) [ID: ${user.id}]`);
    console.log(`Filtering for jobs scraped/added TODAY (${startOfToday.toISOString().split('T')[0]})...`);

    // 1. Get UserJobs created today or linked to jobs created today
    const userJobsToday = await prisma.userJob.findMany({
        where: {
            userId: user.id,
            OR: [
                { createdAt: { gte: startOfToday } },
                { job: { createdAt: { gte: startOfToday } } }
            ]
        },
        select: { id: true, jobId: true }
    });

    const userJobIds = userJobsToday.map(uj => uj.jobId);

    const addedJobsToday = await prisma.job.findMany({
        where: {
            addedById: user.id,
            createdAt: { gte: startOfToday }
        },
        select: { id: true }
    });

    const allTargetJobIds = Array.from(new Set([...userJobIds, ...addedJobsToday.map(j => j.id)]));
    console.log(`Total unique jobs added today targeted for deletion: ${allTargetJobIds.length}`);

    if (allTargetJobIds.length === 0) {
        console.log("No jobs found added today for this user.");
        return;
    }

    // Delete UserJob records created today for target jobs
    const deletedUserJobs = await prisma.userJob.deleteMany({
        where: {
            userId: user.id,
            jobId: { in: allTargetJobIds }
        }
    });
    console.log(`Deleted ${deletedUserJobs.count} UserJob records from today.`);

    // Delete OpportunityScores for user for today's jobs
    const deletedScores = await prisma.opportunityScore.deleteMany({
        where: {
            userId: user.id,
            jobId: { in: allTargetJobIds }
        }
    });
    console.log(`Deleted ${deletedScores.count} OpportunityScore records.`);

    // Delete ApplicationAssets for user for today's jobs
    const deletedAssets = await prisma.applicationAsset.deleteMany({
        where: {
            userId: user.id,
            jobId: { in: allTargetJobIds }
        }
    });
    console.log(`Deleted ${deletedAssets.count} ApplicationAsset records.`);

    // Delete JobFeedbacks for user for today's jobs
    const deletedFeedbacks = await prisma.jobFeedback.deleteMany({
        where: {
            userId: user.id,
            jobId: { in: allTargetJobIds }
        }
    });
    console.log(`Deleted ${deletedFeedbacks.count} JobFeedback records.`);

    // Delete AutoApplySessions for user for today's jobs
    const deletedAutoApply = await prisma.autoApplySession.deleteMany({
        where: {
            userId: user.id,
            jobId: { in: allTargetJobIds }
        }
    });
    console.log(`Deleted ${deletedAutoApply.count} AutoApplySession records.`);

    // Delete Jobs created today that are no longer referenced by any other user or were added by this user
    let deletedJobsCount = 0;
    for (const jobId of allTargetJobIds) {
        const otherUserJobs = await prisma.userJob.count({
            where: { jobId, userId: { not: user.id } }
        });

        if (otherUserJobs === 0) {
            try {
                await prisma.job.delete({
                    where: { id: jobId }
                });
                deletedJobsCount++;
            } catch (e: any) {
                // Ignore if already deleted
            }
        }
    }

    console.log(`\n========================================`);
    console.log(`TODAY'S DELETION SUMMARY FOR ${email}:`);
    console.log(`  UserJobs deleted (today): ${deletedUserJobs.count}`);
    console.log(`  OpportunityScores deleted: ${deletedScores.count}`);
    console.log(`  ApplicationAssets deleted: ${deletedAssets.count}`);
    console.log(`  Jobs deleted (today): ${deletedJobsCount}`);
    console.log(`========================================`);
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
