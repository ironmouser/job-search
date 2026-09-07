import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { prisma } from './prisma';
import { getUserSettings } from './settings';
import { normalizeAndSaveJobs } from './jobs';
import { cleanCompanyName } from './cleaners';
import { isNonJobUrl, cleanJobUrl, isValidJobSource } from './urlUtils';
import { extractJobsFromEmailText } from './scoring';
import { decrypt } from './encryption';
import { getActiveEmailAccounts } from './emailAccounts';

const JOB_BOARDS = [
  'indeed.com',
  'linkedin.com',
  'glassdoor.com',
  'ziprecruiter.com',
  'monster.com',
  'wellfound.com',
  'angel.co',
  'greenhouse.io',
  'lever.co',
  'ashbyhq.com',
  'smartrecruiters.com',
  'workday.com',
  'myworkdayjobs.com',
  'workable.com',
  'bamboohr.com',
  'icims.com',
  'taleo.net',
  'jobvite.com',
  'breezy.hr',
  'applytojob.com',
  'recruitee.com',
  'rippling.com',
  'dice.com',
  'builtin.com',
  'levels.fyi',
  'otta.com',
  'hiring.cafe',
  'weworkremotely.com',
  'remoteok.com',
  'remote.co',
  'himalayas.app',
  'jobicy.com',
  'remotive.com',
  'simplyhired.com',
  'careerbuilder.com',
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
  'myworkdayjobs.com',
  'workable.com',
  'bamboohr.com',
  'icims.com',
  'taleo.net',
  'jobvite.com',
  'breezy.hr',
  'applytojob.com',
  'recruitee.com',
  'rippling.com',
  'monster.com',
  'wellfound.com',
  'angel.co',
  'dice.com',
  'builtin.com',
  'levels.fyi',
  'otta.com',
  'hiring.cafe',
  'weworkremotely.com',
  'remoteok.com',
  'remote.co',
  'himalayas.app',
  'jobicy.com',
  'remotive.com',
  'simplyhired.com',
  'careerbuilder.com',
  'talent',
  'careers',
  'recruiting',
  'jobs',
  'jobalert',
  'jobalerts',
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
  'wfh',
  'product',
  'telecommute',
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

function detectJobSourceCategory(url: string, providerLabel: string): string {
  const lower = (url || '').toLowerCase();
  if (lower.includes('linkedin.com')) return 'LinkedIn';
  if (lower.includes('indeed.com')) return 'Indeed';
  if (lower.includes('glassdoor.com')) return 'Glassdoor';
  if (lower.includes('ziprecruiter.com')) return 'ZipRecruiter';
  if (lower.includes('greenhouse.io')) return 'Greenhouse';
  if (lower.includes('lever.co')) return 'Lever';
  if (lower.includes('ashbyhq.com')) return 'Ashby';
  if (lower.includes('workday.com') || lower.includes('myworkdayjobs.com')) return 'Workday';
  if (lower.includes('smartrecruiters.com')) return 'SmartRecruiters';
  if (lower.includes('workable.com')) return 'Workable';
  if (lower.includes('bamboohr.com')) return 'BambooHR';
  if (lower.includes('weworkremotely.com')) return 'WeWorkRemotely';
  if (lower.includes('remoteok.com')) return 'RemoteOK';
  if (lower.includes('remote.co')) return 'Remote.co';
  if (lower.includes('himalayas.app')) return 'Himalayas';
  if (lower.includes('jobicy.com')) return 'Jobicy';
  if (lower.includes('remotive.com')) return 'Remotive';
  if (lower.includes('monster.com')) return 'Monster';
  if (lower.includes('wellfound.com') || lower.includes('angel.co')) return 'Wellfound';
  if (lower.includes('dice.com')) return 'Dice';
  if (lower.includes('builtin')) return 'Built In';
  if (lower.includes('levels.fyi')) return 'Levels.fyi';
  if (lower.includes('otta.com')) return 'Otta';
  if (lower.includes('hiring.cafe')) return 'HiringCafe';
  if (lower.includes('icims.com')) return 'iCIMS';
  if (lower.includes('taleo.net')) return 'Taleo';
  if (lower.includes('jobvite.com')) return 'Jobvite';
  if (lower.includes('rippling.com') || lower.includes('rippling-ats.com')) return 'Rippling';
  return providerLabel || 'Email Alert';
}

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
      // Stage 1: Fast Envelope Scan & Pre-filter
      onProgress?.(0, `Scanning ${providerLabel} email headers for job alerts...`);
      const candidateHeadersMap = new Map<number, { uid: number; subject: string; from: string }>();
      const totalInBox = client.mailbox ? (client.mailbox as any).exists || 0 : 0;
      console.log(`[Email Sync - ${providerLabel}] Mailbox INBOX opened. Total messages: ${totalInBox}`);

      // Extract candidate keywords from Job Discovery Settings and Location
      const userKeywords = [prefs.searchKeyword, prefs.includeKeywords, prefs.searchLocation]
        .filter(Boolean)
        .flatMap((s: any) => String(s).toLowerCase().split(/[\s,]+/))
        .map((t: string) => t.trim())
        .filter((t: string) => t.length > 2);

      const evaluateHeader = (envelope: any, uid: number) => {
        const subject = envelope?.subject || '';
        const fromAddress = envelope?.from?.[0]?.address?.toLowerCase() || '';
        const fromName = envelope?.from?.[0]?.name?.toLowerCase() || '';

        const combinedHeader = `${subject} ${fromAddress} ${fromName}`.toLowerCase();
        const isFromSelf = Boolean(userEmail && fromAddress === userEmail);
        const isPersonalSender = PERSONAL_DOMAINS.some(domain => fromAddress.endsWith(domain));
        const isKnownJobSender = KNOWN_JOB_SENDERS.some(domain => fromAddress.includes(domain) || fromName.includes(domain));
        const hasJobKeyword = JOB_KEYWORDS.some(kw => combinedHeader.includes(kw));
        const matchesUserKeyword = userKeywords.some((kw: string) => combinedHeader.includes(kw));

        if (!isFromSelf && isPersonalSender && !hasJobKeyword && !matchesUserKeyword) {
          return false;
        }

        if (isFromSelf || isKnownJobSender || hasJobKeyword || matchesUserKeyword) {
          candidateHeadersMap.set(uid, { uid, subject, from: fromAddress });
          return true;
        }
        return false;
      };

      // 1A. Scan recent message sequence (up to 200 messages) to guarantee newest emails are never missed
      if (totalInBox > 0) {
        const recentCount = Math.min(totalInBox, 200);
        const fetchRange = `${Math.max(1, totalInBox - recentCount + 1)}:*`;
        try {
          for await (const message of client.fetch(fetchRange, { envelope: true, uid: true })) {
            if (message.uid && message.envelope) {
              evaluateHeader(message.envelope, message.uid);
            }
          }
        } catch (seqErr: any) {
          console.warn(`[Email Sync - ${providerLabel}] Recent sequence fetch warning:`, seqErr.message);
        }
      }

      // 1B. If candidate count is under limit, run date-based search to supplement
      if (candidateHeadersMap.size < MAX_CANDIDATE_EMAILS) {
        try {
          for await (const message of client.fetch({ since: sinceDate }, { envelope: true, uid: true })) {
            if (message.uid && message.envelope && !candidateHeadersMap.has(message.uid)) {
              evaluateHeader(message.envelope, message.uid);
            }
          }
        } catch (dateErr: any) {
          console.warn(`[Email Sync - ${providerLabel}] Date-based fetch warning:`, dateErr.message);
        }
      }

      const candidateHeaders = Array.from(candidateHeadersMap.values());
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

          // Extract URLs from HTML href attributes and text
          const hrefUrls: string[] = [];
          const hrefRegex = /href=["'](https?:\/\/[^"'\s>]+)["']/gi;
          let hrefMatch;
          while ((hrefMatch = hrefRegex.exec(html)) !== null) {
            if (hrefMatch[1]) hrefUrls.push(hrefMatch[1]);
          }

          const rawUrlRegex = /(https?:\/\/[^\s<"']+)/g;
          const htmlUrls = html.match(rawUrlRegex) || [];
          const textUrls = effectiveText.match(rawUrlRegex) || [];

          const allRawUrls = Array.from(new Set([...hrefUrls, ...htmlUrls, ...textUrls]));

          const validUrls = allRawUrls
            .map(u => cleanJobUrl(u))
            .filter(u => {
              try {
                const parsedUrl = new URL(u);
                if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') return false;

                const path = parsedUrl.pathname.toLowerCase();

                // Skip static assets
                if (path.match(/\.(png|jpg|jpeg|gif|css|js|ico|svg|woff2?|ttf|webp)$/i)) return false;

                // Only skip settings/preferences/unsubscribe pages based on PATHNAME, not query parameters
                // (job alert emails frequently include query params like ?trk=job_alert_notifications or source=notifications)
                if (
                  path.includes('unsubscribe') ||
                  path.includes('email-preferences') ||
                  path.includes('email_preferences') ||
                  path.includes('/notification-settings') ||
                  path.includes('/notifications/settings') ||
                  path.includes('/privacy-policy') ||
                  path.includes('/privacy') ||
                  path.includes('/legal') ||
                  path.includes('/help') ||
                  path.includes('/support')
                ) {
                  return false;
                }

                // Check non-job URLs (e.g. company profiles, member profiles)
                if (isNonJobUrl(u)) return false;

                return true;
              } catch {
                return false;
              }
            });

          if (validUrls.length === 0 && effectiveText.length < 50) continue;

          const textSnippet = effectiveText.slice(0, 35000);

          candidatePayloads.push({
            subject,
            emailContentForAI: `
EMAIL SUBJECT:
${subject}

EMAIL TEXT:
${textSnippet}

LINKS FOUND IN EMAIL:
${validUrls.slice(0, 120).join('\n')}
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

          const cleanedUrl = cleanJobUrl(job.url);
          // Verify URL belongs to a valid job source (ATS, aggregator, verified career site)
          if (!isValidJobSource(cleanedUrl)) {
            console.log(`[Email Sync - ${providerLabel}] Skipping URL not recognized as valid job source: ${cleanedUrl}`);
            continue;
          }

          const jobTitle = job.title?.trim();
          if (!jobTitle || jobTitle.toLowerCase().includes('unknown') || jobTitle.toLowerCase() === 'overview') {
            continue;
          }

          const companyName = cleanCompanyName(job.company) || 'Unknown Company';
          if (jobTitle.toLowerCase() === companyName.toLowerCase() && (companyName.toLowerCase() === 'unknown company' || companyName.toLowerCase() === 'unknown')) {
            continue;
          }

          const boardMatch = detectJobSourceCategory(cleanedUrl, providerLabel);
          const sourceCategory = `Email Sync (${boardMatch})`;

          const shortDescParts = [job.description, job.requirements]
            .filter(Boolean)
            .map(s => String(s).trim())
            .filter(s => s.length > 0);
          const extractedDesc = shortDescParts.join('\n\n');
          const finalDesc =
            extractedDesc.length > 15
              ? `${extractedDesc}\n\nFound via email link: ${cleanedUrl}`
              : `Found via email link: ${cleanedUrl}`;

          let jobLocation = (job.location || '').trim();
          if (!jobLocation || jobLocation.toLowerCase() === 'unknown') {
            jobLocation = 'Remote';
          }

          rawJobs.push({
            title: jobTitle,
            company: companyName,
            location: jobLocation,
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
  onProgress?: (foundCount: number, message: string) => void,
  searchOverrides?: { keyword?: string; location?: string }
) {
  onProgress?.(0, 'Retrieving email configuration...');
  const prefs = await getUserSettings(userId);
  if (searchOverrides?.keyword && searchOverrides.keyword.trim()) {
    prefs.searchKeyword = searchOverrides.keyword.trim();
  }
  if (searchOverrides?.location && searchOverrides.location.trim()) {
    prefs.searchLocation = searchOverrides.location.trim();
  }

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

  console.log(`[Email Sync] Fetching candidate emails across ${activeAccounts.length} account(s) since ${sinceDate.toISOString()}... Target: "${prefs.searchKeyword || 'Any'}" in "${prefs.searchLocation || 'Any'}"`);

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

