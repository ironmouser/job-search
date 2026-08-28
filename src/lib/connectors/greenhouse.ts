/**
 * src/lib/connectors/greenhouse.ts
 *
 * Greenhouse Board API connector.
 * Ingests 100% structured JSON from https://boards-api.greenhouse.io/v1/boards/{board_token}/jobs?content=true
 */

import * as cheerio from 'cheerio';
import { ATSConnectorConfig, ConnectorResult, RawDiscoveredJob } from './types';
import { cleanCompanyName } from '../cleaners';
import { requestScraping } from '../httpClient';

function convertHtmlToCleanText(html: string): string {
  if (!html) return '';
  const $ = cheerio.load(html);
  $('script, style, noscript, svg, nav, footer').remove();
  return $.text().replace(/\s+/g, ' ').trim();
}

export async function fetchGreenhouseJobs(config: ATSConnectorConfig): Promise<ConnectorResult> {
  const { companySlug, companyName: providedCompanyName } = config;
  const companyName = providedCompanyName || cleanCompanyName(companySlug) || companySlug;
  const apiUrl = `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(companySlug)}/jobs?content=true`;

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
        error: `Greenhouse API rate-limited or blocked: HTTP ${res.statusCode}`,
        statusCode: res.statusCode,
        isBlocked: true,
      };
    }

    if (res.statusCode >= 200 && res.statusCode < 300) {
      const body = res.body as any;
      const rawJobs = Array.isArray(body?.jobs) ? body.jobs : [];
      const jobs: RawDiscoveredJob[] = [];

      for (const j of rawJobs) {
        if (!j.title || !j.absolute_url) continue;

        const locName = j.location?.name?.trim() || 'Remote';
        const isRemote = /remote/i.test(locName) || /anywhere/i.test(locName) || /work from home/i.test(locName);
        const description = j.content
          ? convertHtmlToCleanText(j.content) + `\n\nApply directly at: ${j.absolute_url}`
          : `Apply directly at: ${j.absolute_url}`;

        const dept = j.departments && j.departments[0]?.name ? j.departments[0].name : null;

        jobs.push({
          title: j.title.trim(),
          company: companyName,
          location: locName,
          description,
          url: j.absolute_url,
          applicationUrl: j.absolute_url,
          source: 'Greenhouse',
          atsPlatform: 'greenhouse',
          atsJobId: String(j.id),
          department: dept,
          remoteType: isRemote ? 'REMOTE' : null,
          postedAt: j.updated_at ? new Date(j.updated_at) : null,
        });
      }

      return {
        success: true,
        jobs,
        statusCode: res.statusCode,
      };
    }

    // Fallback: If API returned 404 or non-200, try scraping HTML board page
    const htmlUrl = `https://boards.greenhouse.io/${encodeURIComponent(companySlug)}`;
    const htmlRes = await requestScraping({
      url: htmlUrl,
      timeoutMs: 15000,
      responseType: 'text',
    });

    if (htmlRes.statusCode >= 200 && htmlRes.statusCode < 300 && typeof htmlRes.body === 'string') {
      const $ = cheerio.load(htmlRes.body);
      const jobs: RawDiscoveredJob[] = [];
      const pageTitleCompany = $('title').text().replace(/job board/i, '').trim() || companyName;

      $('.opening').each((_, el) => {
        const titleEl = $(el).find('a');
        const locationEl = $(el).find('.location');
        const href = titleEl.attr('href') || '';
        if (!href) return;
        const fullUrl = href.startsWith('http') ? href : `https://boards.greenhouse.io${href}`;

        jobs.push({
          title: titleEl.text().trim() || 'Untitled Position',
          company: pageTitleCompany,
          location: locationEl.text().trim() || 'Remote',
          description: `Apply directly at: ${fullUrl}`,
          url: fullUrl,
          applicationUrl: fullUrl,
          source: 'Greenhouse',
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
      error: `Greenhouse returned HTTP ${res.statusCode}`,
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
