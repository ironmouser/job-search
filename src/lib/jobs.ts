import { prisma } from './prisma';
import { getUserSettings } from './settings';
import { reformatJobDescriptionWithGemini } from './formatter';
import { cleanJobUrl } from './urlUtils';

export async function normalizeAndSaveJobs(rawJobs: any[], userId: string) {
    if (!rawJobs || rawJobs.length === 0) return [];
    const settings: any = await getUserSettings(userId);
    const remoteOnly = settings.remoteOnly || false;

    let normalizedJobs = rawJobs.map((job) => {
        const title = job.title?.trim() || 'Untitled Position';
        const company = job.company?.trim() || 'Unknown Company';
        const fallbackDesc = `Job listing for ${title} at ${company}. Click link to view full details and application page: ${job.url || ''}`;
        const description = (job.description && job.description.trim().length > 0) ? job.description.trim() : fallbackDesc;

        return {
            title,
            company,
            location: job.location || 'Remote',
            salaryRange: job.salary_range || job.salary || null,
            description,
            requirements: null,
            url: job.url,
            source: job.source || 'Direct',
        };
    }).filter(j => j.url && j.title);

    if (remoteOnly) {
        normalizedJobs = normalizedJobs.filter(j => (j.location || '').toLowerCase().includes('remote'));
    }

    const processedUrls: string[] = [];

    for (const jobData of normalizedJobs) {
      const cleanedUrl = cleanJobUrl(jobData.url);
      if (processedUrls.includes(cleanedUrl)) continue;
      processedUrls.push(cleanedUrl);

      let job = await prisma.job.findUnique({ where: { url: cleanedUrl } });
      if (!job) {
          job = await prisma.job.create({
              data: {
                  title: jobData.title,
                  company: jobData.company,
                  location: jobData.location,
                  salaryRange: jobData.salaryRange,
                  description: jobData.description,
                  url: cleanedUrl,
                  source: jobData.source,
              }
          });
      } else if (!job.description || job.description.trim().length === 0) {
          await prisma.job.update({
              where: { id: job.id },
              data: { description: jobData.description }
          });
      }
      
      await prisma.userJob.upsert({
          where: { userId_jobId: { userId, jobId: job.id } },
          update: {
              status: 'discovered',
              createdAt: new Date()
          },
          create: {
              userId,
              jobId: job.id,
              status: 'discovered'
          }
      });
    }
    
    const data = await prisma.job.findMany({
        where: { url: { in: processedUrls } }
    });
    
    console.log(`Successfully processed ${data?.length || 0} jobs for user ${userId}.`);
    return data;
}
