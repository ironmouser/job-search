import { BrowserSession } from './browser-session';

export interface StealthScrapeParams {
  url: string;
  source: string;
  keyword?: string;
  timeoutMs?: number;
}

export interface ScrapedJob {
  title: string;
  company: string;
  location: string;
  description: string;
  url: string;
  source: string;
}

/**
 * StealthScraper — Runs Playwright with stealth evasions on the DigitalOcean Worker.
 * Used for high-protection targets (Cloudflare Turnstile / DataDome).
 */
export async function scrapeWithPlaywrightStealth(params: StealthScrapeParams): Promise<ScrapedJob[]> {
  const { url, source, keyword = '', timeoutMs = 30_000 } = params;
  const session = new BrowserSession();
  const jobs: ScrapedJob[] = [];

  try {
    await session.launch();
    const page = session.page;

    // Apply anti-detection stealth evasions
    await page.addInitScript(() => {
      const g = globalThis as any;
      if (g.navigator) {
        Object.defineProperty(g.navigator, 'webdriver', { get: () => undefined });
        Object.defineProperty(g.navigator, 'languages', { get: () => ['en-US', 'en'] });
        Object.defineProperty(g.navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
      }
      g.chrome = { runtime: {} };
    });

    console.log(`[StealthScraper] Navigating to ${url} for source: ${source}...`);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs });

    // Wait briefly for Cloudflare turnstile or challenge redirect if present
    await page.waitForTimeout(3000);

    // If Cloudflare iframe is detected, wait longer for automatic solve
    const cfFrame = page.frames().find(f => f.url().includes('cloudflare') || f.url().includes('turnstile'));
    if (cfFrame) {
      console.log(`[StealthScraper] Cloudflare Turnstile detected on ${url}, waiting for solver...`);
      await page.waitForTimeout(7000);
    }

    if (source === 'remoteco' || url.includes('remote.co')) {
      const extracted = await page.$$eval('a[href*="/job/"]', (elements) => {
        return elements.map((el) => {
          const titleEl = el.querySelector('p.font-weight-bold') || el;
          const companyEl = el.querySelector('p.m-0') || el;
          const href = el.getAttribute('href') || '';
          if (!href) return null;
          const fullUrl = href.startsWith('http') ? href : `https://remote.co${href}`;
          const title = titleEl.textContent?.trim() || '';
          if (!title || title.length < 3) return null;

          return {
            title,
            company: companyEl.textContent?.split('|')[0]?.trim() || 'Remote.co Company',
            location: 'Remote',
            description: `Apply at: ${fullUrl}`,
            url: fullUrl,
            source: 'Remote.co'
          };
        }).filter(Boolean);
      });
      jobs.push(...(extracted as ScrapedJob[]));
    } else if (source === 'jobspresso' || url.includes('jobspresso.co')) {
      const extracted = await page.$$eval('li.job_listing', (elements) => {
        return elements.map((el) => {
          const href = el.querySelector('a')?.getAttribute('href') || '';
          const title = el.querySelector('.position h3')?.textContent?.trim() || '';
          if (!href || !title) return null;
          return {
            title,
            company: el.querySelector('.company strong')?.textContent?.trim() || 'Jobspresso',
            location: el.querySelector('.location')?.textContent?.trim() || 'Remote',
            description: `Apply at: ${href}`,
            url: href,
            source: 'Jobspresso'
          };
        }).filter(Boolean);
      });
      jobs.push(...(extracted as ScrapedJob[]));
    } else {
      // Generic fallback card extraction
      const extracted = await page.$$eval('[class*="job-card"], [class*="jobListing"], article, li[class*="job"]', (elements, pageUrl) => {
        return elements.map((el) => {
          const aTag = el.querySelector('a[href*="/job"]') || el.querySelector('a');
          const title = aTag?.textContent?.trim() || el.querySelector('h2, h3')?.textContent?.trim() || '';
          const href = aTag?.getAttribute('href') || '';
          if (!title || !href) return null;
          let fullUrl = href;
          try {
            fullUrl = href.startsWith('http') ? href : new URL(href, pageUrl).toString();
          } catch {}

          return {
            title,
            company: el.querySelector('[class*="company"]')?.textContent?.trim() || 'Company',
            location: el.querySelector('[class*="location"]')?.textContent?.trim() || 'Remote',
            description: `Apply at: ${fullUrl}`,
            url: fullUrl,
            source: 'Generic'
          };
        }).filter(Boolean);
      }, url);
      jobs.push(...(extracted as ScrapedJob[]));
    }

    console.log(`[StealthScraper] Finished ${source}: extracted ${jobs.length} jobs.`);
  } catch (e: any) {
    console.error(`[StealthScraper] Error scraping ${url}: ${e.message}`);
  } finally {
    await session.close();
  }

  return jobs;
}

export interface StealthSingleJobResult {
  description: string | null;
  finalUrl: string;
}

/**
 * fetchSingleJobDescriptionStealth — Uses Playwright stealth browser to navigate to a protected
 * job page (e.g. ZipRecruiter /ekm/ tracking links, Glassdoor, YCombinator), follow redirects,
 * bypass Cloudflare/DataDome bot protections, and extract the full job description.
 */
export async function fetchSingleJobDescriptionStealth(url: string, timeoutMs = 35_000): Promise<StealthSingleJobResult> {
  const session = new BrowserSession();
  let description: string | null = null;
  let finalUrl = url;

  try {
    await session.launch();
    const page = session.page;

    // Apply anti-detection stealth evasions
    await page.addInitScript(() => {
      const g = globalThis as any;
      if (g.navigator) {
        Object.defineProperty(g.navigator, 'webdriver', { get: () => undefined });
        Object.defineProperty(g.navigator, 'languages', { get: () => ['en-US', 'en'] });
        Object.defineProperty(g.navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
      }
      g.chrome = { runtime: {} };
    });

    console.log(`[StealthScraper] Fetching single job details stealthily for: ${url}...`);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs });

    // Wait for JS redirects or Cloudflare Turnstile if present
    await page.waitForTimeout(3000);

    const cfFrame = page.frames().find(f => f.url().includes('cloudflare') || f.url().includes('turnstile'));
    if (cfFrame) {
      console.log(`[StealthScraper] Cloudflare Turnstile detected on ${url}, waiting for solver...`);
      await page.waitForTimeout(7000);
    }

    finalUrl = page.url();

    // Universal SPA & Dynamic Content Check: if DOM does not yet contain adequate text, wait for network idle
    const hasLoadedContent = await page.evaluate(() => {
      const el = document.querySelector('main, article, [class*="description"], [id*="description"], [class*="posting"], [class*="details"]');
      return el && el.textContent ? el.textContent.trim().length > 300 : false;
    });

    if (!hasLoadedContent) {
      console.log(`[StealthScraper] Dynamic SPA target detected on ${finalUrl}, waiting for client-side AJAX rendering...`);
      await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
      await page.waitForTimeout(2000);
    }

    // 1. Try extracting from JSON-LD schema (schema.org/JobPosting)
    const jsonLdDesc = await page.evaluate(() => {
      const scripts = Array.from(document.querySelectorAll('script[type="application/ld+json"]'));
      for (const script of scripts) {
        try {
          const data = JSON.parse(script.textContent || '');
          const items = Array.isArray(data) ? data : (data['@graph'] && Array.isArray(data['@graph'])) ? data['@graph'] : [data];
          for (const item of items) {
            if (item && typeof item.description === 'string' && item.description.length > 100) {
              return item.description;
            }
          }
        } catch {}
      }
      return null;
    });

    if (jsonLdDesc && jsonLdDesc.trim().length > 100) {
      description = jsonLdDesc.trim();
    }

    // 2. Try YCombinator / WorkAtAStartUp data-page JSON attribute
    if (!description && (url.includes('workatastartup.com') || url.includes('ycombinator.com'))) {
      const ycDesc = await page.evaluate(() => {
        const div = document.querySelector('div[data-page]');
        if (div) {
          try {
            const data = JSON.parse(div.getAttribute('data-page') || '');
            const job = data?.props?.job || data?.props?.jobs?.[0];
            if (job && job.description) return job.description;
          } catch {}
        }
        return null;
      });
      if (ycDesc && ycDesc.trim().length > 100) {
        description = ycDesc.trim();
      }
    }

    // 3. Extract DOM content using targeted selectors for ZipRecruiter, Glassdoor, ADP Workforce Now, and standard ATSs
    if (!description) {
      const domText = await page.evaluate(() => {
        const primarySelectors = '#jobDescriptionText, .jobsearch-JobComponent-description, #JobDescriptionContainer, .jobDescriptionContent, .job_description, .job_description_container, .job_description_text, .job_details, .jobDescriptionSection, [data-automation-id="jobPostingDescription"], .show-more-less-html__markup, [class*="job_description"], [class*="jobDescription"], [class*="recruitment-job"], [class*="recruitment_job"], [class*="job-details"]';
        const fallbackSelectors = 'main, article, .job-description, #job-description, .posting-requirements, .section-description, [class*="description"], [class*="posting"], [class*="details"], [id*="description"], [id*="posting"]';

        const el = document.querySelector(primarySelectors) || document.querySelector(fallbackSelectors);
        if (el) {
          const clone = el.cloneNode(true) as HTMLElement;
          clone.querySelectorAll('script, style, noscript, nav, header, footer, iframe, svg, button, input').forEach((n: Element) => n.remove());
          const txt = clone.innerText || clone.textContent || '';
          if (txt.trim().length > 100) return txt.trim();
        }

        // Body fallback if main container wasn't matched
        const bodyClone = document.body.cloneNode(true) as HTMLElement;
        bodyClone.querySelectorAll('script, style, noscript, nav, header, footer, iframe, svg, button, input').forEach((n: Element) => n.remove());
        const bodyTxt = bodyClone.innerText || bodyClone.textContent || '';
        return bodyTxt.trim().length > 200 ? bodyTxt.trim() : '';
      });

      if (domText && domText.trim().length > 100) {
        description = domText.trim();
      }
    }

    console.log(`[StealthScraper] Finished fetching single job for ${url}. Success: ${!!description}, Final URL: ${finalUrl}`);
  } catch (err: any) {
    console.error(`[StealthScraper] Failed to fetch single job details for ${url}: ${err.message}`);
  } finally {
    await session.close();
  }

  return { description, finalUrl };
}

