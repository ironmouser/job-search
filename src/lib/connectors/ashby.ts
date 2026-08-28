/**
 * src/lib/connectors/ashby.ts
 *
 * Ashby Job Board API connector.
 * Ingests structured JSON from GET https://api.ashbyhq.com/posting-api/job-board/{company}
 */

import * as cheerio from 'cheerio';
import { ATSConnectorConfig, ConnectorResult, RawDiscoveredJob } from './types';
import { cleanCompanyName } from '../cleaners';
import { requestScraping } from '../httpClient';

export async function fetchAshbyJobs(config: ATSConnectorConfig): Promise<ConnectorResult> {
  const { companySlug, companyName: providedCompanyName } = config;
  const companyName = providedCompanyName || cleanCompanyName(companySlug) || companySlug;
  const apiUrl = `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(companySlug)}`;

  try {
    const res = await requestScraping({
      url: apiUrl,
      method: 'GET',
      responseType: 'json',
      timeoutMs: 15000,
    });

    if (res.statusCode === 403 || res.statusCode === 429) {
      return {
        success: false,
        jobs: [],
        error: `Ashby API rate-limited or blocked: HTTP ${res.statusCode}`,
        statusCode: res.statusCode,
        isBlocked: true,
      };
    }

    if (res.statusCode >= 200 && res.statusCode < 300) {
      let body = res.body as any;
      if (typeof body === 'string') {
        try { body = JSON.parse(body); } catch {}
      }
      const rawJobs = Array.isArray(body?.jobs) ? body.jobs : [];
      if (rawJobs.length > 0) {
        const jobs: RawDiscoveredJob[] = [];

        for (const j of rawJobs) {
          const title = j.title?.trim();
          const jobUrl = j.jobUrl || `https://jobs.ashbyhq.com/${companySlug}/${j.id}`;
          if (!title) continue;

          const locName = j.location?.trim() || 'Remote';
          const isRemote = /remote/i.test(locName) || /anywhere/i.test(locName) || !!j.isRemote;
          const salary = j.compensation?.summaryCompensation || null;
          const description = `Apply directly at: ${jobUrl}`;

          jobs.push({
            title,
            company: companyName,
            location: locName,
            salaryRange: salary,
            description,
            url: jobUrl,
            applicationUrl: jobUrl,
            source: 'Ashby',
            atsPlatform: 'ashby',
            atsJobId: String(j.id || ''),
            department: j.department || j.team || null,
            remoteType: isRemote ? 'REMOTE' : null,
            postedAt: j.publishedAt ? new Date(j.publishedAt) : null,
          });
        }

        return {
          success: true,
          jobs,
          statusCode: res.statusCode,
        };
      }
    }

    // HTML fallback
    const htmlUrl = `https://jobs.ashbyhq.com/${encodeURIComponent(companySlug)}`;
    const htmlRes = await requestScraping({
      url: htmlUrl,
      timeoutMs: 15000,
      responseType: 'text',
    });

    if (htmlRes.statusCode >= 200 && htmlRes.statusCode < 300 && typeof htmlRes.body === 'string') {
      const $ = cheerio.load(htmlRes.body);
      const jobs: RawDiscoveredJob[] = [];
      const pageTitleCompany = $('title').text().trim() || companyName;

      $('a[href*="/jobs/"], a[href*="/' + companySlug + '/"]').each((_, el) => {
        const titleEl = $(el).find('h3, h2').first();
        const title = titleEl.text().trim() || $(el).text().trim();
        const locationEl = $(el).find('p, span').first();
        const href = $(el).attr('href') || '';
        if (!title || !href || title.length > 100) return;
        const fullUrl = href.startsWith('http') ? href : `https://jobs.ashbyhq.com${href}`;

        jobs.push({
          title,
          company: pageTitleCompany,
          location: locationEl.text().trim() || 'Remote',
          description: `Apply directly at: ${fullUrl}`,
          url: fullUrl,
          applicationUrl: fullUrl,
          source: 'Ashby',
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
      error: `Ashby returned HTTP ${res.statusCode}`,
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
