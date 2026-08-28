/**
 * src/lib/connectors/lever.ts
 *
 * Lever Postings API connector.
 * Ingests structured JSON from https://api.lever.co/v0/postings/{company}?mode=json
 */

import * as cheerio from 'cheerio';
import { ATSConnectorConfig, ConnectorResult, RawDiscoveredJob } from './types';
import { cleanCompanyName } from '../cleaners';
import { requestScraping } from '../httpClient';

export async function fetchLeverJobs(config: ATSConnectorConfig): Promise<ConnectorResult> {
  const { companySlug, companyName: providedCompanyName } = config;
  const companyName = providedCompanyName || cleanCompanyName(companySlug) || companySlug;
  const apiUrl = `https://api.lever.co/v0/postings/${encodeURIComponent(companySlug)}?mode=json`;

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
        error: `Lever API rate-limited or blocked: HTTP ${res.statusCode}`,
        statusCode: res.statusCode,
        isBlocked: true,
      };
    }

    let rawJobs: any[] = [];
    if (res.statusCode >= 200 && res.statusCode < 300) {
      if (Array.isArray(res.body)) {
        rawJobs = res.body;
      } else if (typeof res.body === 'string') {
        try {
          const parsed = JSON.parse(res.body);
          if (Array.isArray(parsed)) rawJobs = parsed;
        } catch {}
      }
    }

    if (rawJobs.length > 0) {
      const jobs: RawDiscoveredJob[] = [];

      for (const j of rawJobs) {
        const title = j.text?.trim();
        const targetUrl = j.hostedUrl || j.applyUrl;
        if (!title || !targetUrl) continue;

        const locName = j.categories?.location?.trim() || 'Remote';
        const isRemote = /remote/i.test(locName) || /anywhere/i.test(locName) || /work from home/i.test(locName);
        const description = j.descriptionPlain
          ? j.descriptionPlain.replace(/\s+/g, ' ').trim() + `\n\nApply directly at: ${targetUrl}`
          : `Apply directly at: ${targetUrl}`;

        const dept = j.categories?.team || j.categories?.department || null;

        jobs.push({
          title,
          company: companyName,
          location: locName,
          description,
          url: targetUrl,
          applicationUrl: j.applyUrl || targetUrl,
          source: 'Lever',
          atsPlatform: 'lever',
          atsJobId: String(j.id || ''),
          department: dept,
          remoteType: isRemote ? 'REMOTE' : null,
          postedAt: j.createdAt ? new Date(j.createdAt) : null,
        });
      }

      return {
        success: true,
        jobs,
        statusCode: res.statusCode,
      };
    }

    // HTML fallback
    const htmlUrl = `https://jobs.lever.co/${encodeURIComponent(companySlug)}`;
    const htmlRes = await requestScraping({
      url: htmlUrl,
      timeoutMs: 15000,
      responseType: 'text',
    });

    if (htmlRes.statusCode >= 200 && htmlRes.statusCode < 300 && typeof htmlRes.body === 'string') {
      const $ = cheerio.load(htmlRes.body);
      const jobs: RawDiscoveredJob[] = [];
      const pageTitleCompany = $('title').text().split('–')[0]?.trim() || companyName;

      $('.posting').each((_, el) => {
        const titleEl = $(el).find('h5');
        const locationEl = $(el).find('.sort-by-location, .posting-categories .location');
        const linkEl = $(el).find('a.posting-title');
        const href = linkEl.attr('href') || '';
        if (!href) return;

        jobs.push({
          title: titleEl.text().trim() || 'Untitled Position',
          company: pageTitleCompany,
          location: locationEl.text().trim() || 'Remote',
          description: `Apply directly at: ${href}`,
          url: href,
          applicationUrl: href,
          source: 'Lever',
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
      error: `Lever returned HTTP ${res.statusCode}`,
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
