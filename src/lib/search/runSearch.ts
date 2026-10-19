import { prisma } from '@/lib/prisma';
import {
  scrapeCustomPages,
  scrapeRemoteAggregators,
  scrapeRemotePOC,
  scrapeHimalayas,
  scrapeJobicy,
  scrapeJobspresso,
  scrapeIndeed,
  scrapeLinkedIn,
  scrapeZipRecruiter,
  scrapeInternational,
  scrapeDice,
  scrapeSnagajob,
  scrapeBuiltIn,
  scrapeUSAJobs,
} from '@/lib/scrapers/crawlee';
import { isUsLocation, isRemoteLocation, extractStateAbbr, isOutsideUsLocation } from '@/lib/locationUtils';
import { expandSearchKeywords, expandSearchKeywordsWithAI, splitTargetRoles } from '@/lib/keywordExpansion';
import { isClosedJobRecord } from '@/lib/jobStatusDetector';
import { computeRoleMatchScore } from '@/lib/roleMatcher';

export interface RunSearchOptions {
  keyword: string;
  location?: string;
  remoteOnly?: boolean;
  noInternational?: boolean;
  sources: Record<string, boolean>;
  customCareerPages?: string[];
  isPro?: boolean;
  remotepocIsPro?: boolean;
  enableAiExpansion?: boolean;
  userId?: string;
  onProgress?: (event: {
    type: 'status' | 'progress';
    foundCount: number;
    message: string;
  }) => void;
}

export interface RunSearchResult {
  rawJobs: any[];
  totalRawFound: number;
}

export async function runSearch(options: RunSearchOptions): Promise<RunSearchResult> {
  const {
    keyword,
    location = 'Remote',
    remoteOnly = false,
    noInternational = false,
    sources,
    customCareerPages = [],
    isPro = false,
    remotepocIsPro = true,
    enableAiExpansion = false,
    userId,
    onProgress,
  } = options;

  const emitProgress = (type: 'status' | 'progress', foundCount: number, message: string) => {
    if (onProgress) {
      try {
        onProgress({ type, foundCount, message });
      } catch (e) {
        // ignore callback errors
      }
    }
  };

  emitProgress('status', 0, `Connecting to job sources for ${keyword}...`);

  let totalRawJobsFound = 0;
  const allRawJobs: any[] = [];
  const seenScrapedUrls = new Set<string>();

  const registerJobs = (sourceLabel: string, rawList: any[]) => {
    if (!rawList || rawList.length === 0) return;
    let added = 0;
    for (const job of rawList) {
      const url = job.url || job.link;
      if (!url || seenScrapedUrls.has(url)) continue;
      if (isClosedJobRecord(job)) continue;
      seenScrapedUrls.add(url);
      allRawJobs.push(job);
      added++;
    }
    if (added > 0) {
      totalRawJobsFound += added;
      emitProgress('progress', totalRawJobsFound, `Found ${added} new listings on ${sourceLabel} (${totalRawJobsFound} total)`);
    }
  };

  // Step 1: Database Pre-Match (0ms wait)
  const initialKeywords = expandSearchKeywords(keyword);
  const aiExpansionPromise = (enableAiExpansion && userId)
    ? expandSearchKeywordsWithAI(keyword, userId)
    : Promise.resolve([] as string[]);

  try {
    const titleConditions = initialKeywords.map(kw => ({
      title: { contains: kw, mode: 'insensitive' as const },
    }));

    const dbFirstJobs = await prisma.job.findMany({
      where: {
        status: { not: 'closed' },
        isArchived: false,
        createdAt: { gte: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000) },
        OR: titleConditions,
      },
      take: 200,
      orderBy: { createdAt: 'desc' },
    });

    const filteredDbFirst = dbFirstJobs.filter(j => {
      if (isClosedJobRecord(j)) return false;
      if (remoteOnly && !isRemoteLocation(j.location || '')) return false;
      if (noInternational && isOutsideUsLocation(j.location || '')) return false;
      const matchScore = computeRoleMatchScore(j.title, keyword, j.description);
      return matchScore > 0;
    });

    if (filteredDbFirst.length > 0) {
      registerJobs('Database Pool', filteredDbFirst);
    }

    if (enableAiExpansion) {
      const aiTerms = await Promise.race([
        aiExpansionPromise,
        new Promise<string[]>(resolve => setTimeout(() => resolve([]), 1500)),
      ]);
      const novelAiTerms = aiTerms.filter(t => !initialKeywords.some(ik => ik.toLowerCase() === t.toLowerCase()));
      if (novelAiTerms.length > 0) {
        const aiTitleConditions = novelAiTerms.map(kw => ({
          title: { contains: kw, mode: 'insensitive' as const },
        }));
        const dbAiJobs = await prisma.job.findMany({
          where: {
            status: { not: 'closed' },
            isArchived: false,
            createdAt: { gte: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000) },
            OR: aiTitleConditions,
          },
          take: 150,
          orderBy: { createdAt: 'desc' },
        });

        const filteredDbAi = dbAiJobs.filter(j => {
          if (isClosedJobRecord(j)) return false;
          if (remoteOnly && !isRemoteLocation(j.location || '')) return false;
          if (noInternational && isOutsideUsLocation(j.location || '')) return false;
          const matchScore = computeRoleMatchScore(j.title, keyword, j.description);
          return matchScore > 0;
        });

        if (filteredDbAi.length > 0) {
          registerJobs('Database Pool (Expanded)', filteredDbAi);
        }
      }
    }
  } catch (dbErr: any) {
    console.warn(`[Search Pre-Check Warning]: ${dbErr.message}`);
  }

  // Step 2: Derive keyword variants for live scraper rotation
  const subRoles = splitTargetRoles(keyword);
  const scraperKeywords = initialKeywords.slice(0, Math.min(6, Math.max(3, subRoles.length)));

  const tasks: Promise<void>[] = [];

  const runScraperTask = async (name: string, fn: () => Promise<any[]>, timeoutMs = 25000) => {
    emitProgress('status', totalRawJobsFound, `Querying ${name}...`);
    let timerId: NodeJS.Timeout | null = null;
    try {
      const timeoutPromise = new Promise<any[]>((_, reject) => {
        timerId = setTimeout(() => reject(new Error(`${name} scraper timed out after ${timeoutMs}ms`)), timeoutMs);
      });
      const res = await Promise.race([fn(), timeoutPromise]);
      if (res && res.length > 0) {
        registerJobs(name, res);
      }
    } catch (err: any) {
      console.warn(`Scraper task [${name}] issue: ${err.message}`);
    } finally {
      if (timerId) clearTimeout(timerId);
    }
  };

  // Determine locations to query across location-aware job boards
  const hasState = extractStateAbbr(location) !== null;
  const isGenericRemote = isRemoteLocation(location) && !hasState;
  const isOutsideUs = isOutsideUsLocation(location);

  let locationList: string[];
  if (isGenericRemote) {
    locationList = ['Remote'];
  } else if (isOutsideUs) {
    locationList = [location];
  } else if (isUsLocation(location) || hasState) {
    const cleanLocal = location.replace(/remote/i, '').replace(/^[\s,]+|[\s,]+$/g, '').trim() || location;
    locationList = Array.from(new Set([cleanLocal, 'Remote']));
  } else {
    locationList = [location];
  }

  // Location-aware scrapers: rotate over scraperKeywords × locationList
  if (sources.indeed) {
    for (const kw of scraperKeywords) {
      for (const loc of locationList) {
        const label = scraperKeywords.length > 1 || locationList.length > 1 ? `Indeed (${kw} · ${loc})` : 'Indeed';
        tasks.push(runScraperTask(label, () => scrapeIndeed(kw, loc), 25000));
      }
    }
  }
  if (sources.linkedin) {
    for (const kw of scraperKeywords) {
      for (const loc of locationList) {
        const label = scraperKeywords.length > 1 || locationList.length > 1 ? `LinkedIn (${kw} · ${loc})` : 'LinkedIn';
        tasks.push(runScraperTask(label, () => scrapeLinkedIn(kw, loc), 25000));
      }
    }
  }
  if (sources.ziprecruiter) {
    for (const kw of scraperKeywords) {
      for (const loc of locationList) {
        const label = scraperKeywords.length > 1 || locationList.length > 1 ? `ZipRecruiter (${kw} · ${loc})` : 'ZipRecruiter';
        tasks.push(runScraperTask(label, () => scrapeZipRecruiter(kw, loc), 25000));
      }
    }
  }
  if (sources.dice && isPro) {
    for (const kw of scraperKeywords) {
      for (const loc of locationList) {
        const label = scraperKeywords.length > 1 || locationList.length > 1 ? `Dice (${kw} · ${loc})` : 'Dice';
        tasks.push(runScraperTask(label, () => scrapeDice(kw, loc), 25000));
      }
    }
  }
  if (customCareerPages.length > 0) {
    tasks.push(runScraperTask('Custom Career Pages', () => scrapeCustomPages(customCareerPages), 25000));
  }
  if (sources.weworkremotely || sources.remoteok || sources.workingnomads || sources.remotive || sources.arbeitnow || sources.ycombinator || sources.nodesk) {
    for (const kw of scraperKeywords) {
      tasks.push(runScraperTask(
        scraperKeywords.length > 1 ? `Remote Aggregators (${kw})` : 'Remote Aggregators',
        () => scrapeRemoteAggregators(kw, sources, (srcName, count, jobs) => registerJobs(srcName, jobs)),
        15000
      ));
    }
  }
  if (sources.himalayas) {
    for (const kw of scraperKeywords) {
      tasks.push(runScraperTask(scraperKeywords.length > 1 ? `Himalayas (${kw})` : 'Himalayas', () => scrapeHimalayas(kw), 10000));
    }
  }
  if (sources.jobicy) {
    for (const kw of scraperKeywords) {
      tasks.push(runScraperTask(scraperKeywords.length > 1 ? `Jobicy (${kw})` : 'Jobicy', () => scrapeJobicy(kw), 10000));
    }
  }
  if (sources.jobspresso) {
    for (const kw of scraperKeywords) {
      tasks.push(runScraperTask(scraperKeywords.length > 1 ? `Jobspresso (${kw})` : 'Jobspresso', () => scrapeJobspresso(kw), 10000));
    }
  }
  if (sources.snagajob) {
    for (const kw of scraperKeywords) {
      for (const loc of locationList) {
        const label = scraperKeywords.length > 1 || locationList.length > 1 ? `Snagajob (${kw} · ${loc})` : 'Snagajob';
        tasks.push(runScraperTask(label, () => scrapeSnagajob(kw, loc), 25000));
      }
    }
  }
  if (sources.builtin) {
    for (const kw of scraperKeywords) {
      for (const loc of locationList) {
        const label = scraperKeywords.length > 1 || locationList.length > 1 ? `Built In (${kw} · ${loc})` : 'Built In';
        tasks.push(runScraperTask(label, () => scrapeBuiltIn(kw, loc), 25000));
      }
    }
  }
  if (sources.usajobs) {
    for (const kw of scraperKeywords) {
      for (const loc of locationList) {
        const label = scraperKeywords.length > 1 || locationList.length > 1 ? `USAJobs (${kw} · ${loc})` : 'USAJobs';
        tasks.push(runScraperTask(label, () => scrapeUSAJobs(kw, loc), 20000));
      }
    }
  }
  if (sources.remotepoc && (isPro || !remotepocIsPro)) {
    tasks.push(runScraperTask('RemotePOC', () => scrapeRemotePOC(keyword), 12000));
  }
  const INTERNATIONAL_SOURCE_KEYS = ['themuse', 'computrabajo', 'jobbank', 'arbeitnow'];
  if (isPro && INTERNATIONAL_SOURCE_KEYS.some((s: string) => sources[s])) {
    tasks.push(runScraperTask('International Boards', () => scrapeInternational(keyword, sources), 25000));
  }

  // Background AI keyword expansion (only if enabled)
  if (enableAiExpansion) {
    const backgroundAiScraperTask = aiExpansionPromise.then(aiTerms => {
      const novelTerms = (aiTerms || []).filter(t => !initialKeywords.some(ik => ik.toLowerCase() === t.toLowerCase())).slice(0, 2);
      if (novelTerms.length > 0) {
        const additionalTasks: Promise<void>[] = [];
        for (const kw of novelTerms) {
          if (sources.himalayas) additionalTasks.push(runScraperTask(`Himalayas (${kw})`, () => scrapeHimalayas(kw), 10000));
          if (sources.jobicy) additionalTasks.push(runScraperTask(`Jobicy (${kw})`, () => scrapeJobicy(kw), 10000));
          if (sources.jobspresso) additionalTasks.push(runScraperTask(`Jobspresso (${kw})`, () => scrapeJobspresso(kw), 10000));
          if (sources.weworkremotely || sources.remoteok || sources.remotive) {
            additionalTasks.push(runScraperTask(
              `Remote Aggregators (${kw})`,
              () => scrapeRemoteAggregators(kw, sources, (srcName, count, jobs) => registerJobs(srcName, jobs)),
              12000
            ));
          }
        }
        return Promise.allSettled(additionalTasks);
      }
    }).catch(err => {
      console.warn(`[AI Expansion Background Notice]: ${err.message}`);
    });

    tasks.push(backgroundAiScraperTask as any);
  }

  await Promise.allSettled(tasks);

  return {
    rawJobs: allRawJobs,
    totalRawFound: totalRawJobsFound,
  };
}
