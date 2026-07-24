import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const alerts = await prisma.systemAlert.findMany({
    where: { type: 'HIGH_COST_BLOCKED' },
    orderBy: { createdAt: 'desc' },
    take: 5
  });
  console.log('Recent High Cost Alerts:', alerts);

  const unscored = await prisma.userJob.findMany({
    where: { status: 'discovered' },
    include: { job: true },
    take: 10
  });
  console.log('\nUnscored Jobs:');
  unscored.forEach(u => console.log(`- Job: ${u.job.title} | Has Desc: ${!!u.job.description} | Desc Len: ${u.job.description?.length}`));
}
main().catch(console.error).finally(() => prisma.$disconnect());
