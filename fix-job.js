require('ts-node').register({ transpileOnly: true });
const { PrismaClient } = require('@prisma/client');
const { scoreJob } = require('./src/lib/scoring.ts');
require('dotenv').config({ path: '.env.local' });

const prisma = new PrismaClient();

async function main() {
    const jobId = '34bf209b-c8ed-47ef-895b-f1bfef726704';
    const job = await prisma.job.findUnique({
        where: { id: jobId },
        include: { userJobs: true }
    });

    if (!job) {
        console.log('Job not found!');
        return;
    }

    if (job.userJobs.length === 0) {
        console.log('No user associated with this job.');
        return;
    }

    const userId = job.userJobs[0].userId;
    console.log(`Scoring job ${jobId} for user ${userId}...`);

    try {
        const score = await scoreJob(userId, job.id, job.title, job.description || '');
        console.log('Scored successfully!');
        console.log(score);
    } catch (e) {
        console.error('Error scoring:', e);
    }
}

main()
  .catch(e => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
