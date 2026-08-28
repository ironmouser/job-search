/**
 * src/lib/connectors/workable.ts
 *
 * Workable Widget API & DOM connector.
 * Ingests structured JSON from https://apply.workable.com/api/v1/widget/accounts/{company}
 */

import * as cheerio from 'cheerio';
import { ATSConnectorConfig, ConnectorResult, RawDiscoveredJob } from './types';
import { cleanCompanyName } from '../cleaners';
import { requestScraping } from '../httpClient';

export async function fetchWorkableJobs(config: ATSConnectorConfig): Promise<ConnectorResult> {
  const { companySlug, companyName: providedCompanyName } = config;
  const companyName = providedCompanyName || cleanCompanyName(companySlug) || companySlug;
  const apiUrl = `https://apply.workable.com/api/v1/widget/accounts/${encodeURIComponent(companySlug)}`;

  try {
    const res = await requestScraping({
      url: apiUrl,
      responseType: 'json',
      timeoutMs: 15000,
    });

    if (res.statusCode === 403 || res.statusCode === 429) {
      return {
        success: false,
        jobs: [],
        error: `Workable API rate-limited or blocked: HTTP ${res.statusCode}`,
        statusCode: res.statusCode,
        isBlocked: true,
      };
    }

    if (res.statusCode >= 200 && res.statusCode < 300) {
      let body = res.body as any;
      if (typeof body === 'string') {
        try { body = JSON.parse(body); } catch {}
      }
      const rawJobs = Array.isArray(body?.jobs) ? body.jobs : (Array.isArray(body?.results) ? body.results : []);
      const jobs: RawDiscoveredJob[] = [];
      const orgName = body?.name || companyName;

      for (const j of rawJobs) {
        if (!j.title || (!j.url && !j.shortcode)) continue;

        const jobUrl = j.url || `https://apply.workable.com/${companySlug}/j/${j.shortcode}/`;
        const locParts = [j.city, j.region, j.country].filter(Boolean);
        const locName = j.remote ? 'Remote' : (locParts.length > 0 ? locParts.join(', ') : 'Remote');

        const jobId = String(j.shortcode || j.id || '');
        jobs.push({
          title: j.title.trim(),
          company: orgName,
          location: locName,
          description: `Apply directly at: ${jobUrl}`,
          url: jobUrl,
          applicationUrl: jobUrl,
          source: 'Workable',
          atsPlatform: 'workable',
          atsJobId: jobId,
          department: j.department || null,
          remoteType: j.remote ? 'REMOTE' : null,
          postedAt: j.published_on ? new Date(j.published_on) : null,
        });
      }

      return {
        success: true,
        jobs,
        statusCode: res.statusCode,
      };
    }

    // HTML fallback
    const htmlUrl = `https://apply.workable.com/${encodeURIComponent(companySlug)}/`;
    const htmlRes = await requestScraping({
      url: htmlUrl,
      timeoutMs: 15000,
      responseType: 'text',
    });

    if (htmlRes.statusCode >= 200 && htmlRes.statusCode < 300 && typeof htmlRes.body === 'string') {
      const $ = cheerio.load(htmlRes.body);
      const jobs: RawDiscoveredJob[] = [];
      const pageTitleCompany = $('title').text().trim() || companyName;

      $('[data-ui="job-posting"], li.job, a[href*="/j/"]').each((_, el) => {
        const titleEl = $(el).find('a, h2, h3').first();
        const title = titleEl.text().trim() || $(el).text().trim();
        const href = $(el).attr('href') || titleEl.attr('href') || '';
        if (!title || !href || title.length > 100) return;
        const fullUrl = href.startsWith('http') ? href : `https://apply.workable.com${href}`;

        jobs.push({
          title,
          company: pageTitleCompany,
          location: $(el).text().includes('Remote') ? 'Remote' : 'Unknown Location',
          description: `Apply directly at: ${fullUrl}`,
          url: fullUrl,
          applicationUrl: fullUrl,
          source: 'Workable',
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
      error: `Workable returned HTTP ${res.statusCode}`,
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
