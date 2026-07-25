import { prisma } from '../src/lib/prisma';

async function main() {
  const allUserJobs = await prisma.userJob.findMany({
    include: { job: true }
  });

  const shortDescJobs = allUserJobs.filter(uj => !uj.job.description || uj.job.description.trim().length <= 50);

  console.log(`Total user jobs in DB: ${allUserJobs.length}`);
  console.log(`User jobs with missing or short (<50 char) descriptions: ${shortDescJobs.length}`);

  for (const uj of shortDescJobs.slice(0, 10)) {
    console.log(`- ID: ${uj.job.id} | Title: ${uj.job.title} | Company: ${uj.job.company} | Desc length: ${uj.job.description ? uj.job.description.trim().length : 0}`);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
