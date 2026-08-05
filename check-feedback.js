const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const jobFeedbacks = await prisma.jobFeedback.findMany();
  console.log(`Job Feedbacks Count: ${jobFeedbacks.length}`);
  if (jobFeedbacks.length > 0) {
    console.log(jobFeedbacks.slice(0, 5)); // Show first 5
  }
  
  const appFeedbacks = await prisma.appFeedback.findMany();
  console.log(`\nApp Feedbacks Count: ${appFeedbacks.length}`);
  if (appFeedbacks.length > 0) {
    console.log(appFeedbacks.slice(0, 5)); // Show first 5
  }
}

main()
  .catch(e => console.error(e))
  .finally(async () => {
    await prisma.$disconnect();
  });
