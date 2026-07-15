import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { prisma } from './prisma';
import { normalizeAndSaveJobs } from './apify';
import { extractJobsFromEmailText } from './scoring';

const IMAP_HOST = process.env.IMAP_HOST;
const IMAP_PORT = parseInt(process.env.IMAP_PORT || '993', 10);
const IMAP_USER = process.env.IMAP_USER;
const IMAP_PASS = process.env.IMAP_PASS;

const JOB_BOARDS = [
  'indeed.com',
  'linkedin.com/jobs',
  'glassdoor.com',
  'ziprecruiter.com',
  'monster.com',
  'wellfound.com',
  'greenhouse.io',
  'lever.co',
];

export async function fetchEmailsAndExtractJobs(userId: string) {
  if (!IMAP_HOST || !IMAP_USER || !IMAP_PASS) {
    throw new Error('IMAP credentials are not configured in environment variables.');
  }

  const client = new ImapFlow({
    host: IMAP_HOST,
    port: IMAP_PORT,
    secure: IMAP_PORT === 993,
    auth: {
      user: IMAP_USER,
      pass: IMAP_PASS,
    },
    logger: false,
  });

  try {
    await client.connect();

    // 1. Get last sync time
    const syncLog = await prisma.syncLog.findFirst({
        where: { syncType: 'email' },
        select: { id: true, lastSyncedAt: true }
    });

    let sinceDate = new Date();
    if (syncLog?.lastSyncedAt) {
      sinceDate = new Date(syncLog.lastSyncedAt);
    } else {
      // Default to 2 days ago if no log exists
      sinceDate.setDate(sinceDate.getDate() - 2);
    }

    console.log(`Fetching emails since ${sinceDate.toISOString()}...`);

    const lock = await client.getMailboxLock('INBOX');
    try {
      const messages = [];
      // Fetch messages since the date
      for await (const message of client.fetch({ since: sinceDate }, { source: true, envelope: true })) {
        if (message.source) {
          messages.push(message.source);
        }
      }

      console.log(`Fetched ${messages.length} emails. Parsing with AI...`);
      const rawJobs: any[] = [];

      for (const source of messages) {
        const parsed = await simpleParser(source);
        const text = parsed.text || '';
        const html = parsed.html || '';

        // Extract raw URLs just in case mailparser missed them in .text
        const urlRegex = /(https?:\/\/[^\s<"']+)/g;
        const matches = html.match(urlRegex) || [];
        const uniqueUrls = Array.from(new Set(matches)).filter(u => JOB_BOARDS.some(b => u.toLowerCase().includes(b)));

        if (!text && uniqueUrls.length === 0) continue;

        const emailContentForAI = `
EMAIL TEXT:
${text}

LINKS FOUND IN EMAIL:
${uniqueUrls.join('\n')}
        `;

        const extractedJobs = await extractJobsFromEmailText(emailContentForAI);
        
        for (const job of extractedJobs) {
             if (!job.url) continue;

             // Ensure tracking pixels or images aren't included
             if (job.url.match(/\.(png|jpg|jpeg|gif|css|js|ico|svg|woff2?|ttf)$/i)) continue;

             const jobTitle = job.title?.trim();
             if (!jobTitle || jobTitle.toLowerCase().includes('unknown')) {
                 continue; // Skip invalid or unknown jobs
             }

             const sourceCategory = JOB_BOARDS.find(b => job.url.toLowerCase().includes(b)) || job.source || 'Email Sync';
             
             rawJobs.push({
                title: jobTitle,
                company: (job.company || 'Unknown Company') + ' (Scraped via Email)',
                location: job.location || 'Remote/Unknown',
                salary_range: null,
                description: job.description || `Found via email link: ${job.url}`,
                requirements: job.requirements || null,
                url: job.url,
                source: sourceCategory
             });
        }
      }

      // 3. Save to database
      if (rawJobs.length > 0) {
        await normalizeAndSaveJobs(rawJobs, userId);
      }

      if (syncLog) {
         await prisma.syncLog.update({
            where: { id: syncLog.id },
            data: { lastSyncedAt: new Date() }
         });
      } else {
         await prisma.syncLog.create({
            data: { syncType: 'email', lastSyncedAt: new Date() }
         });
      }

      return rawJobs.length;

    } finally {
      lock.release();
    }
  } catch (err) {
    console.error('IMAP sync failed:', err);
    throw err;
  } finally {
    await client.logout();
  }
}
