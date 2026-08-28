/**
 * src/lib/sourceDiscovery.ts
 *
 * SourceDiscoveryService — Passively detects and registers direct employer
 * career sources and ATS portals from incoming job listings and aggregator feeds.
 */

import { prisma } from './prisma';
import { detectAtsFromUrl, extractCompanySlug, ATSPlatform, sanitizeSlug } from './atsDetector';
import { cleanCompanyName } from './cleaners';
import { cleanJobUrl, isNonJobUrl, isSafePublicUrl } from './urlUtils';

export interface DiscoveredSourceMetadata {
  name: string;
  domain: string;
  careerUrl: string;
  atsPlatform?: string | null;
  atsCompanySlug?: string | null;
}

/**
 * Inspects a job's URLs to determine if it points to a direct employer ATS or career site.
 * Returns metadata if a high-confidence direct source is identified.
 */
export function identifyDirectSourceFromJob(job: {
  company?: string | null;
  url?: string | null;
  applicationUrl?: string | null;
}): DiscoveredSourceMetadata | null {
  const company = cleanCompanyName(job.company || '') || '';
  const appUrl = job.applicationUrl ? cleanJobUrl(job.applicationUrl) : null;
  const directUrl = job.url ? cleanJobUrl(job.url) : null;

  const targetUrls = [appUrl, directUrl].filter(Boolean) as string[];

  for (const url of targetUrls) {
    if (isNonJobUrl(url) || !isSafePublicUrl(url)) continue;

    const detection = detectAtsFromUrl(url, company);
    if (detection.platform !== ATSPlatform.UNKNOWN && detection.confidence >= 80) {
      const slug = detection.companySlug || sanitizeSlug(company);
      if (!slug || slug === 'company' || slug === 'jobs' || slug === 'search') continue;

      let canonicalCareerUrl = url;
      let domain = `${slug}.com`;

      switch (detection.platform) {
        case ATSPlatform.GREENHOUSE:
          canonicalCareerUrl = `https://boards.greenhouse.io/${slug}`;
          break;
        case ATSPlatform.LEVER:
          canonicalCareerUrl = `https://jobs.lever.co/${slug}`;
          break;
        case ATSPlatform.ASHBY:
          canonicalCareerUrl = `https://jobs.ashbyhq.com/${slug}`;
          break;
        case ATSPlatform.WORKABLE:
          canonicalCareerUrl = `https://apply.workable.com/${slug}`;
          break;
        case ATSPlatform.SMARTRECRUITERS:
          canonicalCareerUrl = `https://careers.smartrecruiters.com/${slug}`;
          break;
        case ATSPlatform.WORKDAY:
          try {
            const parsed = new URL(url);
            domain = parsed.hostname.replace(/^www\./, '');
            const pathParts = parsed.pathname.split('/').filter(Boolean);
            const nonLocale = pathParts.filter(p => !/^[a-z]{2}(?:-[a-z]{2,4})?$/i.test(p) && p.toLowerCase() !== 'job' && !p.startsWith('JR') && !p.startsWith('R'));
            const site = nonLocale.length > 0 ? nonLocale[0] : `${slug}_Careers`;
            canonicalCareerUrl = `https://${parsed.hostname}/${site}`;
          } catch {}
          break;
        default:
          try {
            const parsed = new URL(url);
            domain = parsed.hostname.replace(/^www\./, '');
            canonicalCareerUrl = `https://${domain}/careers`;
          } catch {}
      }

      const cleanName = company.length >= 2 && !/unknown/i.test(company)
        ? company
        : slug.charAt(0).toUpperCase() + slug.slice(1);

      return {
        name: cleanName,
        domain: sanitizeSlug(domain).replace(/-com$/, '.com').replace(/-io$/, '.io').replace(/-ai$/, '.ai'),
        careerUrl: canonicalCareerUrl,
        atsPlatform: detection.platform,
        atsCompanySlug: slug,
      };
    }
  }

  return null;
}

/**
 * Sniffs an individual job and upserts any newly discovered direct employer source.
 */
export async function sniffAndRegisterSource(job: {
  company?: string | null;
  url?: string | null;
  applicationUrl?: string | null;
}): Promise<boolean> {
  const discovered = identifyDirectSourceFromJob(job);
  if (!discovered) return false;

  try {
    await prisma.careerSource.upsert({
      where: { domain: discovered.domain },
      update: {
        name: discovered.name,
        careerUrl: discovered.careerUrl,
        atsPlatform: discovered.atsPlatform || undefined,
        atsCompanySlug: discovered.atsCompanySlug || undefined,
        status: 'ACTIVE',
      },
      create: {
        name: discovered.name,
        domain: discovered.domain,
        careerUrl: discovered.careerUrl,
        sourceType: 'DIRECT_CORPORATE',
        atsPlatform: discovered.atsPlatform,
        atsCompanySlug: discovered.atsCompanySlug,
        status: 'ACTIVE',
      },
    });

    console.info(`[SourceDiscovery] Registered direct employer: ${discovered.name} (${discovered.atsPlatform} → ${discovered.atsCompanySlug})`);
    return true;
  } catch (err: any) {
    console.warn(`[SourceDiscovery] Failed to register source ${discovered.name}: ${err.message}`);
    return false;
  }
}

/**
 * Passively scans a batch of raw scraped jobs from any source and auto-registers
 * direct employers into the CareerSource registry.
 */
export async function bulkSniffAndRegisterSources(rawJobs: any[]): Promise<number> {
  if (!rawJobs || rawJobs.length === 0) return 0;

  const discoveredMap = new Map<string, DiscoveredSourceMetadata>();

  for (const j of rawJobs) {
    const meta = identifyDirectSourceFromJob(j);
    if (meta && !discoveredMap.has(meta.domain)) {
      discoveredMap.set(meta.domain, meta);
    }
  }

  if (discoveredMap.size === 0) return 0;

  const entries = Array.from(discoveredMap.values());
  let registeredCount = 0;

  // Process with concurrency batching
  const batchSize = 10;
  for (let i = 0; i < entries.length; i += batchSize) {
    const batch = entries.slice(i, i + batchSize);
    await Promise.allSettled(
      batch.map(async (meta) => {
        try {
          await prisma.careerSource.upsert({
            where: { domain: meta.domain },
            update: {
              name: meta.name,
              careerUrl: meta.careerUrl,
              atsPlatform: meta.atsPlatform || undefined,
              atsCompanySlug: meta.atsCompanySlug || undefined,
              status: 'ACTIVE',
            },
            create: {
              name: meta.name,
              domain: meta.domain,
              careerUrl: meta.careerUrl,
              sourceType: 'DIRECT_CORPORATE',
              atsPlatform: meta.atsPlatform,
              atsCompanySlug: meta.atsCompanySlug,
              status: 'ACTIVE',
            },
          });
          registeredCount++;
        } catch (e: any) {
          console.warn(`[SourceDiscovery] Bulk upsert error for ${meta.name}: ${e.message}`);
        }
      })
    );
  }

  if (registeredCount > 0) {
    console.info(`[SourceDiscovery] Auto-discovered & registered ${registeredCount} direct corporate career sources.`);
  }

  return registeredCount;
}
