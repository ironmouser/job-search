import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { prisma } from './prisma';
import { normalizeAndSaveJobs } from './jobs';
import { cleanCompanyName } from './cleaners';
import { extractJobsFromEmailText } from './scoring';
import { decrypt } from './encryption';

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
  const prefs = await prisma.userPreferences.findUnique({
    where: { userId }
  });

  if (!prefs?.emailAddress || !prefs?.emailAppPassword) {
    throw new Error('Email credentials are not configured in your settings.');
  }

  const imapHost = prefs.imapHost || 'imap.gmail.com';
  const imapPort = prefs.imapPort || 993;
  const imapUser = prefs.emailAddress;
  const imapPass = decrypt(prefs.emailAppPassword);

  const client = new ImapFlow({
    host: imapHost,
    port: imapPort,
    secure: imapPort === 993,
    auth: {
      user: imapUser,
      pass: imapPass,
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
        const subject = parsed.subject || '';

        // Filter out emails from personal/free domains to avoid scammers
        const fromAddress = parsed.from?.value?.[0]?.address?.toLowerCase() || '';
        const personalDomains = ['@gmail.com', '@yahoo.com', '@outlook.com', '@hotmail.com', '@aol.com', '@icloud.com'];
        if (personalDomains.some(domain => fromAddress.endsWith(domain))) {
             continue;
        }

        // Pre-filter: Check if the email likely contains a job
        const emailContent = `${subject} ${text}`.toLowerCase();
        const jobKeywords = ['job', 'role', 'opportunity', 'career', 'hiring', 'engineer', 'developer', 'position', 'application', 'manager', 'director', 'interview'];
        const looksLikeJobEmail = jobKeywords.some(keyword => emailContent.includes(keyword));

        if (!looksLikeJobEmail) continue;

        // Extract all unique URLs from HTML
        const urlRegex = /(https?:\/\/[^\s<"']+)/g;
        const matches = html.match(urlRegex) || [];
        
        // Filter out media/assets and obvious non-job links
        const uniqueUrls = Array.from(new Set(matches)).filter(u => {
             const lower = u.toLowerCase();
             if (lower.match(/\.(png|jpg|jpeg|gif|css|js|ico|svg|woff2?|ttf)$/i)) return false;
             if (lower.includes('unsubscribe') || lower.includes('preferences') || lower.includes('notifications') || lower.includes('privacy')) return false;
             return true;
        });

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
                company: cleanCompanyName(job.company) || 'Unknown Company',
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
    try {
      await client.logout();
    } catch (e) {
      // Ignore logout error if connection was not established
    }
  }
}
