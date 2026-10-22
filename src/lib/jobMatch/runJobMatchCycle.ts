import { prisma } from '@/lib/prisma';
import { getOptedInUsersCriteria, UserSearchCriteria } from './criteria';
import { clusterUsersIntoSearchGroups, SearchGroup } from './grouping';
import { evaluateJobRelevance, JobCandidate } from './jobRelevance';
import { runSearch } from '@/lib/search/runSearch';
import { bulkIngestRawJobsToGlobalDb } from '@/lib/jobs';
import { cleanJobUrl } from '@/lib/urlUtils';
import { sendJobMatchDigestEmail } from '@/lib/mailer';

export interface JobMatchCycleOptions {
  force?: boolean;      // bypass 44-hour completion guard
  dryRun?: boolean;     // evaluate matches without sending emails or committing matches
  userId?: string;      // run only for a specific opted-in user (testing/admin)
}

export interface JobMatchCycleResult {
  success: boolean;
  skipped?: boolean;
  reason?: string;
  runId?: string;
  durationMs?: number;
  groupCount?: number;
  userCount?: number;
  rawJobsFound?: number;
  matchesCreated?: number;
  emailsSent?: number;
  details?: Record<string, any>;
  error?: string;
}

const RUN_LOCK_TIMEOUT_MS = 2 * 60 * 60 * 1000; // 2 hours
const CYCLE_INTERVAL_MS = 44 * 60 * 60 * 1000;  // 44 hours (~every other day guard)

/**
 * Executes a full Job Match cycle:
 * 1. Checks locks and frequency guards (~44h).
 * 2. Fetches opted-in users and clusters their search criteria (>=60% similarity).
 * 3. Runs group-level scraping via runSearch and pools jobs into the global DB.
 * 4. Evaluates jobs against each user's criteria (>=60% relevance, strictly new roles).
 * 5. Persists new UserJob and JobMatchDigestItem records.
 * 6. Dispatches digest emails to users with new matches.
 */
export async function runJobMatchCycle(
  options: JobMatchCycleOptions = {}
): Promise<JobMatchCycleResult> {
  const startTime = Date.now();
  const { force = false, dryRun = false, userId } = options;

  console.log(`[JobMatchCycle] Starting cycle (force: ${force}, dryRun: ${dryRun}, userId: ${userId || 'all'})...`);

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

    // Previous run appears hung or abandoned (> 2 hours old)
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

  // Step 2: 44-Hour Frequency Guard
  if (!force && !dryRun && !userId) {
    // Fetch recent completed runs and exclude dry runs so tests don't lock out real email cycles
    const recentCompletedRuns = await prisma.jobMatchRun.findMany({
      where: { status: 'completed' },
      orderBy: { finishedAt: 'desc' },
      take: 10,
    });

    const lastCompleted = recentCompletedRuns.find(
      (r) => (r.details as any)?.dryRun !== true
    );

    if (lastCompleted && lastCompleted.finishedAt) {
      const elapsedSinceLastRun = Date.now() - lastCompleted.finishedAt.getTime();
      if (elapsedSinceLastRun < CYCLE_INTERVAL_MS) {
        const hoursRemaining = ((CYCLE_INTERVAL_MS - elapsedSinceLastRun) / (1000 * 60 * 60)).toFixed(1);
        console.log(`[JobMatchCycle] Last completed run was ${((elapsedSinceLastRun) / (1000 * 60 * 60)).toFixed(1)}h ago. Next run allowed in ${hoursRemaining}h. Skipping.`);
        return {
          success: true,
          skipped: true,
          reason: `Last run completed less than 44 hours ago. Next cycle eligible in ${hoursRemaining} hours.`,
        };
      }
    }
  }

  // Step 3: Create JobMatchRun Record
  const run = await prisma.jobMatchRun.create({
    data: {
      status: 'running',
      details: {
        force,
        dryRun,
        targetedUserId: userId || null,
      },
    },
  });

  let totalRawFound = 0;
  let totalMatchesCreated = 0;
  let totalEmailsSent = 0;
  const groupStats: Array<{
    groupId: string;
    keyword: string;
    memberCount: number;
    rawFound: number;
    matchesFound: number;
  }> = [];

  try {
    // Step 4: Fetch Opted-in Users and Cluster into Groups
    let allUsers = await getOptedInUsersCriteria();
    if (userId) {
      allUsers = allUsers.filter(u => u.userId === userId);
    }

    if (allUsers.length === 0) {
      console.log('[JobMatchCycle] No opted-in users found. Completing run.');
      await prisma.jobMatchRun.update({
        where: { id: run.id },
        data: {
          status: 'completed',
          finishedAt: new Date(),
          userCount: 0,
          groupCount: 0,
          rawJobsFound: 0,
          matchesCreated: 0,
          emailsSent: 0,
          details: { message: 'No opted-in users with valid search criteria' },
        },
      });

      return {
        success: true,
        runId: run.id,
        durationMs: Date.now() - startTime,
        userCount: 0,
        groupCount: 0,
        rawJobsFound: 0,
        matchesCreated: 0,
        emailsSent: 0,
      };
    }

    const groups: SearchGroup[] = clusterUsersIntoSearchGroups(allUsers);
    console.log(`[JobMatchCycle] Clustered ${allUsers.length} user(s) into ${groups.length} search group(s).`);

    // Map user ID to candidate matches for email delivery
    interface UserMatchItem {
      id: string;
      title: string;
      company: string;
      location?: string | null;
      salaryRange?: string | null;
      score: number;
    }
    const userMatchesMap = new Map<string, { user: UserSearchCriteria; matches: UserMatchItem[] }>();

    // Step 5: Execute Searches for each Group
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

      // Ingest jobs to global DB pool so all records get unique UUIDs
      if (groupRawJobs.length > 0) {
        await bulkIngestRawJobsToGlobalDb(groupRawJobs);
      }

      // Query database for the active Job records from this search
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

      // Step 6: Evaluate Jobs for Each Member
      for (const member of group.members) {
        // Fetch existing jobs to avoid duplicating listings or near-duplicate company/title
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

        if (!userMatchesMap.has(member.userId)) {
          userMatchesMap.set(member.userId, { user: member, matches: [] });
        }
        const userEntry = userMatchesMap.get(member.userId)!;

        const newJobMatchesForMember: UserMatchItem[] = [];
        const userJobsToCreate: { userId: string; jobId: string; status: string }[] = [];
        const digestItemsToCreate: { userId: string; jobId: string; runId: string; score: number }[] = [];

        for (const job of dbJobs) {
          if (existingJobIds.has(job.id)) continue;

          const titleCompKey = `${(job.title || '').toLowerCase().trim()}|${(job.company || '').toLowerCase().trim()}`;
          if (existingTitleCompany.has(titleCompKey)) continue;

          // Rule-based 60% relevance check
          const relevance = evaluateJobRelevance(job as JobCandidate, member);
          if (!relevance.isMatch) continue;

          // Mark as accounted for in this run
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

          newJobMatchesForMember.push(matchItem);
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

        // Persist records for this member if not in dry-run mode
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

        groupMatchesCount += newJobMatchesForMember.length;
        totalMatchesCreated += newJobMatchesForMember.length;
      }

      groupStats.push({
        groupId: group.id,
        keyword: group.canonicalKeyword,
        memberCount: group.members.length,
        rawFound: groupRawJobs.length,
        matchesFound: groupMatchesCount,
      });
    }

    // Step 7: Send Digest Emails to Users with New Matches
    for (const [, { user, matches }] of userMatchesMap.entries()) {
      if (matches.length === 0) continue;

      // Sort descending by relevance score and pick top 10 for email
      const sortedMatches = [...matches].sort((a, b) => b.score - a.score);
      const top10 = sortedMatches.slice(0, 10);

      console.log(`[JobMatchCycle] Preparing digest email for ${user.email} (${top10.length} of ${matches.length} matches)...`);

      if (!dryRun) {
        try {
          const emailRes = await sendJobMatchDigestEmail({
            userId: user.userId,
            to: user.email,
            name: user.name,
            keyword: user.searchKeyword,
            matches: top10,
            totalMatchesCount: matches.length,
          });

          if (emailRes.success) {
            totalEmailsSent++;
            await prisma.jobMatchDigestItem.updateMany({
              where: {
                runId: run.id,
                userId: user.userId,
                jobId: { in: top10.map(j => j.id) },
              },
              data: { emailedAt: new Date() },
            });
          } else {
            console.warn(`[JobMatchCycle] Email delivery failed for ${user.email}: ${emailRes.error || 'Unknown error'}`);
          }
        } catch (emailErr: any) {
          console.error(`[JobMatchCycle] Error sending digest to ${user.email}:`, emailErr);
        }
      } else {
        console.log(`[JobMatchCycle - Dry Run] Would send email to ${user.email} with ${top10.length} matches.`);
      }
    }

    // Step 8: Mark Run Completed
    const durationMs = Date.now() - startTime;
    await prisma.jobMatchRun.update({
      where: { id: run.id },
      data: {
        status: 'completed',
        finishedAt: new Date(),
        groupCount: groups.length,
        userCount: allUsers.length,
        rawJobsFound: totalRawFound,
        matchesCreated: totalMatchesCreated,
        emailsSent: totalEmailsSent,
        details: {
          force,
          dryRun,
          durationMs,
          groups: groupStats,
        },
      },
    });

    console.log(`[JobMatchCycle] Finished successfully in ${(durationMs / 1000).toFixed(1)}s. ${totalMatchesCreated} match(es) created, ${totalEmailsSent} email(s) sent.`);

    return {
      success: true,
      runId: run.id,
      durationMs,
      groupCount: groups.length,
      userCount: allUsers.length,
      rawJobsFound: totalRawFound,
      matchesCreated: totalMatchesCreated,
      emailsSent: totalEmailsSent,
      details: {
        force,
        dryRun,
        groups: groupStats,
      },
    };
  } catch (err: any) {
    console.error('[JobMatchCycle] Fatal error during cycle:', err);
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
