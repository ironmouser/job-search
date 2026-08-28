/**
 * src/lib/connectors/workday.ts
 *
 * Workday Candidate Experience Service (CXS) REST API connector.
 * Ingests structured JSON directly from https://{host}/wday/cxs/{tenant}/{site}/jobs
 */

import { ATSConnectorConfig, ConnectorResult, RawDiscoveredJob } from './types';
import { cleanCompanyName } from '../cleaners';
import { parseWorkdayUrl } from '../atsDetector';
import { requestScraping } from '../httpClient';
import { cleanJobUrl } from '../urlUtils';

export async function fetchWorkdayJobs(
  config: ATSConnectorConfig & { maxJobs?: number }
): Promise<ConnectorResult> {
  const { careerUrl, companyName: providedCompanyName, companySlug, maxJobs = 100 } = config;
  const companyName = providedCompanyName || cleanCompanyName(companySlug) || companySlug;

  const targetUrl = careerUrl || `https://${companySlug}.myworkdayjobs.com/${companySlug}_Careers`;
  const wdMeta = parseWorkdayUrl(targetUrl);

  if (!wdMeta) {
    return {
      success: false,
      jobs: [],
      error: `Could not parse Workday tenant/site from URL: ${targetUrl}`,
    };
  }

  const hostname = new URL(targetUrl).hostname;
  const baseCareerUrl = `https://${hostname}`;
  const cxsUrl = wdMeta.cxsEndpoint;

  const allJobs: RawDiscoveredJob[] = [];
  const pageSize = 20;
  let offset = 0;
  let hasMore = true;

  try {
    while (hasMore && allJobs.length < maxJobs) {
      const res = await requestScraping({
        url: cxsUrl,
        method: 'POST',
        json: {
          appliedFacets: {},
          limit: pageSize,
          offset,
          searchText: '',
        },
        responseType: 'json',
        timeoutMs: 15000,
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
      });

      if (res.statusCode === 403 || res.statusCode === 429) {
        return {
          success: allJobs.length > 0,
          jobs: allJobs,
          error: `Workday API rate-limited or blocked: HTTP ${res.statusCode}`,
          statusCode: res.statusCode,
          isBlocked: true,
        };
      }

      if (res.statusCode < 200 || res.statusCode >= 300) {
        if (allJobs.length > 0) break;
        return {
          success: false,
          jobs: [],
          error: `Workday CXS returned HTTP ${res.statusCode}`,
          statusCode: res.statusCode,
        };
      }

      let body = res.body as any;
      if (typeof body === 'string') {
        try { body = JSON.parse(body); } catch {}
      }

      const rawPostings = Array.isArray(body?.jobPostings) ? body.jobPostings : [];
      if (rawPostings.length === 0) {
        hasMore = false;
        break;
      }

      for (const j of rawPostings) {
        const title = j.title?.trim();
        if (!title || !j.externalPath) continue;

        let fullJobUrl = `${baseCareerUrl}${j.externalPath}`;
        if (!fullJobUrl.startsWith('http')) {
          fullJobUrl = `https://${hostname}${j.externalPath.startsWith('/') ? '' : '/'}${j.externalPath}`;
        }
        fullJobUrl = cleanJobUrl(fullJobUrl);

        const locName = j.locationsText?.trim() || 'Remote';
        const isRemote = /remote/i.test(locName) || /anywhere/i.test(locName) || /virtual/i.test(locName) || /work from home/i.test(locName);
        const reqId = Array.isArray(j.bulletFields) && j.bulletFields.length > 0 ? j.bulletFields[0] : null;
        const description = `Apply directly at Workday: ${fullJobUrl}`;

        allJobs.push({
          title,
          company: companyName,
          location: locName,
          description,
          url: fullJobUrl,
          applicationUrl: fullJobUrl,
          source: 'Workday',
          atsPlatform: 'workday',
          atsJobId: reqId,
          department: reqId ? `Req: ${reqId}` : null,
          remoteType: isRemote ? 'REMOTE' : null,
        });

        if (allJobs.length >= maxJobs) break;
      }

      offset += pageSize;
      const total = body?.total || 0;
      if (offset >= total || rawPostings.length < pageSize) {
        hasMore = false;
      }
    }

    return {
      success: allJobs.length > 0,
      jobs: allJobs,
      statusCode: 200,
    };
  } catch (err: any) {
    return {
      success: allJobs.length > 0,
      jobs: allJobs,
      error: err.message,
    };
  }
}
