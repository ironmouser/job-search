const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '.env.local') });
require('dotenv').config({ path: path.resolve(__dirname, '.env') });
const { PrismaClient } = require('@prisma/client');

console.log("Raw DATABASE_URL:", process.env.DATABASE_URL?.replace(/:[^:@]+@/, ':****@'));

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL
    }
  }
});

async function main() {
  const jobs = await prisma.job.findMany({
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      title: true,
      company: true,
      source: true,
      addedById: true,
      createdAt: true
    }
  });

  console.log(`\nTotal jobs in DB: ${jobs.length}`);

  // Local time: 2026-08-04 EDT
  const startOf2026Aug4EDT = new Date('2026-08-04T00:00:00-04:00');
  const startOf2026Aug4UTC = new Date('2026-08-04T00:00:00Z');
  const startOf2026Aug5UTC = new Date('2026-08-05T00:00:00Z');

  const jobsTodayEDT = jobs.filter(j => j.createdAt >= startOf2026Aug4EDT);
  const jobsTodayUTC = jobs.filter(j => j.createdAt >= startOf2026Aug4UTC);
  const jobsAug5UTC = jobs.filter(j => j.createdAt >= startOf2026Aug5UTC);

  console.log(`\nJobs created on/after 2026-08-04T00:00:00-04:00 (EDT today): ${jobsTodayEDT.length}`);
  console.log(`Jobs created on/after 2026-08-04T00:00:00Z (UTC 2026-08-04): ${jobsTodayUTC.length}`);
  console.log(`Jobs created on/after 2026-08-05T00:00:00Z (UTC 2026-08-05): ${jobsAug5UTC.length}`);

  const scrapedToday = jobsTodayEDT.filter(j => !j.addedById);
  const userAddedToday = jobsTodayEDT.filter(j => j.addedById);

  console.log(`\n--- Scraped Jobs Added Today (${scrapedToday.length}) ---`);
  console.log(`--- User-Added Jobs Today (${userAddedToday.length}) ---`);

  const scrapedBySource = {};
  scrapedToday.forEach(j => {
    const src = j.source || 'null';
    scrapedBySource[src] = (scrapedBySource[src] || 0) + 1;
  });
  console.log("\nScraped jobs by source:", JSON.stringify(scrapedBySource, null, 2));

  console.log("\nSample scraped jobs today:");
  scrapedToday.slice(0, 15).forEach(j => {
    console.log(`- [${j.id}] "${j.title}" at "${j.company}" (source: ${j.source}, createdAt: ${j.createdAt.toISOString()})`);
  });
}

main()
  .catch(err => console.error("Error:", err))
  .finally(() => prisma.$disconnect());
