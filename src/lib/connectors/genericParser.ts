/**
 * src/lib/connectors/genericParser.ts
 *
 * Universal career page parser for custom employer career sites and legacy ATS platforms.
 *
 * Deterministic Hierarchy:
 *  1. requestScraping static HTML fetch
 *  2. application/ld+json schema.org/JobPosting extraction
 *  3. Cheerio DOM links & job card discovery
 *  4. ScraperAPI (raw -> JS rendered for client-side SPAs)
 *  5. LLM Fallback (callAI task: 'extract' as failure recovery)
 */

import * as cheerio from 'cheerio';
import { ATSConnectorConfig, ConnectorResult, RawDiscoveredJob } from './types';
import { cleanCompanyName } from '../cleaners';
import { cleanJobUrl, isNonJobUrl, isSafePublicUrl } from '../urlUtils';
import { fetchWithScraperAPI } from '../scraperapi';
import { callAI } from '../ai';
import { requestScraping } from '../httpClient';
import { isClosedJobText } from '../jobStatusDetector';

function extractJobsFromJsonLd(html: string, pageUrl: string, fallbackCompany: string): RawDiscoveredJob[] {
  const jobs: RawDiscoveredJob[] = [];
  const $ = cheerio.load(html);

  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const raw = $(el).html() || '';
      const data = JSON.parse(raw);
      const items = Array.isArray(data)
        ? data
        : data['@graph'] && Array.isArray(data['@graph'])
        ? data['@graph']
        : [data];

      for (const item of items) {
        if (item?.['@type'] === 'JobPosting') {
          const title = item.title?.trim();
          if (!title) continue;
          if (isClosedJobText(title).isClosed || isClosedJobText(item.description).isClosed) continue;


          const company = item.hiringOrganization?.name || fallbackCompany;
          const directUrl = item.directApply || item.url;
          let jobUrl = pageUrl;
          if (directUrl && typeof directUrl === 'string' && directUrl.startsWith('http')) {
            jobUrl = directUrl;
          }

          let locName = 'Remote';
          const rawLoc = Array.isArray(item.jobLocation) ? item.jobLocation[0] : item.jobLocation;
          if (typeof rawLoc === 'string') {
            locName = rawLoc;
          } else if (rawLoc?.address) {
            if (typeof rawLoc.address === 'string') {
              locName = rawLoc.address;
            } else if (typeof rawLoc.address === 'object') {
              const parts = [rawLoc.address.addressLocality, rawLoc.address.addressRegion, rawLoc.address.addressCountry].filter(Boolean);
              if (parts.length > 0) locName = parts.join(', ');
            }
          }

          const isRemote = item.jobLocationType === 'TELECOMMUTE' ||
            item.applicantLocationRequirements !== undefined ||
            /remote|anywhere|work from home/i.test(locName);

          let salary: string | null = null;
          if (item.baseSalary) {
            const bs = item.baseSalary;
            const currency = bs.currency ? `${bs.currency} ` : '$';
            if (bs.value?.value) {
              salary = `${currency}${bs.value.value}`;
            } else if (typeof bs.value === 'number' || typeof bs.value === 'string') {
              salary = `${currency}${bs.value}`;
            } else if (bs.value?.minValue && bs.value?.maxValue) {
              salary = `${currency}${bs.value.minValue} - ${currency}${bs.value.maxValue}`;
            } else if (bs.minValue && bs.maxValue) {
              salary = `${currency}${bs.minValue} - ${currency}${bs.maxValue}`;
            }
          }

          const desc = item.description ? item.description.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : `Apply at: ${jobUrl}`;

          jobs.push({
            title,
            company: cleanCompanyName(company) || fallbackCompany,
            location: locName,
            salaryRange: salary,
            description: desc,
            url: cleanJobUrl(jobUrl),
            applicationUrl: directUrl ? cleanJobUrl(directUrl) : null,
            source: 'Direct Career Page',
            remoteType: isRemote ? 'REMOTE' : null,
            postedAt: item.datePosted ? new Date(item.datePosted) : null,
          });
        }
      }
    } catch {}
  });

  return jobs;
}

function extractJobsFromDomLinks(html: string, pageUrl: string, fallbackCompany: string): RawDiscoveredJob[] {
  const jobs: RawDiscoveredJob[] = [];
  const $ = cheerio.load(html);
  $('script, style, noscript, nav, footer, svg').remove();

  const seenUrls = new Set<string>();

  // Look for standard job listing link patterns
  const candidateSelectors = [
    'a[href*="/job/"]',
    'a[href*="/jobs/"]',
    'a[href*="/position/"]',
    'a[href*="/positions/"]',
    'a[href*="/careers/detail/"]',
    'a[href*="/opening/"]',
    'a[href*="gh_jid"]',
    'a[href*="lever_token"]',
    'a[href*="ashby_jid"]',
    'li[class*="job"] a',
    'div[class*="job-card"] a',
    'div[class*="position"] a',
  ];

  $(candidateSelectors.join(', ')).each((_, el) => {
    const title = $(el).find('h2, h3, h4, span, p').first().text().trim() || $(el).text().trim();
    const href = $(el).attr('href') || '';
    if (!title || !href || title.length < 3 || title.length > 120) return;
    if (isClosedJobText(title).isClosed) return;

    let fullUrl = href;
    try {
      fullUrl = href.startsWith('http') ? href : new URL(href, pageUrl).toString();
    } catch {
      return;
    }

    const cleanedUrl = cleanJobUrl(fullUrl);
    if (!cleanedUrl || isNonJobUrl(cleanedUrl) || seenUrls.has(cleanedUrl)) return;
    seenUrls.add(cleanedUrl);

    jobs.push({
      title,
      company: fallbackCompany,
      location: 'Remote',
      description: `Apply directly at: ${cleanedUrl}`,
      url: cleanedUrl,
      applicationUrl: cleanedUrl,
      source: 'Direct Career Page',
    });
  });

  return jobs;
}

async function extractJobsWithLLMFallback(html: string, pageUrl: string, companyName: string): Promise<RawDiscoveredJob[]> {
  try {
    const $ = cheerio.load(html);
    $('script, style, noscript, svg, nav, footer').remove();
    const cleanText = $('body').text().replace(/\s+/g, ' ').trim().slice(0, 10000);

    if (cleanText.length < 100) return [];

    const prompt = `Extract open job listings from this employer career page text.
Company Name: ${companyName}
Page URL: ${pageUrl}

Return ONLY valid JSON with no markdown backticks.
Format:
{
  "jobs": [
    {
      "title": "Job Title",
      "location": "Location or Remote",
      "url": "Direct job URL or ${pageUrl}",
      "salaryRange": null
    }
  ]
}

Page Content:
${cleanText}`;

    const res = await callAI({
      task: 'extract',
      jsonMode: true,
      messages: [{ role: 'user', content: prompt }],
    });

    const parsed = JSON.parse(res.replace(/```json/g, '').replace(/```/g, '').trim());
    if (Array.isArray(parsed?.jobs)) {
      return parsed.jobs
        .filter((j: any) => j.title && j.title.length > 2 && !isClosedJobText(j.title).isClosed)
        .map((j: any) => ({
          title: j.title.trim(),
          company: companyName,
          location: j.location || 'Remote',
          salaryRange: j.salaryRange || null,
          description: `Apply at: ${j.url || pageUrl}`,
          url: cleanJobUrl(j.url || pageUrl),
          applicationUrl: cleanJobUrl(j.url || pageUrl),
          source: 'Direct Career Page',
        }));
    }
  } catch (err: any) {
    console.warn(`[genericParser] LLM extraction fallback error for ${pageUrl}:`, err.message);
  }

  return [];
}


export async function fetchGenericCareerPageJobs(config: ATSConnectorConfig): Promise<ConnectorResult> {
  const { careerUrl, companyName: providedCompanyName, companySlug } = config;
  const targetUrl = careerUrl || `https://${config.domain || companySlug}/careers`;

  if (!isSafePublicUrl(targetUrl)) {
    return { success: false, jobs: [], error: 'Invalid or prohibited URL' };
  }

  const companyName = providedCompanyName || cleanCompanyName(companySlug) || 'Company';

  try {
    // ── Tier 1: Static HTML fetch ───────────────────────────────────────────
    let html = '';
    let isBlocked = false;

    try {
      const res = await requestScraping({
        url: targetUrl,
        timeoutMs: 15000,
        responseType: 'text',
      });

      if (res.statusCode === 403 || res.statusCode === 429) {
        isBlocked = true;
      } else if (res.statusCode >= 200 && res.statusCode < 300 && typeof res.body === 'string') {
        if (res.body.includes('Just a moment...') || res.body.includes('cf-challenge-error-title')) {
          isBlocked = true;
        } else {
          html = res.body;
        }
      }
    } catch (e: any) {
      console.warn(`[genericParser] Static fetch failed for ${targetUrl}:`, e.message);
    }

    // ── Tier 2 & 3: Parse static HTML (JSON-LD + DOM) ───────────────────────
    if (html) {
      const jsonLdJobs = extractJobsFromJsonLd(html, targetUrl, companyName);
      if (jsonLdJobs.length > 0) {
        return { success: true, jobs: jsonLdJobs };
      }

      const domJobs = extractJobsFromDomLinks(html, targetUrl, companyName);
      if (domJobs.length > 0) {
        return { success: true, jobs: domJobs };
      }
    }

    // ── Tier 4: ScraperAPI Proxy (Raw -> JS Render for Client-Side SPAs) ────
    if (!isBlocked) {
      const scraperHtml = await fetchWithScraperAPI(targetUrl, false, 8000);
      if (scraperHtml) {
        const jsonLdJobs = extractJobsFromJsonLd(scraperHtml, targetUrl, companyName);
        if (jsonLdJobs.length > 0) return { success: true, jobs: jsonLdJobs };

        const domJobs = extractJobsFromDomLinks(scraperHtml, targetUrl, companyName);
        if (domJobs.length > 0) return { success: true, jobs: domJobs };
      }

      // Escalate to JS rendering if page was client-side SPA
      const renderedHtml = await fetchWithScraperAPI(targetUrl, true, 12000);
      if (renderedHtml) {
        const jsonLdJobs = extractJobsFromJsonLd(renderedHtml, targetUrl, companyName);
        if (jsonLdJobs.length > 0) return { success: true, jobs: jsonLdJobs };

        const domJobs = extractJobsFromDomLinks(renderedHtml, targetUrl, companyName);
        if (domJobs.length > 0) return { success: true, jobs: domJobs };

        // ── Tier 5: LLM Fallback on rendered content ─────────────────────────
        const llmJobs = await extractJobsWithLLMFallback(renderedHtml, targetUrl, companyName);
        if (llmJobs.length > 0) {
          return { success: true, jobs: llmJobs };
        }
      }
    }

    if (isBlocked) {
      return {
        success: false,
        jobs: [],
        error: 'Site blocked by bot protection (Cloudflare / Turnstile)',
        isBlocked: true,
      };
    }

    return {
      success: false,
      jobs: [],
      error: 'No job listings found on career page',
    };
  } catch (err: any) {
    return {
      success: false,
      jobs: [],
      error: err.message,
    };
  }
}
