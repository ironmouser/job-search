import { PrismaClient } from '@prisma/client';
import { scoreJob } from '../src/lib/scoring';

const prisma = new PrismaClient();

async function main() {
    const email = 'kurt@ordermantis.com';
    const user = await prisma.user.findFirst({
        where: { email: { equals: email, mode: 'insensitive' } }
    });

    if (!user) {
        console.error(`User ${email} not found.`);
        process.exit(1);
    }

    console.log(`Querying unscored jobs for user ${user.name} (${user.email})...`);

    const unscoredUserJobs = await prisma.userJob.findMany({
        where: {
            userId: user.id,
            job: {
                opportunityScores: {
                    none: { userId: user.id }
                }
            }
        },
        include: {
            job: {
                select: { id: true, title: true, company: true, description: true }
            }
        }
    });

    console.log(`Found ${unscoredUserJobs.length} unscored jobs for ${user.email}.`);

    if (unscoredUserJobs.length === 0) {
        console.log("All jobs are already scored!");
        return;
    }

    let scoredCount = 0;
    let failCount = 0;

    for (let i = 0; i < unscoredUserJobs.length; i++) {
        const uj = unscoredUserJobs[i];
        const job = uj.job;
        console.log(`[${i + 1}/${unscoredUserJobs.length}] Scoring: "${job.title}" at "${job.company}"...`);

        try {
            const score = await scoreJob(user.id, job.id, job.title, job.description || '');
            console.log(`  -> SUCCESS! Total Score: ${score.total_score}`);
            scoredCount++;
        } catch (err: any) {
            console.error(`  -> ERROR: ${err.message}`);
            failCount++;
        }

        // Add a 4.5 second delay between jobs to stay safely under the Gemini 15 RPM limit
        if (i < unscoredUserJobs.length - 1) {
            console.log(`  -> Pausing for 4.5 seconds to avoid Gemini rate limits...`);
            await new Promise(resolve => setTimeout(resolve, 4500));
        }
    }

    console.log(`\n========================================`);
    console.log(`SCORING SUMMARY:`);
    console.log(`  Successfully scored: ${scoredCount}`);
    console.log(`  Failed: ${failCount}`);
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
