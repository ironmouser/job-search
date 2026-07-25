import { prisma } from '../src/lib/prisma';

async function main() {
  console.log("Finding jobs with missing or short (<50 chars) descriptions...");

  const allJobs = await prisma.job.findMany({
    select: { id: true, title: true, company: true, description: true }
  });

  const targetJobIds = allJobs
    .filter(j => !j.description || j.description.trim().length <= 50)
    .map(j => j.id);

  console.log(`Found ${targetJobIds.length} jobs to remove.`);

  if (targetJobIds.length === 0) {
    console.log("No jobs with short/missing descriptions found.");
    return;
  }

  // Delete matching jobs (Cascades to UserJob, OpportunityScore, etc.)
  const result = await prisma.job.deleteMany({
    where: {
      id: { in: targetJobIds }
    }
  });

  console.log(`Successfully deleted ${result.count} jobs with missing/short descriptions from the database.`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
