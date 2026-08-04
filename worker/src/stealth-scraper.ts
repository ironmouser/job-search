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
