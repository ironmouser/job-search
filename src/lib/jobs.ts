import { prisma } from './prisma';
import { getUserSettings } from './settings';
import { reformatJobDescriptionWithGemini } from './formatter';
import { cleanJobUrl } from './urlUtils';

export async function normalizeAndSaveJobs(rawJobs: any[], userId: string) {
    if (!rawJobs || rawJobs.length === 0) return [];
    const settings: any = await getUserSettings(userId);
    const remoteOnly = settings.remoteOnly || false;

    let normalizedJobs = rawJobs.map((job) => ({
        title: job.title,
        company: job.company,
        location: job.location || 'Remote',
        salaryRange: job.salary_range || null,
        description: job.description || '',
        requirements: null,
        url: job.url,
        source: job.source || 'Direct',
    })).filter(j => j.url && j.title);

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
          let formattedDesc = jobData.description;
          if (formattedDesc && formattedDesc.length > 50 && !formattedDesc.includes('## ')) {
              formattedDesc = await reformatJobDescriptionWithGemini(formattedDesc);
          }

          job = await prisma.job.create({
              data: {
                  title: jobData.title,
                  company: jobData.company,
                  location: jobData.location,
                  salaryRange: jobData.salaryRange,
                  description: formattedDesc,
                  url: cleanedUrl,
                  source: jobData.source,
              }
          });
      }
      
      await prisma.userJob.upsert({
          where: { userId_jobId: { userId, jobId: job.id } },
          update: {},
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
