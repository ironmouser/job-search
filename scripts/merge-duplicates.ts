import { PrismaClient } from '@prisma/client';
import { cleanJobUrl } from '../src/lib/urlUtils';

const prisma = new PrismaClient();

async function mergeDuplicates() {
  console.log('Fetching all jobs...');
  const jobs = await prisma.job.findMany({
    include: {
      userJobs: true,
      opportunityScores: true,
      applicationAssets: true,
      jobFeedbacks: true,
      autoApplySessions: true,
    }
  });

  const jobsByCleanUrl = new Map<string, typeof jobs>();

  for (const job of jobs) {
    const cleanedUrl = cleanJobUrl(job.url);
    if (!jobsByCleanUrl.has(cleanedUrl)) {
      jobsByCleanUrl.set(cleanedUrl, []);
    }
    jobsByCleanUrl.get(cleanedUrl)!.push(job);
  }

  let mergedCount = 0;
  let deletedCount = 0;

  for (const [cleanedUrl, duplicateJobs] of jobsByCleanUrl.entries()) {
    if (duplicateJobs.length > 1) {
      // Sort by oldest first, we'll keep the oldest one
      duplicateJobs.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
      const keptJob = duplicateJobs[0];
      const duplicatesToDelete = duplicateJobs.slice(1);

      console.log(`Found ${duplicatesToDelete.length} duplicates for ${cleanedUrl}`);

      for (const duplicate of duplicatesToDelete) {
        // Re-assign or delete UserJobs
        for (const userJob of duplicate.userJobs) {
          const existing = keptJob.userJobs.find(uj => uj.userId === userJob.userId);
          if (existing) {
             // Already have a userJob for the kept job, delete the duplicate one
             await prisma.userJob.delete({ where: { id: userJob.id } });
          } else {
             await prisma.userJob.update({
               where: { id: userJob.id },
               data: { jobId: keptJob.id }
             });
             keptJob.userJobs.push({...userJob, jobId: keptJob.id});
          }
        }

        // Do the same for opportunityScores, applicationAssets, jobFeedbacks, autoApplySessions
        // (Simplified for brevity: delete duplicates to avoid unique constraint violations on userId_jobId)
        
        for (const score of duplicate.opportunityScores) {
           const existing = await prisma.opportunityScore.findUnique({ where: { userId_jobId: { userId: score.userId!, jobId: keptJob.id } } });
           if (existing) {
              await prisma.opportunityScore.delete({ where: { id: score.id } });
           } else {
              await prisma.opportunityScore.update({ where: { id: score.id }, data: { jobId: keptJob.id } });
           }
        }

        for (const asset of duplicate.applicationAssets) {
           const existing = await prisma.applicationAsset.findUnique({ where: { userId_jobId: { userId: asset.userId!, jobId: keptJob.id } } });
           if (existing) {
              await prisma.applicationAsset.delete({ where: { id: asset.id } });
           } else {
              await prisma.applicationAsset.update({ where: { id: asset.id }, data: { jobId: keptJob.id } });
           }
        }

        for (const feedback of duplicate.jobFeedbacks) {
           const existing = await prisma.jobFeedback.findUnique({ where: { userId_jobId: { userId: feedback.userId!, jobId: keptJob.id } } });
           if (existing) {
              await prisma.jobFeedback.delete({ where: { id: feedback.id } });
           } else {
              await prisma.jobFeedback.update({ where: { id: feedback.id }, data: { jobId: keptJob.id } });
           }
        }
        
        for (const session of duplicate.autoApplySessions) {
           // AutoApplySessions don't have a unique constraint on userId_jobId, so we can just reassign
           await prisma.autoApplySession.update({ where: { id: session.id }, data: { jobId: keptJob.id } });
        }

        // Finally, delete the duplicate job
        await prisma.job.delete({ where: { id: duplicate.id } });
        deletedCount++;
      }
      mergedCount++;
      
      // Update kept job url if needed
      if (keptJob.url !== cleanedUrl) {
         try {
             await prisma.job.update({ where: { id: keptJob.id }, data: { url: cleanedUrl } });
         } catch(e) {
             console.log("Could not update url of kept job, might be because another job already has it", e);
         }
      }
    }
  }

  console.log(`Finished merging. Merged ${mergedCount} job groups, deleted ${deletedCount} duplicate jobs.`);
}

mergeDuplicates()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
