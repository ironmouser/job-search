const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function normalizeAndSaveJobs(rawJobs, userId) {
    if (!rawJobs || rawJobs.length === 0) return [];
    
    // Simulate user settings
    const remoteOnly = true; // User unchecked it recently

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

    const processedUrls = [];
    console.log(`Processing ${normalizedJobs.length} normalized jobs...`);

    for (const jobData of normalizedJobs) {
      if (processedUrls.includes(jobData.url)) continue;
      processedUrls.push(jobData.url);

      let job = await prisma.job.findUnique({ where: { url: jobData.url } });
      if (!job) {
          try {
              job = await prisma.job.create({
                  data: {
                      title: jobData.title,
                      company: jobData.company,
                      location: jobData.location,
                      salaryRange: jobData.salaryRange,
                      description: jobData.description,
                      url: jobData.url,
                      source: jobData.source,
                  }
              });
              console.log(`Created new job: ${job.id}`);
          } catch(e) {
              console.error(`Error creating job ${jobData.url}:`, e);
          }
      } else {
          // Already exists
      }
      
      try {
          await prisma.userJob.upsert({
              where: { userId_jobId: { userId, jobId: job.id } },
              update: {},
              create: {
                  userId,
                  jobId: job.id,
                  status: 'discovered'
              }
          });
      } catch(e) {
          console.error(`Error creating userJob:`, e);
      }
    }
    
    return processedUrls.length;
}

async function main() {
    const rawJobs = [
        {
          title: 'Tiktok Account Strategist (Test)',
          company: 'Sohva',
          location: 'Remote US',
          url: 'https://remotepoc.com/job/tiktok-account-strategist-test/'
        }
    ];
    // use a dummy user id
    const count = await normalizeAndSaveJobs(rawJobs, 'cmre19xkf0000r554p74jtz8l');
    console.log('Saved count:', count);
}
main().catch(console.error).finally(() => prisma.$disconnect());
