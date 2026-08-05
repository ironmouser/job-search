const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const logs = await prisma.scraperLog.findMany({
    select: {
      scraperName: true,
      resultsCount: true,
      createdAt: true
    }
  });

  const stats = {};
  logs.forEach(log => {
    if (!stats[log.scraperName]) {
      stats[log.scraperName] = { totalScrapes: 0, totalResults: 0, lastSuccessDate: null };
    }
    stats[log.scraperName].totalScrapes += 1;
    stats[log.scraperName].totalResults += log.resultsCount;
    if (log.resultsCount > 0) {
      if (!stats[log.scraperName].lastSuccessDate || log.createdAt > stats[log.scraperName].lastSuccessDate) {
        stats[log.scraperName].lastSuccessDate = log.createdAt;
      }
    }
  });

  const neverReturned = [];
  const notIn5Days = [];
  const noJobsEverButAlsoScrapedRecently = [];
  
  const fiveDaysAgo = new Date();
  fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);

  for (const [name, stat] of Object.entries(stats)) {
    if (stat.totalResults === 0) {
      neverReturned.push(name);
      noJobsEverButAlsoScrapedRecently.push(name); // It also technically hasn't returned jobs in 5 days
    } else {
      if (stat.lastSuccessDate < fiveDaysAgo) {
        notIn5Days.push({ name, lastSuccess: stat.lastSuccessDate });
      }
    }
  }

  console.log("--- Scraper Sources that NEVER returned a job (Total Results = 0) ---");
  neverReturned.forEach(n => console.log(` - ${n} (Scraped ${stats[n].totalScrapes} times)`));
  if (neverReturned.length === 0) console.log("None");

  console.log("\n--- Scraper Sources that have NOT returned a job in the last 5 days (but had before) ---");
  notIn5Days.forEach(n => console.log(` - ${n.name} (Last success: ${n.lastSuccess.toISOString()})`));
  if (notIn5Days.length === 0) console.log("None");
}

main()
  .catch(e => console.error(e))
  .finally(async () => {
    await prisma.$disconnect();
  });
