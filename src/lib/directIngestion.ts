/**
 * src/lib/directIngestion.ts
 *
 * Direct Ingestion Orchestrator.
 * Coordinates direct employer ingestion across modular ATS connectors and the generic parser.
 */

import { prisma } from './prisma';
import { fetchGreenhouseJobs } from './connectors/greenhouse';
import { fetchLeverJobs } from './connectors/lever';
import { fetchAshbyJobs } from './connectors/ashby';
import { fetchWorkableJobs } from './connectors/workable';
import { fetchSmartRecruitersJobs } from './connectors/smartrecruiters';
import { fetchWorkdayJobs } from './connectors/workday';
import { fetchGenericCareerPageJobs } from './connectors/genericParser';
import { RawDiscoveredJob, ConnectorResult } from './connectors/types';
import { detectAtsFromUrl, extractCompanySlug, ATSPlatform } from './atsDetector';
import { CURATED_EMPLOYER_SOURCES } from '../data/curatedSources';
import { cleanCompanyName } from './cleaners';

/**
 * Seeds the database with curated high-value direct employer sources if not already present.
 */
export async function seedCuratedCareerSources(): Promise<number> {
  let seeded = 0;
  for (const src of CURATED_EMPLOYER_SOURCES) {
    try {
      await prisma.careerSource.upsert({
        where: { domain: src.domain },
        update: {
          name: src.name,
          careerUrl: src.careerUrl,
          atsPlatform: src.atsPlatform,
          atsCompanySlug: src.atsCompanySlug,
          sourceType: 'DIRECT_CORPORATE',
        },
        create: {
          name: src.name,
          domain: src.domain,
          careerUrl: src.careerUrl,
          sourceType: 'DIRECT_CORPORATE',
          atsPlatform: src.atsPlatform,
          atsCompanySlug: src.atsCompanySlug,
          status: 'ACTIVE',
        },
      });
      seeded++;
    } catch (e: any) {
      console.warn(`[DirectIngestion] Error seeding source ${src.name}: ${e.message}`);
    }
  }
  return seeded;
}

/**
 * Crawls a single CareerSource record using the corresponding ATS connector or generic parser.
 */
export async function crawlCareerSource(source: {
  id?: string;
  name: string;
  domain?: string;
  careerUrl: string;
  atsPlatform?: string | null;
  atsCompanySlug?: string | null;
}): Promise<RawDiscoveredJob[]> {
  const ats = (source.atsPlatform || '').toLowerCase();
  const slug = source.atsCompanySlug || extractCompanySlug(source.careerUrl, source.name);
  const config = {
    companySlug: slug,
    companyName: source.name,
    domain: source.domain,
    careerUrl: source.careerUrl,
  };

  let result: ConnectorResult;

  switch (ats) {
    case 'greenhouse':
      result = await fetchGreenhouseJobs(config);
      break;
    case 'lever':
      result = await fetchLeverJobs(config);
      break;
    case 'ashby':
      result = await fetchAshbyJobs(config);
      break;
    case 'workable':
      result = await fetchWorkableJobs(config);
      break;
    case 'smartrecruiters':
      result = await fetchSmartRecruitersJobs(config);
      break;
    case 'workday':
      result = await fetchWorkdayJobs(config);
      break;
    default:
      // Run detection on URL if atsPlatform was unset
      const detection = detectAtsFromUrl(source.careerUrl, source.name);
      if (detection.platform === ATSPlatform.GREENHOUSE && detection.companySlug) {
        result = await fetchGreenhouseJobs({ ...config, companySlug: detection.companySlug });
      } else if (detection.platform === ATSPlatform.LEVER && detection.companySlug) {
        result = await fetchLeverJobs({ ...config, companySlug: detection.companySlug });
      } else if (detection.platform === ATSPlatform.ASHBY && detection.companySlug) {
        result = await fetchAshbyJobs({ ...config, companySlug: detection.companySlug });
      } else if (detection.platform === ATSPlatform.WORKABLE && detection.companySlug) {
        result = await fetchWorkableJobs({ ...config, companySlug: detection.companySlug });
      } else if (detection.platform === ATSPlatform.SMARTRECRUITERS && detection.companySlug) {
        result = await fetchSmartRecruitersJobs({ ...config, companySlug: detection.companySlug });
      } else if (detection.platform === ATSPlatform.WORKDAY) {
        result = await fetchWorkdayJobs(config);
      } else {
        result = await fetchGenericCareerPageJobs(config);
      }
  }

  // Update source statistics if source exists in database
  if (source.id) {
    try {
      const now = new Date();
      if (result.success) {
        await prisma.careerSource.update({
          where: { id: source.id },
          data: {
            lastCrawledAt: now,
            lastSuccessAt: now,
            activeJobsCount: result.jobs.length,
            status: 'ACTIVE',
            lastError: null,
          },
        });
      } else {
        await prisma.careerSource.update({
          where: { id: source.id },
          data: {
            lastCrawledAt: now,
            lastFailureAt: now,
            status: result.isBlocked ? 'BLOCKED' : 'TEMPORARILY_UNAVAILABLE',
            lastError: result.error || 'Crawling failed',
          },
        });
      }
    } catch (dbErr) {
      console.warn('[DirectIngestion] Failed to update CareerSource record:', dbErr);
    }
  }

  // Log outcome to scraper_logs
  try {
    await prisma.scraperLog.create({
      data: {
        scraperName: `Direct: ${source.name} (${ats || 'Generic'})`,
        targetUrl: source.careerUrl,
        status: result.success ? 'SUCCESS' : (result.jobs.length > 0 ? 'PARTIAL' : 'FAILURE'),
        resultsCount: result.jobs.length,
        errorDetails: result.error || null,
        usedFirecrawl: false,
        firecrawlSites: [],
      },
    });
  } catch {}

  return result.jobs;
}

/**
 * Crawls a list of custom employer URLs (e.g. from UserPreferences.customCareerPages)
 * using automatic ATS detection and modular connectors.
 */
export async function crawlCustomUrls(urls: string[]): Promise<RawDiscoveredJob[]> {
  if (!urls || urls.length === 0) return [];

  const allJobs: RawDiscoveredJob[] = [];

  for (const rawUrl of urls.slice(0, 15)) {
    if (!rawUrl || !rawUrl.startsWith('http')) continue;

    const detected = detectAtsFromUrl(rawUrl);
    const slug = detected.companySlug || extractCompanySlug(rawUrl);
    const companyName = cleanCompanyName(slug) || slug.charAt(0).toUpperCase() + slug.slice(1);

    const jobs = await crawlCareerSource({
      name: companyName,
      careerUrl: rawUrl,
      atsPlatform: detected.platform !== ATSPlatform.UNKNOWN ? detected.platform : null,
      atsCompanySlug: slug,
    });

    allJobs.push(...jobs);
  }

  return allJobs;
}
