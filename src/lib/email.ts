import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { prisma } from './prisma';
import { getUserSettings } from './settings';
import { normalizeAndSaveJobs } from './jobs';
import { cleanCompanyName } from './cleaners';
import { isNonJobUrl, cleanJobUrl } from './urlUtils';
import { extractJobsFromEmailText } from './scoring';
import { decrypt } from './encryption';
import { getActiveEmailAccounts } from './emailAccounts';

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
  'jobs',
  'role',
  'roles',
  'opportunity',
  'opportunities',
  'career',
  'careers',
  'hiring',
  'hire',
  'position',
  'positions',
  'opening',
  'openings',
  'posting',
  'postings',
  'application',
  'applied',
  'applicant',
  'candidate',
  'interview',
  'recruiter',
  'recruiting',
  'employment',
  'talent',
  'offer',
  'alert',
  'alerts',
  'match',
  'matches',
  'recommended',
  'recommendations',
  'digest',
  'engineer',
  'engineering',
  'developer',
  'development',
  'manager',
  'management',
  'lead',
  'head',
  'director',
  'vp',
  'designer',
  'design',
  'analyst',
  'analytics',
  'scientist',
  'architect',
  'specialist',
  'consultant',
  'intern',
  'associate',
  'remote',
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

async function scanAccountInbox(
  account: {
    provider: string;
    emailAddress: string;
    emailAppPasswordDecrypted: string;
    imapHost: string;
    imapPort: number;
  },
  prefs: any,
  sinceDate: Date,
  onProgress?: (foundCount: number, message: string) => void
): Promise<any[]> {
  const providerLabel = account.provider.toUpperCase();
  const userEmail = (account.emailAddress || '').toLowerCase().trim();

  onProgress?.(0, `Connecting to ${providerLabel} (${account.emailAddress})...`);

  const client = new ImapFlow({
    host: account.imapHost,
    port: account.imapPort,
    secure: account.imapPort === 993,
    auth: {
      user: account.emailAddress,
      pass: account.emailAppPasswordDecrypted,
    },
    logger: false,
  });

  try {
    await client.connect();
    onProgress?.(0, `Connected to ${providerLabel}. Checking inbox...`);

    const lock = await client.getMailboxLock('INBOX');
    try {
      // Stage 1: Fast Envelope Scan & Pre-filter without downloading full bodies
      onProgress?.(0, `Scanning ${providerLabel} email headers for job alerts...`);
      const candidateHeaders: Array<{ uid: number; subject: string; from: string }> = [];
      const totalInBox = client.mailbox ? (client.mailbox as any).exists || 0 : 0;
      console.log(`[Email Sync - ${providerLabel}] Mailbox INBOX opened. Total messages: ${totalInBox}`);

      // Extract candidate keywords from Job Discovery Settings
      const userKeywords = [prefs.searchKeyword, prefs.includeKeywords]
        .filter(Boolean)
        .flatMap((s: any) => String(s).toLowerCase().split(/[\s,]+/))
        .map((t: string) => t.trim())
        .filter((t: string) => t.length > 2);

      for await (const message of client.fetch({ since: sinceDate }, { envelope: true, uid: true })) {
        const subject = message.envelope?.subject || '';
        const fromAddress = message.envelope?.from?.[0]?.address?.toLowerCase() || '';
        const fromName = message.envelope?.from?.[0]?.name?.toLowerCase() || '';

        const combinedHeader = `${subject} ${fromAddress} ${fromName}`.toLowerCase();
        const isFromSelf = Boolean(userEmail && fromAddress === userEmail);
        const isPersonalSender = PERSONAL_DOMAINS.some(domain => fromAddress.endsWith(domain));
        const isKnownJobSender = KNOWN_JOB_SENDERS.some(domain => fromAddress.includes(domain) || fromName.includes(domain));
        const hasJobKeyword = JOB_KEYWORDS.some(kw => combinedHeader.includes(kw));
        const matchesUserKeyword = userKeywords.some((kw: string) => combinedHeader.includes(kw));

        // Only skip personal domains if the email has no job or user keyword signals
        if (!isFromSelf && isPersonalSender && !hasJobKeyword && !matchesUserKeyword) {
          continue;
        }

        if (isFromSelf || isKnownJobSender || hasJobKeyword || matchesUserKeyword) {
          candidateHeaders.push({
            uid: message.uid,
            subject,
            from: fromAddress,
          });
        }
      }

      // Fallback: If date-based search returned 0 headers but inbox has messages, scan recent message sequence
      if (candidateHeaders.length === 0 && totalInBox > 0) {
        const fallbackCount = Math.min(totalInBox, 150);
        console.log(`[Email Sync - ${providerLabel}] Date search returned 0 headers. Scanning most recent ${fallbackCount} emails as fallback...`);
        const fetchRange = `${Math.max(1, totalInBox - fallbackCount + 1)}:*`;

        for await (const message of client.fetch(fetchRange, { envelope: true, uid: true })) {
          const subject = message.envelope?.subject || '';
          const fromAddress = message.envelope?.from?.[0]?.address?.toLowerCase() || '';
          const fromName = message.envelope?.from?.[0]?.name?.toLowerCase() || '';

          const combinedHeader = `${subject} ${fromAddress} ${fromName}`.toLowerCase();
          const isFromSelf = Boolean(userEmail && fromAddress === userEmail);
          const isPersonalSender = PERSONAL_DOMAINS.some(domain => fromAddress.endsWith(domain));
          const isKnownJobSender = KNOWN_JOB_SENDERS.some(domain => fromAddress.includes(domain) || fromName.includes(domain));
          const hasJobKeyword = JOB_KEYWORDS.some(kw => combinedHeader.includes(kw));
          const matchesUserKeyword = userKeywords.some((kw: string) => combinedHeader.includes(kw));

          if (!isFromSelf && isPersonalSender && !hasJobKeyword && !matchesUserKeyword) {
            continue;
          }

          if (isFromSelf || isKnownJobSender || hasJobKeyword || matchesUserKeyword) {
            candidateHeaders.push({
              uid: message.uid,
              subject,
              from: fromAddress,
            });
          }
        }
      }

      console.log(`[Email Sync - ${providerLabel}] Discovered ${candidateHeaders.length} matching job email headers.`);

      if (candidateHeaders.length === 0) {
        return [];
      }

      // Stage 2: Cap candidate emails at 50 (most recent first)
      const selectedCandidates = candidateHeaders.slice(-MAX_CANDIDATE_EMAILS).reverse();
      onProgress?.(0, `Found ${selectedCandidates.length} candidate job alert email${selectedCandidates.length === 1 ? '' : 's'} in ${providerLabel}. Downloading content...`);

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

          const htmlText = html
            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
            .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();

          const effectiveText = (htmlText.length > text.length ? htmlText : text) || text || htmlText;

          const urlRegex = /(https?:\/\/[^\s<"']+)/g;
          const htmlUrls = html.match(urlRegex) || [];
          const textUrls = effectiveText.match(urlRegex) || [];
          const allUrls = Array.from(new Set([...htmlUrls, ...textUrls])).filter(u => {
            const lower = u.toLowerCase();
            if (lower.match(/\.(png|jpg|jpeg|gif|css|js|ico|svg|woff2?|ttf|webp)$/i)) return false;
            if (lower.includes('unsubscribe') || lower.includes('preferences') || lower.includes('notifications') || lower.includes('privacy') || lower.includes('mailto:')) return false;
            if (isNonJobUrl(u)) return false;
            return true;
          });

          if (allUrls.length === 0) continue;

          const textSnippet = effectiveText.slice(0, 35000);
          if (!textSnippet && allUrls.length === 0) continue;

          candidatePayloads.push({
            subject,
            emailContentForAI: `
EMAIL SUBJECT:
${subject}

EMAIL TEXT:
${textSnippet}

LINKS FOUND IN EMAIL:
${allUrls.slice(0, 120).join('\n')}
            `.trim(),
          });
        } catch (msgErr) {
          console.warn(`[Email Sync - ${providerLabel}] Warning: failed to parse message UID ${item.uid}:`, msgErr);
        }
      }

      onProgress?.(0, `Processing ${candidatePayloads.length} ${providerLabel} message${candidatePayloads.length === 1 ? '' : 's'} for job postings...`);

      // Stage 3: AI Job Extraction in concurrent batches of 10
      let runningFoundCount = 0;
      const extractedJobBatches: any[][] = [];
      const batchSize = 10;

      for (let i = 0; i < candidatePayloads.length; i += batchSize) {
        const chunk = candidatePayloads.slice(i, i + batchSize);
        const batchNum = Math.floor(i / batchSize) + 1;
        const totalBatches = Math.ceil(candidatePayloads.length / batchSize);
        console.log(`[Email Sync AI - ${providerLabel}] Processing batch ${batchNum}/${totalBatches} (${chunk.length} emails in parallel)...`);

        const batchResults = await Promise.all(
          chunk.map(async ({ emailContentForAI, subject }) => {
            try {
              const extracted = await extractJobsFromEmailText(emailContentForAI, {
                searchKeyword: prefs.searchKeyword || undefined,
                jobLevel: prefs.jobLevel || undefined,
                searchLocation: prefs.searchLocation || undefined,
                includeKeywords: prefs.includeKeywords || undefined,
                excludeKeywords: prefs.excludeKeywords || undefined,
              });
              if (Array.isArray(extracted) && extracted.length > 0) {
                console.log(`[Email Sync AI - ${providerLabel}] Extracted ${extracted.length} job(s) from "${subject}":`, extracted.map(j => `"${j.title}" at "${j.company}"`));
                runningFoundCount += extracted.length;
                onProgress?.(
                  runningFoundCount,
                  `Extracted ${runningFoundCount} job listing${runningFoundCount === 1 ? '' : 's'} from ${providerLabel}...`
                );
              }
              return extracted;
            } catch (e) {
              console.error(`Error extracting jobs from ${providerLabel} email text:`, e);
              return [];
            }
          })
        );
        extractedJobBatches.push(...batchResults);
      }

      // Stage 4: Format Extracted Jobs
      const rawJobs: any[] = [];
      for (const extractedJobs of extractedJobBatches) {
        for (const job of extractedJobs) {
          if (!job.url || isNonJobUrl(job.url)) continue;
          if (job.url.match(/\.(png|jpg|jpeg|gif|css|js|ico|svg|woff2?|ttf|webp)$/i)) continue;

          const jobTitle = job.title?.trim();
          if (!jobTitle || jobTitle.toLowerCase().includes('unknown') || jobTitle.toLowerCase() === 'overview') {
            continue;
          }

          const companyName = cleanCompanyName(job.company) || 'Unknown Company';
          if (jobTitle.toLowerCase() === companyName.toLowerCase() && (companyName.toLowerCase() === 'unknown company' || companyName.toLowerCase() === 'unknown')) {
            continue;
          }

          const boardMatch = JOB_BOARDS.find(b => job.url.toLowerCase().includes(b)) || job.source;
          const sourceCategory = boardMatch ? `Email Sync (${boardMatch})` : `Email Sync (${providerLabel})`;

          const shortDescParts = [job.description, job.requirements]
            .filter(Boolean)
            .map(s => String(s).trim())
            .filter(s => s.length > 0);
          const extractedDesc = shortDescParts.join('\n\n');
          const cleanedUrl = cleanJobUrl(job.url);
          const finalDesc =
            extractedDesc.length > 15
              ? `${extractedDesc}\n\nFound via email link: ${cleanedUrl}`
              : `Found via email link: ${cleanedUrl}`;

          rawJobs.push({
            title: jobTitle,
            company: companyName,
            location: job.location || 'Remote/Unknown',
            salary_range: job.salary_range || null,
            description: finalDesc,
            requirements: job.requirements || null,
            url: cleanedUrl,
            source: sourceCategory,
          });
        }
      }

      return rawJobs;
    } finally {
      lock.release();
    }
  } catch (err) {
    console.error(`IMAP sync failed for account ${account.emailAddress} (${providerLabel}):`, err);
    throw err;
  } finally {
    try {
      await client.logout();
    } catch (e) {}
  }
}

export async function fetchEmailsAndExtractJobs(
  userId: string,
  onProgress?: (foundCount: number, message: string) => void
) {
  onProgress?.(0, 'Retrieving email configuration...');
  const prefs = await getUserSettings(userId);
  const activeAccounts = getActiveEmailAccounts(prefs);

  if (activeAccounts.length === 0) {
    throw new Error('Email credentials are not configured in your settings.');
  }

  // Calculate sync window (look back 14 days so recent alerts and forwarded jobs are never missed)
  const syncLog = await prisma.syncLog.findFirst({
    where: { userId, syncType: 'email' },
    select: { id: true, lastSyncedAt: true },
  });
  const sinceDate = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);

  console.log(`[Email Sync] Fetching candidate emails across ${activeAccounts.length} account(s) since ${sinceDate.toISOString()}...`);

  const allRawJobs: any[] = [];
  const errors: Error[] = [];

  for (const account of activeAccounts) {
    try {
      const accountJobs = await scanAccountInbox(account, prefs, sinceDate, onProgress);
      allRawJobs.push(...accountJobs);
    } catch (accErr: any) {
      errors.push(accErr);
      if (activeAccounts.length === 1) {
        throw accErr;
      }
    }
  }

  // If all accounts failed and we have no jobs, throw the first error
  if (allRawJobs.length === 0 && errors.length === activeAccounts.length && errors.length > 0) {
    throw errors[0];
  }

  if (allRawJobs.length === 0) {
    onProgress?.(0, 'No new job alert emails found across configured email accounts.');
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

  // Stage 5: Save & Normalize (skip redundant AI triage pass since email extraction already triaged)
  let newJobsSaved = 0;
  if (allRawJobs.length > 0) {
    const result: any = await normalizeAndSaveJobs(allRawJobs, userId, {
      isEmailSync: true,
      skipAiTriage: true,
      onProgress,
    });
    newJobsSaved = typeof result?.newSavedCount === 'number' ? result.newSavedCount : (result?.length || allRawJobs.length);
    console.log(`[Email Sync] normalizeAndSaveJobs completed. New jobs saved: ${newJobsSaved}`);
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
}
