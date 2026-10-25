import { prisma } from '@/lib/prisma';
import { getOptedInUsersCriteria, UserSearchCriteria } from './criteria';
import { clusterUsersIntoSearchGroups, SearchGroup } from './grouping';
import { evaluateJobRelevance, JobCandidate } from './jobRelevance';
import { runSearch } from '@/lib/search/runSearch';
import { bulkIngestRawJobsToGlobalDb } from '@/lib/jobs';
import { cleanJobUrl } from '@/lib/urlUtils';
import { sendJobMatchDigestEmail } from '@/lib/mailer';

export interface JobMatchCycleOptions {
  force?: boolean;      // bypass daily limit check
  dryRun?: boolean;     // evaluate matches without sending emails or committing
  userId?: string;      // run only for a specific user (testing/admin)
  dailyLimit?: number;  // custom daily email send cap (defaults to 50)
}

export interface JobMatchCycleResult {
  success: boolean;
  skipped?: boolean;
  reason?: string;
  runId?: string;
  durationMs?: number;
  emailsSentFromQueue?: number;
  emailsSentFromNewMatches?: number;
  emailsSent?: number;
  sentTodayTotal?: number;
  queueRemaining?: number;
  searchExecuted?: boolean;
  groupCount?: number;
  userCount?: number;
  rawJobsFound?: number;
  matchesCreated?: number;
  details?: Record<string, any>;
  error?: string;
}

export const DEFAULT_DAILY_EMAIL_LIMIT = 50;
const RUN_LOCK_TIMEOUT_MS = 2 * 60 * 60 * 1000; // 2 hours
const MIN_SEARCH_COOLDOWN_MS = 20 * 60 * 60 * 1000; // at most 1 scrape search per 20 hours

/**
 * Returns the count of distinct users who have already been sent a digest email today (UTC).
 */
export async function getEmailsSentTodayCount(): Promise<number> {
  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);

  const emailedItems = await prisma.jobMatchDigestItem.findMany({
    where: {
      emailedAt: { gte: startOfDay },
    },
    select: { userId: true },
    distinct: ['userId'],
  });

  return emailedItems.length;
}

/**
 * Returns the count of distinct users currently waiting in the email queue (emailedAt: null).
 */
export async function getPendingQueueUsersCount(): Promise<number> {
  const pendingItems = await prisma.jobMatchDigestItem.findMany({
    where: {
      emailedAt: null,
      user: {
        isDisabled: false,
        userPreferences: {
          jobMatchEmailsEnabled: true,
        },
      },
    },
    select: { userId: true },
    distinct: ['userId'],
  });

  return pendingItems.length;
}

interface PendingUserDigest {
  userId: string;
  email: string;
  name?: string | null;
  searchKeyword: string;
  matches: Array<{
    id: string;
    title: string;
    company: string;
    location?: string | null;
    salaryRange?: string | null;
    score: number;
  }>;
  itemIds: string[];
}

/**
 * Fetches all pending digest items grouped by user in FIFO order.
 */
async function fetchPendingUserDigests(): Promise<PendingUserDigest[]> {
  // Housekeeping: mark pending items for disabled or opted-out users as resolved
  await prisma.jobMatchDigestItem.updateMany({
    where: {
      emailedAt: null,
      user: {
        OR: [
          { isDisabled: true },
          { userPreferences: { jobMatchEmailsEnabled: false } },
        ],
      },
    },
    data: { emailedAt: new Date() },
  }).catch(() => {});

  const pendingItems = await prisma.jobMatchDigestItem.findMany({
    where: {
      emailedAt: null,
      user: {
        isDisabled: false,
        email: { not: null },
        userPreferences: {
          jobMatchEmailsEnabled: true,
        },
      },
    },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          name: true,
          userPreferences: {
            select: {
              searchKeyword: true,
            },
          },
        },
      },
      job: {
        select: {
          id: true,
          title: true,
          company: true,
          location: true,
          salaryRange: true,
          status: true,
        },
      },
    },
    orderBy: {
      createdAt: 'asc',
    },
  });

  const digestsByUser = new Map<string, PendingUserDigest>();

  for (const item of pendingItems) {
    if (!item.user?.email || !item.job || item.job.status === 'closed') {
      continue;
    }

    const userId = item.user.id;
    if (!digestsByUser.has(userId)) {
      digestsByUser.set(userId, {
        userId,
        email: item.user.email,
        name: item.user.name,
        searchKeyword: item.user.userPreferences?.searchKeyword || 'Jobs',
        matches: [],
        itemIds: [],
      });
    }

    const digest = digestsByUser.get(userId)!;
    digest.itemIds.push(item.id);
    digest.matches.push({
      id: item.job.id,
      title: item.job.title,
      company: item.job.company || 'Unknown Company',
      location: item.job.location || 'Remote',
      salaryRange: item.job.salaryRange,
      score: item.score,
    });
  }

  return Array.from(digestsByUser.values());
}

/**
 * Dispatches digest emails to a list of users, up to a specified quota.
 */
async function dispatchDigestBatch(
  digests: PendingUserDigest[],
  maxCount: number,
  dryRun: boolean,
  runId: string
): Promise<{ sentCount: number; sentUserIds: string[] }> {
  let sentCount = 0;
  const sentUserIds: string[] = [];
  const batch = digests.slice(0, maxCount);

  for (const digest of batch) {
    if (digest.matches.length === 0) continue;

    const sortedMatches = [...digest.matches].sort((a, b) => b.score - a.score);
    const top10 = sortedMatches.slice(0, 10);

    console.log(`[JobMatchCycle] Dispatching digest to ${digest.email} (${top10.length} of ${digest.matches.length} matches)...`);

    if (!dryRun) {
      try {
        const emailRes = await sendJobMatchDigestEmail({
          userId: digest.userId,
          to: digest.email,
          name: digest.name,
          keyword: digest.searchKeyword,
          matches: top10,
          totalMatchesCount: digest.matches.length,
        });

        if (emailRes.success) {
          sentCount++;
          sentUserIds.push(digest.userId);
          await prisma.jobMatchDigestItem.updateMany({
            where: {
              id: { in: digest.itemIds },
            },
            data: { emailedAt: new Date(), runId },
          });
        } else {
          console.warn(`[JobMatchCycle] Email delivery rejected for ${digest.email}: ${emailRes.error || 'Unknown error'}`);
        }
      } catch (err: any) {
        console.error(`[JobMatchCycle] Failed sending digest to ${digest.email}:`, err);
      }
    } else {
      console.log(`[JobMatchCycle - Dry Run] Would send digest to ${digest.email} with ${top10.length} matches.`);
      sentCount++;
      sentUserIds.push(digest.userId);
    }
  }

  return { sentCount, sentUserIds };
}

/**
 * Executes the Job Match cycle with daily rate limiting (max 50/day) and queue draining:
 * 1. Checks locks and counts emails already sent today.
 * 2. If existing users are in the queue, sends up to daily remaining allowance (max 50).
 * 3. Once the queue is completely drained, runs a new search cycle to discover new job matches.
 * 4. If quota remains today, sends to newly matched users up to the 50 limit; leaves the rest queued for tomorrow.
 */
export async function runJobMatchCycle(
  options: JobMatchCycleOptions = {}
): Promise<JobMatchCycleResult> {
  const startTime = Date.now();
  const {
    force = false,
    dryRun = false,
    userId,
    dailyLimit = DEFAULT_DAILY_EMAIL_LIMIT,
  } = options;

  console.log(`[JobMatchCycle] Starting queue-draining cycle (dailyLimit: ${dailyLimit}, force: ${force}, dryRun: ${dryRun}, targetUser: ${userId || 'all'})...`);

  // Step 1: Concurrency Lock Check
  const activeRun = await prisma.jobMatchRun.findFirst({
    where: { status: 'running' },
    orderBy: { startedAt: 'desc' },
  });

  if (activeRun) {
    const elapsedSinceStart = Date.now() - activeRun.startedAt.getTime();
    if (elapsedSinceStart < RUN_LOCK_TIMEOUT_MS) {
      console.warn(`[JobMatchCycle] Another run is currently in progress (${activeRun.id}), started ${Math.round(elapsedSinceStart / 60000)}m ago. Skipping.`);
      return {
        success: false,
        skipped: true,
        reason: `Another Job Match run is already in progress (${activeRun.id}).`,
      };
    }

    console.warn(`[JobMatchCycle] Recovering from timed-out run ${activeRun.id}. Marking as failed.`);
    await prisma.jobMatchRun.update({
      where: { id: activeRun.id },
      data: {
        status: 'failed',
        error: 'Abandoned run timed out after 2 hours',
        finishedAt: new Date(),
      },
    });
  }

  // Step 2: Calculate Daily Send Quota
  const alreadySentToday = await getEmailsSentTodayCount();
  let remainingQuota = force ? dailyLimit : Math.max(0, dailyLimit - alreadySentToday);

  console.log(`[JobMatchCycle] Today's send usage: ${alreadySentToday}/${dailyLimit}. Remaining quota: ${remainingQuota}.`);

  if (remainingQuota <= 0 && !force && !dryRun) {
    const pendingCount = await getPendingQueueUsersCount();
    console.log(`[JobMatchCycle] Daily send limit of ${dailyLimit} emails reached. ${pendingCount} users waiting in queue. Next batch will send tomorrow.`);
    return {
      success: true,
      skipped: true,
      reason: `Daily quota of ${dailyLimit} digest emails has been reached for today. ${pendingCount} users queued for tomorrow.`,
      sentTodayTotal: alreadySentToday,
      queueRemaining: pendingCount,
    };
  }

  // Step 3: Create JobMatchRun Record
  const run = await prisma.jobMatchRun.create({
    data: {
      status: 'running',
      details: {
        force,
        dryRun,
        dailyLimit,
        sentBeforeThisRun: alreadySentToday,
        targetedUserId: userId || null,
      },
    },
  });

  let emailsSentFromQueue = 0;
  let emailsSentFromNewMatches = 0;
  let totalRawFound = 0;
  let totalMatchesCreated = 0;
  let searchExecuted = false;
  let groupStats: any[] = [];
  let allOptedInUsersCount = 0;

  try {
    // Step 4: Check and Drain Existing Queue
    let pendingDigests = await fetchPendingUserDigests();
    if (userId) {
      pendingDigests = pendingDigests.filter(d => d.userId === userId);
    }

    const queueCountBeforeSend = pendingDigests.length;
    console.log(`[JobMatchCycle] Current pending email queue: ${queueCountBeforeSend} user(s).`);

    if (queueCountBeforeSend > 0 && remainingQuota > 0) {
      const { sentCount } = await dispatchDigestBatch(
        pendingDigests,
        remainingQuota,
        dryRun,
        run.id
      );

      emailsSentFromQueue += sentCount;
      remainingQuota = Math.max(0, remainingQuota - sentCount);
      console.log(`[JobMatchCycle] Sent ${sentCount} digest email(s) from pending queue. Remaining daily quota: ${remainingQuota}.`);
    }

    const queueRemainingAfterQueueSend = Math.max(0, queueCountBeforeSend - emailsSentFromQueue);

    // Step 5: Check if Queue is Drained. Only scrape when queue is empty!
    if (queueRemainingAfterQueueSend > 0 && !force) {
      console.log(`[JobMatchCycle] ${queueRemainingAfterQueueSend} user(s) still in queue. Halting cycle for today; new search will begin once queue is completely drained.`);
    } else {
      // The queue is now 0 (or force is true), so we execute a new search cycle!
      // Cooldown check: make sure we haven't already performed a full search sweep in the last 20 hours
      const recentSearchRun = await prisma.jobMatchRun.findFirst({
        where: {
          status: 'completed',
          rawJobsFound: { gt: 0 },
        },
        orderBy: { finishedAt: 'desc' },
      });

      const canSearch = force || !recentSearchRun?.finishedAt || (Date.now() - recentSearchRun.finishedAt.getTime() >= MIN_SEARCH_COOLDOWN_MS);

      if (!canSearch) {
        console.log('[JobMatchCycle] Queue is empty, but a full search was already completed within the last 20 hours. Next search will run tomorrow.');
      } else {
        console.log('[JobMatchCycle] Email queue is empty. Beginning new search and grouping cycle for fresh job matches...');
        searchExecuted = true;

        let allUsers = await getOptedInUsersCriteria();
        if (userId) {
          allUsers = allUsers.filter(u => u.userId === userId);
        }
        allOptedInUsersCount = allUsers.length;

        if (allUsers.length > 0) {
          const groups: SearchGroup[] = clusterUsersIntoSearchGroups(allUsers);
          console.log(`[JobMatchCycle] Clustered ${allUsers.length} user(s) into ${groups.length} search group(s).`);

          interface UserMatchItem {
            id: string;
            title: string;
            company: string;
            location?: string | null;
            salaryRange?: string | null;
            score: number;
          }
          const newlyMatchedUsers = new Map<string, { user: UserSearchCriteria; matches: UserMatchItem[] }>();

          for (const group of groups) {
            console.log(`[JobMatchCycle] Searching group ${group.id}: "${group.canonicalKeyword}" in "${group.canonicalLocation}" (${group.members.length} members)...`);

            let groupRawJobs: any[] = [];
            try {
              const searchRes = await runSearch({
                keyword: group.canonicalKeyword,
                location: group.canonicalLocation,
                remoteOnly: group.remoteOnly,
                noInternational: group.noInternational,
                sources: group.mergedSources,
                customCareerPages: group.mergedCustomCareerPages,
                isPro: group.members.some(m => m.isPro),
                enableAiExpansion: false,
              });
              groupRawJobs = searchRes.rawJobs || [];
            } catch (searchErr: any) {
              console.warn(`[JobMatchCycle] Search error for group ${group.id}: ${searchErr.message}`);
            }

            totalRawFound += groupRawJobs.length;

            if (groupRawJobs.length > 0) {
              await bulkIngestRawJobsToGlobalDb(groupRawJobs);
            }

            const cleanedUrls = Array.from(
              new Set(
                groupRawJobs
                  .map(j => cleanJobUrl(j.url || j.link))
                  .filter((u): u is string => typeof u === 'string' && u.length > 0)
              )
            );

            const dbJobs = cleanedUrls.length > 0
              ? await prisma.job.findMany({
                  where: {
                    url: { in: cleanedUrls },
                    status: { not: 'closed' },
                  },
                  select: {
                    id: true,
                    title: true,
                    company: true,
                    location: true,
                    salaryRange: true,
                    description: true,
                    url: true,
                    source: true,
                    status: true,
                  },
                })
              : [];

            let groupMatchesCount = 0;

            for (const member of group.members) {
              const [existingUserJobs, existingDigestItems] = await Promise.all([
                prisma.userJob.findMany({
                  where: { userId: member.userId },
                  select: {
                    jobId: true,
                    job: { select: { title: true, company: true } },
                  },
                }),
                prisma.jobMatchDigestItem.findMany({
                  where: { userId: member.userId },
                  select: { jobId: true },
                }),
              ]);

              const existingJobIds = new Set<string>([
                ...existingUserJobs.map(uj => uj.jobId),
                ...existingDigestItems.map(d => d.jobId),
              ]);

              const existingTitleCompany = new Set<string>(
                existingUserJobs.map(uj =>
                  `${(uj.job?.title || '').toLowerCase().trim()}|${(uj.job?.company || '').toLowerCase().trim()}`
                )
              );

              if (!newlyMatchedUsers.has(member.userId)) {
                newlyMatchedUsers.set(member.userId, { user: member, matches: [] });
              }
              const userEntry = newlyMatchedUsers.get(member.userId)!;

              const userJobsToCreate: { userId: string; jobId: string; status: string }[] = [];
              const digestItemsToCreate: { userId: string; jobId: string; runId: string; score: number }[] = [];

              for (const job of dbJobs) {
                if (existingJobIds.has(job.id)) continue;

                const titleCompKey = `${(job.title || '').toLowerCase().trim()}|${(job.company || '').toLowerCase().trim()}`;
                if (existingTitleCompany.has(titleCompKey)) continue;

                const relevance = evaluateJobRelevance(job as JobCandidate, member);
                if (!relevance.isMatch) continue;

                existingJobIds.add(job.id);
                existingTitleCompany.add(titleCompKey);

                const matchItem: UserMatchItem = {
                  id: job.id,
                  title: job.title,
                  company: job.company || 'Unknown Company',
                  location: job.location || 'Remote',
                  salaryRange: job.salaryRange,
                  score: relevance.score,
                };

                userEntry.matches.push(matchItem);

                userJobsToCreate.push({
                  userId: member.userId,
                  jobId: job.id,
                  status: 'discovered',
                });

                digestItemsToCreate.push({
                  userId: member.userId,
                  jobId: job.id,
                  runId: run.id,
                  score: relevance.score,
                });
              }

              if (!dryRun && userJobsToCreate.length > 0) {
                try {
                  await prisma.userJob.createMany({
                    data: userJobsToCreate,
                    skipDuplicates: true,
                  });
                } catch (ujErr: any) {
                  console.warn(`[JobMatchCycle] UserJob insert warning for user ${member.userId}: ${ujErr.message}`);
                }

                try {
                  await prisma.jobMatchDigestItem.createMany({
                    data: digestItemsToCreate,
                    skipDuplicates: true,
                  });
                } catch (diErr: any) {
                  console.warn(`[JobMatchCycle] JobMatchDigestItem insert warning for user ${member.userId}: ${diErr.message}`);
                }
              }

              groupMatchesCount += userJobsToCreate.length;
              totalMatchesCreated += userJobsToCreate.length;
            }

            groupStats.push({
              groupId: group.id,
              keyword: group.canonicalKeyword,
              memberCount: group.members.length,
              rawFound: groupRawJobs.length,
              matchesFound: groupMatchesCount,
            });
          }

          // Step 6: Dispatch from Newly Matched Users using remaining daily quota
          if (remainingQuota > 0) {
            // Find users who have matches and stage them
            const freshDigests: PendingUserDigest[] = [];
            for (const [, { user, matches }] of newlyMatchedUsers.entries()) {
              if (matches.length === 0) continue;
              freshDigests.push({
                userId: user.userId,
                email: user.email,
                name: user.name,
                searchKeyword: user.searchKeyword,
                matches,
                itemIds: [], // handled by runId update
              });
            }

            console.log(`[JobMatchCycle] ${freshDigests.length} user(s) have new matches. Remaining daily send allowance: ${remainingQuota}.`);

            for (const digest of freshDigests.slice(0, remainingQuota)) {
              const sortedMatches = [...digest.matches].sort((a, b) => b.score - a.score);
              const top10 = sortedMatches.slice(0, 10);

              console.log(`[JobMatchCycle] Dispatching fresh match email to ${digest.email} (${top10.length} matches)...`);

              if (!dryRun) {
                try {
                  const emailRes = await sendJobMatchDigestEmail({
                    userId: digest.userId,
                    to: digest.email,
                    name: digest.name,
                    keyword: digest.searchKeyword,
                    matches: top10,
                    totalMatchesCount: digest.matches.length,
                  });

                  if (emailRes.success) {
                    emailsSentFromNewMatches++;
                    remainingQuota--;
                    await prisma.jobMatchDigestItem.updateMany({
                      where: {
                        runId: run.id,
                        userId: digest.userId,
                      },
                      data: { emailedAt: new Date() },
                    });
                  } else {
                    console.warn(`[JobMatchCycle] Fresh email delivery rejected for ${digest.email}: ${emailRes.error || 'Unknown error'}`);
                  }
                } catch (emailErr: any) {
                  console.error(`[JobMatchCycle] Error sending fresh digest to ${digest.email}:`, emailErr);
                }
              } else {
                console.log(`[JobMatchCycle - Dry Run] Would send fresh digest to ${digest.email} with ${top10.length} matches.`);
                emailsSentFromNewMatches++;
                remainingQuota--;
              }
            }
          }
        }
      }
    }

    const finalQueueRemaining = await getPendingQueueUsersCount();
    const totalEmailsSent = emailsSentFromQueue + emailsSentFromNewMatches;
    const durationMs = Date.now() - startTime;

    // Step 7: Mark Run Completed
    await prisma.jobMatchRun.update({
      where: { id: run.id },
      data: {
        status: 'completed',
        finishedAt: new Date(),
        groupCount: groupStats.length,
        userCount: allOptedInUsersCount,
        rawJobsFound: totalRawFound,
        matchesCreated: totalMatchesCreated,
        emailsSent: totalEmailsSent,
        details: {
          force,
          dryRun,
          dailyLimit,
          durationMs,
          emailsSentFromQueue,
          emailsSentFromNewMatches,
          queueRemaining: finalQueueRemaining,
          searchExecuted,
          groups: groupStats,
        },
      },
    });

    console.log(`[JobMatchCycle] Run completed in ${(durationMs / 1000).toFixed(1)}s. Emails sent: ${totalEmailsSent} (queue: ${emailsSentFromQueue}, new matches: ${emailsSentFromNewMatches}). Users queued for next batch: ${finalQueueRemaining}.`);

    return {
      success: true,
      runId: run.id,
      durationMs,
      emailsSentFromQueue,
      emailsSentFromNewMatches,
      emailsSent: totalEmailsSent,
      sentTodayTotal: alreadySentToday + totalEmailsSent,
      queueRemaining: finalQueueRemaining,
      searchExecuted,
      groupCount: groupStats.length,
      userCount: allOptedInUsersCount,
      rawJobsFound: totalRawFound,
      matchesCreated: totalMatchesCreated,
      details: {
        force,
        dryRun,
        groups: groupStats,
      },
    };
  } catch (err: any) {
    console.error('[JobMatchCycle] Fatal error during cycle execution:', err);
    await prisma.jobMatchRun.update({
      where: { id: run.id },
      data: {
        status: 'failed',
        finishedAt: new Date(),
        error: err.message || 'Unknown cycle error',
      },
    }).catch(() => {});

    return {
      success: false,
      runId: run.id,
      durationMs: Date.now() - startTime,
      error: err.message || 'Unknown cycle error',
    };
  }
}
