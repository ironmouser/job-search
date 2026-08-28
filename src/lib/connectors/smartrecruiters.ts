/**
 * src/lib/connectors/smartrecruiters.ts
 *
 * SmartRecruiters Postings API & DOM connector.
 * Ingests structured JSON from https://api.smartrecruiters.com/v1/companies/{company}/postings
 */

import * as cheerio from 'cheerio';
import { ATSConnectorConfig, ConnectorResult, RawDiscoveredJob } from './types';
import { cleanCompanyName } from '../cleaners';
import { requestScraping } from '../httpClient';

export async function fetchSmartRecruitersJobs(
  config: ATSConnectorConfig & { maxJobs?: number }
): Promise<ConnectorResult> {
  const { companySlug, companyName: providedCompanyName, maxJobs = 100 } = config;
  const companyName = providedCompanyName || cleanCompanyName(companySlug) || companySlug;

  const allJobs: RawDiscoveredJob[] = [];
  const pageSize = 100;
  let offset = 0;
  let hasMore = true;

  try {
    while (hasMore && allJobs.length < maxJobs) {
      const apiUrl = `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(companySlug)}/postings?limit=${pageSize}&offset=${offset}`;

      const res = await requestScraping({
        url: apiUrl,
        responseType: 'json',
        timeoutMs: 15000,
      });

      if (res.statusCode === 403 || res.statusCode === 429) {
        return {
          success: allJobs.length > 0,
          jobs: allJobs,
          error: `SmartRecruiters API rate-limited or blocked: HTTP ${res.statusCode}`,
          statusCode: res.statusCode,
          isBlocked: true,
        };
      }

      if (res.statusCode >= 200 && res.statusCode < 300) {
        let body = res.body as any;
        if (typeof body === 'string') {
          try { body = JSON.parse(body); } catch {}
        }
        const rawJobs = Array.isArray(body?.content) ? body.content : [];
        if (rawJobs.length === 0) {
          hasMore = false;
          break;
        }

        for (const j of rawJobs) {
          if (!j.name || !j.id) continue;

          const jobUrl = `https://jobs.smartrecruiters.com/${companySlug}/${j.id}`;
          const locObj = j.location || {};
          const isRemote = locObj.remote || /remote/i.test(locObj.city || '');
          const locParts = [locObj.city, locObj.region, locObj.country].filter(Boolean);
          const locName = isRemote ? 'Remote' : (locParts.length > 0 ? locParts.join(', ') : 'Remote');

          allJobs.push({
            title: j.name.trim(),
            company: companyName,
            location: locName,
            description: `Apply directly at: ${jobUrl}`,
            url: jobUrl,
            applicationUrl: jobUrl,
            source: 'SmartRecruiters',
            atsPlatform: 'smartrecruiters',
            atsJobId: String(j.id || ''),
            department: j.department?.label || null,
            remoteType: isRemote ? 'REMOTE' : null,
            postedAt: j.releasedDate ? new Date(j.releasedDate) : null,
          });

          if (allJobs.length >= maxJobs) break;
        }

        offset += pageSize;
        const totalFound = body?.totalFound || 0;
        if (offset >= totalFound || rawJobs.length < pageSize) {
          hasMore = false;
        }
      } else {
        if (allJobs.length > 0) break;
        break;
      }
    }

    if (allJobs.length > 0) {
      return {
        success: true,
        jobs: allJobs,
        statusCode: 200,
      };
    }

    // HTML fallback
    const htmlUrl = `https://careers.smartrecruiters.com/${encodeURIComponent(companySlug)}`;
    const htmlRes = await requestScraping({
      url: htmlUrl,
      timeoutMs: 15000,
      responseType: 'text',
    });

    if (htmlRes.statusCode >= 200 && htmlRes.statusCode < 300 && typeof htmlRes.body === 'string') {
      const $ = cheerio.load(htmlRes.body);
      const jobs: RawDiscoveredJob[] = [];
      const pageTitleCompany = $('title').text().replace(/careers/i, '').trim() || companyName;

      $('li.opening-job, a.link--block, a[href*="smartrecruiters.com/' + companySlug + '/"]').each((_, el) => {
        const titleEl = $(el).find('h4, h3, h2').first();
        const title = titleEl.text().trim() || $(el).text().trim();
        const href = $(el).attr('href') || titleEl.attr('href') || '';
        if (!title || !href || title.length > 100) return;
        const fullUrl = href.startsWith('http') ? href : `https://jobs.smartrecruiters.com${href}`;

        jobs.push({
          title,
          company: pageTitleCompany,
          location: 'Remote',
          description: `Apply directly at: ${fullUrl}`,
          url: fullUrl,
          applicationUrl: fullUrl,
          source: 'SmartRecruiters',
        });
      });

      return {
        success: jobs.length > 0,
        jobs,
        statusCode: htmlRes.statusCode,
      };
    }

    return {
      success: false,
      jobs: [],
      error: `SmartRecruiters returned HTTP ${res.statusCode}`,
      statusCode: res.statusCode,
    };
  } catch (err: any) {
    return {
      success: false,
      jobs: [],
      error: err.message,
    };
  }
}
