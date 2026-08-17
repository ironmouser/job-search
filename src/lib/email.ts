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
  'ashbyhq.com',
  'smartrecruiters.com',
  'workday.com',
  'jobvite.com',
  'dice.com',
  'builtin.com',
  'levels.fyi',
  'otta.com',
  'hiring.cafe',
];

const KNOWN_JOB_SENDERS = [
  'linkedin.com',
  'indeed.com',
  'glassdoor.com',
  'ziprecruiter.com',
  'greenhouse.io',
  'lever.co',
  'ashbyhq.com',
  'smartrecruiters.com',
  'workday.com',
  'jobvite.com',
  'monster.com',
  'wellfound.com',
  'dice.com',
  'builtin.com',
  'levels.fyi',
  'otta.com',
  'hiring.cafe',
  'talent',
  'careers',
  'recruiting',
  'jobs',
];

const JOB_KEYWORDS = [
  'job',
  'role',
  'opportunity',
  'career',
  'hiring',
  'engineer',
  'developer',
  'position',
  'application',
  'interview',
  'opening',
  'alert',
  'match',
  'matches',
  'recommended',
  'applied',
  'applicant',
  'candidate',
  'recruiter',
  'employment',
  'talent',
  'offer',
];

const PERSONAL_DOMAINS = [
  '@gmail.com',
  '@yahoo.com',
  '@outlook.com',
  '@hotmail.com',
  '@aol.com',
  '@icloud.com',
  '@protonmail.com',
  '@proton.me',
  '@zoho.com',
];

const MAX_CANDIDATE_EMAILS = 50;

export async function fetchEmailsAndExtractJobs(
  userId: string,
  onProgress?: (foundCount: number, message: string) => void
) {
  onProgress?.(0, 'Connecting to IMAP mail server...');
  const prefs = await prisma.userPreferences.findUnique({
    where: { userId },
  });

  if (!prefs?.emailAddress || !prefs?.emailAppPassword) {
    throw new Error('Email credentials are not configured in your settings.');
  }

  const imapHost = prefs.imapHost || 'imap.gmail.com';
  const imapPort = prefs.imapPort || 993;
  const imapUser = prefs.emailAddress;
  const imapPass = decrypt(prefs.emailAppPassword);
  const userEmail = (prefs.emailAddress || '').toLowerCase().trim();

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

    // 1. Calculate incremental sync window (Max lookback: 7 days)
    const syncLog = await prisma.syncLog.findFirst({
      where: { userId, syncType: 'email' },
      select: { id: true, lastSyncedAt: true },
    });

    const maxLookbackDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // 7 days ago
    let sinceDate = maxLookbackDate;

    if (syncLog?.lastSyncedAt) {
      // 2-hour safety buffer to prevent missing in-flight emails or clock-skewed deliveries
      const bufferedLastSync = new Date(new Date(syncLog.lastSyncedAt).getTime() - 2 * 60 * 60 * 1000);
      // Use the buffered last sync if it is more recent than 7 days ago
      sinceDate = bufferedLastSync > maxLookbackDate ? bufferedLastSync : maxLookbackDate;
    }

    console.log(`[Email Sync] Fetching candidate emails since ${sinceDate.toISOString()}...`);

    const lock = await client.getMailboxLock('INBOX');
    try {
      // Stage 1: Fast Envelope Scan & Pre-filter without downloading full bodies
      onProgress?.(0, 'Scanning email headers for job alerts...');
      const candidateHeaders: Array<{ uid: number; subject: string; from: string }> = [];

      for await (const message of client.fetch({ since: sinceDate }, { envelope: true, uid: true })) {
        const subject = message.envelope?.subject || '';
        const fromAddress = message.envelope?.from?.[0]?.address?.toLowerCase() || '';
        const fromName = message.envelope?.from?.[0]?.name?.toLowerCase() || '';

        const isFromSelf = Boolean(userEmail && fromAddress === userEmail);
        const isPersonalSender = PERSONAL_DOMAINS.some(domain => fromAddress.endsWith(domain));

        // Skip non-self personal domain senders to avoid spam/phishing
        if (!isFromSelf && isPersonalSender) {
          continue;
        }

        const combinedHeader = `${subject} ${fromAddress} ${fromName}`.toLowerCase();
        const isKnownJobSender = KNOWN_JOB_SENDERS.some(domain => fromAddress.includes(domain) || fromName.includes(domain));
        const hasJobKeyword = JOB_KEYWORDS.some(kw => combinedHeader.includes(kw));

        if (isFromSelf || isKnownJobSender || hasJobKeyword) {
          candidateHeaders.push({
            uid: message.uid,
            subject,
            from: fromAddress,
          });
        }
      }

      console.log(`[Email Sync] Discovered ${candidateHeaders.length} matching job email headers.`);

      if (candidateHeaders.length === 0) {
        onProgress?.(0, 'No new job alert emails found since last sync.');
        // Update sync log even if no new emails to move the window forward
        if (syncLog) {
          await prisma.syncLog.update({
            where: { id: syncLog.id },
            data: { lastSyncedAt: new Date() },
          });
        } else {
          await prisma.syncLog.create({
            data: { userId, syncType: 'email', lastSyncedAt: new Date() },
          });
        }
        return 0;
      }

      // Stage 2: Cap candidate emails at 50 (most recent first)
      const selectedCandidates = candidateHeaders.slice(-MAX_CANDIDATE_EMAILS).reverse();
      onProgress?.(0, `Found ${selectedCandidates.length} candidate job alert email${selectedCandidates.length === 1 ? '' : 's'}. Downloading content...`);

      const candidatePayloads: Array<{ emailContentForAI: string; subject: string }> = [];

      // Download content for selected UIDs
      for (let i = 0; i < selectedCandidates.length; i++) {
        const item = selectedCandidates[i];
        try {
          const downloadResult = await client.download(String(item.uid), undefined, { uid: true });
          if (!downloadResult?.content) continue;

          const parsed = await simpleParser(downloadResult.content);
          const text = (parsed.text || '').trim();
          const html = parsed.html || '';
          const subject = parsed.subject || item.subject || '';

          // Clean HTML to text if plain text is minimal
          const htmlText = html
            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
            .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();

          const effectiveText = text || htmlText;

          // Extract job links from HTML and text
          const urlRegex = /(https?:\/\/[^\s<"']+)/g;
          const htmlUrls = html.match(urlRegex) || [];
          const textUrls = effectiveText.match(urlRegex) || [];
          const allUrls = Array.from(new Set([...htmlUrls, ...textUrls])).filter(u => {
            const lower = u.toLowerCase();
            if (lower.match(/\.(png|jpg|jpeg|gif|css|js|ico|svg|woff2?|ttf|webp)$/i)) return false;
            if (lower.includes('unsubscribe') || lower.includes('preferences') || lower.includes('notifications') || lower.includes('privacy') || lower.includes('mailto:')) return false;
            return true;
          });

          if (!effectiveText && allUrls.length === 0) continue;

          // Focus snippet for AI processing (first 4,000 chars is sufficient for job titles/snippets)
          const textSnippet = effectiveText.slice(0, 4000);

          candidatePayloads.push({
            subject,
            emailContentForAI: `
EMAIL SUBJECT:
${subject}

EMAIL TEXT:
${textSnippet}

LINKS FOUND IN EMAIL:
${allUrls.slice(0, 30).join('\n')}
            `.trim(),
          });
        } catch (msgErr) {
          console.warn(`[Email Sync] Warning: failed to parse message UID ${item.uid}:`, msgErr);
        }
      }

      onProgress?.(0, `Processing ${candidatePayloads.length} email message${candidatePayloads.length === 1 ? '' : 's'} for job postings...`);

      // Stage 3: AI Job Extraction in concurrent batches of 5
      let runningFoundCount = 0;
      const extractedJobBatches: any[][] = [];
      const batchSize = 5;

      for (let i = 0; i < candidatePayloads.length; i += batchSize) {
        const chunk = candidatePayloads.slice(i, i + batchSize);
        const batchResults = await Promise.all(
          chunk.map(async ({ emailContentForAI }) => {
            try {
              const extracted = await extractJobsFromEmailText(emailContentForAI, {
                searchKeyword: prefs.searchKeyword || undefined,
                jobLevel: prefs.jobLevel || undefined,
                includeKeywords: prefs.includeKeywords || undefined,
                excludeKeywords: prefs.excludeKeywords || undefined,
              });
              if (Array.isArray(extracted) && extracted.length > 0) {
                runningFoundCount += extracted.length;
                onProgress?.(
                  runningFoundCount,
                  `Extracted ${runningFoundCount} job listing${runningFoundCount === 1 ? '' : 's'} from email alerts...`
                );
              }
              return extracted;
            } catch (e) {
              console.error('Error extracting jobs from email text:', e);
              return [];
            }
          })
        );
        extractedJobBatches.push(...batchResults);
      }

      // Stage 4: Format and Deduplicate Extracted Jobs
      const rawJobs: any[] = [];
      for (const extractedJobs of extractedJobBatches) {
        for (const job of extractedJobs) {
          if (!job.url) continue;

          // Ensure tracking pixels or images aren't included
          if (job.url.match(/\.(png|jpg|jpeg|gif|css|js|ico|svg|woff2?|ttf|webp)$/i)) continue;

          const jobTitle = job.title?.trim();
          if (!jobTitle || jobTitle.toLowerCase().includes('unknown')) {
            continue;
          }

          const boardMatch = JOB_BOARDS.find(b => job.url.toLowerCase().includes(b)) || job.source;
          const sourceCategory = boardMatch ? `Email Sync (${boardMatch})` : 'Email Sync';

          const shortDescParts = [job.description, job.requirements]
            .filter(Boolean)
            .map(s => String(s).trim())
            .filter(s => s.length > 0);
          const extractedDesc = shortDescParts.join('\n\n');
          const finalDesc =
            extractedDesc.length > 15
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
            source: sourceCategory,
          });
        }
      }

      // Stage 5: Save & Normalize
      let newJobsSaved = 0;
      if (rawJobs.length > 0) {
        const result: any = await normalizeAndSaveJobs(rawJobs, userId, { isEmailSync: true, onProgress });
        newJobsSaved = typeof result?.newSavedCount === 'number' ? result.newSavedCount : (result?.length || rawJobs.length);
      }

      // Update SyncLog timestamp
      if (syncLog) {
        await prisma.syncLog.update({
          where: { id: syncLog.id },
          data: { lastSyncedAt: new Date() },
        });
      } else {
        await prisma.syncLog.create({
          data: { userId, syncType: 'email', lastSyncedAt: new Date() },
        });
      }

      // Log email sync execution run instance
      try {
        await prisma.syncLog.create({
          data: {
            userId,
            syncType: `email_run_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
            lastSyncedAt: new Date(),
          },
        });
      } catch (e) {
        console.warn('Failed to log email sync run:', e);
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
