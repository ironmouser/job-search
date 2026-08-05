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

export async function fetchEmailsAndExtractJobs(
  userId: string,
  onProgress?: (foundCount: number, message: string) => void
) {
  onProgress?.(0, 'Connecting to IMAP mail server...');
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
    onProgress?.(0, 'Connected to mail server. Checking inbox...');

    // 1. Get last sync time
    const syncLog = await prisma.syncLog.findFirst({
        where: { userId, syncType: 'email' },
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

      console.log(`Fetched ${messages.length} emails. Parsing recent job messages with AI in parallel...`);
      onProgress?.(0, `Fetched ${messages.length} email messages. Extracting job postings...`);
      const recentMessages = messages.slice(-5);
      const candidatePayloads = [];

      for (const source of recentMessages) {
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

        candidatePayloads.push({
          emailContentForAI: `
EMAIL TEXT:
${text}

LINKS FOUND IN EMAIL:
${uniqueUrls.join('\n')}
          `
        });
      }

      let runningFoundCount = 0;
      // AI extractions
      const extractedJobBatches = await Promise.all(
        candidatePayloads.map(async ({ emailContentForAI }) => {
          try {
            const extracted = await extractJobsFromEmailText(emailContentForAI, {
              searchKeyword: prefs.searchKeyword || undefined,
              jobLevel: prefs.jobLevel || undefined,
              includeKeywords: prefs.includeKeywords || undefined,
              excludeKeywords: prefs.excludeKeywords || undefined,
            });
            if (Array.isArray(extracted) && extracted.length > 0) {
              runningFoundCount += extracted.length;
              onProgress?.(runningFoundCount, `Extracted ${runningFoundCount} job listing${runningFoundCount === 1 ? '' : 's'} from email...`);
            }
            return extracted;
          } catch (e) {
            console.error('Error extracting jobs from email text:', e);
            return [];
          }
        })
      );

      const rawJobs: any[] = [];
      for (const extractedJobs of extractedJobBatches) {
        for (const job of extractedJobs) {
             if (!job.url) continue;

             // Ensure tracking pixels or images aren't included
             if (job.url.match(/\.(png|jpg|jpeg|gif|css|js|ico|svg|woff2?|ttf)$/i)) continue;

             const jobTitle = job.title?.trim();
             if (!jobTitle || jobTitle.toLowerCase().includes('unknown')) {
                 continue; // Skip invalid or unknown jobs
             }

             const boardMatch = JOB_BOARDS.find(b => job.url.toLowerCase().includes(b)) || job.source;
             const sourceCategory = boardMatch ? `Email Sync (${boardMatch})` : 'Email Sync';
             
             const shortDescParts = [job.description, job.requirements].filter(Boolean).map(s => String(s).trim()).filter(s => s.length > 0);
             const extractedDesc = shortDescParts.join('\n\n');
             const finalDesc = (extractedDesc.length > 15) 
               ? `${extractedDesc}\n\nFound via email link: ${job.url}`
               : `Found via email link: ${job.url}`;

             rawJobs.push({
                title: jobTitle,
                company: cleanCompanyName(job.company) || 'Unknown Company',
                location: job.location || 'Remote/Unknown',
                salary_range: job.salary_range || null,
                description: finalDesc,
                requirements: job.requirements || null,
                url: job.url,
                source: sourceCategory
             });
        }
      }

      // 3. Save to database
      let newJobsSaved = 0;
      if (rawJobs.length > 0) {
        const result: any = await normalizeAndSaveJobs(rawJobs, userId, { isEmailSync: true, onProgress });
        newJobsSaved = typeof result?.newSavedCount === 'number' ? result.newSavedCount : (result?.length || rawJobs.length);
      }

      if (syncLog) {
         await prisma.syncLog.update({
            where: { id: syncLog.id },
            data: { lastSyncedAt: new Date() }
         });
      } else {
         await prisma.syncLog.create({
            data: { userId, syncType: 'email', lastSyncedAt: new Date() }
         });
      }

      return newJobsSaved;

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
