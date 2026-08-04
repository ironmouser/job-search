import { BrowserSession } from './browser-session';
import * as cheerio from 'cheerio';

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

    const html = await page.content();
    const $ = cheerio.load(html);

    if (source === 'remoteco' || url.includes('remote.co')) {
      $('a[href*="/job/"]').each((_, el) => {
        const titleEl = $(el).find('p.font-weight-bold').length ? $(el).find('p.font-weight-bold') : $(el);
        const companyEl = $(el).find('p.m-0').length ? $(el).find('p.m-0') : $(el);
        const href = $(el).attr('href') || '';
        if (!href) return;
        const fullUrl = href.startsWith('http') ? href : `https://remote.co${href}`;
        const title = titleEl.text().trim();
        if (!title || title.length < 3) return;

        jobs.push({
          title,
          company: companyEl.text().split('|')[0]?.trim() || 'Remote.co Company',
          location: 'Remote',
          description: `Apply at: ${fullUrl}`,
          url: fullUrl,
          source: 'Remote.co'
        });
      });
    } else if (source === 'jobspresso' || url.includes('jobspresso.co')) {
      $('li.job_listing').each((_, el) => {
        const href = $(el).find('a').attr('href');
        const title = $(el).find('.position h3').text().trim();
        if (!href || !title) return;
        jobs.push({
          title,
          company: $(el).find('.company strong').text().trim() || 'Jobspresso',
          location: $(el).find('.location').text().trim() || 'Remote',
          description: `Apply at: ${href}`,
          url: href,
          source: 'Jobspresso'
        });
      });
    } else {
      // Generic fallback card extraction
      $('[class*="job-card"], [class*="jobListing"], article, li[class*="job"]').each((_, el) => {
        const aTag = $(el).find('a[href*="/job"]').first();
        const title = aTag.text().trim() || $(el).find('h2, h3').first().text().trim();
        const href = aTag.attr('href') || $(el).find('a').first().attr('href') || '';
        if (!title || !href) return;
        const fullUrl = href.startsWith('http') ? href : new URL(href, url).toString();
        jobs.push({
          title,
          company: $(el).find('[class*="company"]').first().text().trim() || 'Company',
          location: $(el).find('[class*="location"]').first().text().trim() || 'Remote',
          description: `Apply at: ${fullUrl}`,
          url: fullUrl,
          source: source
        });
      });
    }

    console.log(`[StealthScraper] Finished ${source}: extracted ${jobs.length} jobs.`);
  } catch (e: any) {
    console.error(`[StealthScraper] Error scraping ${url}: ${e.message}`);
  } finally {
    await session.close();
  }

  return jobs;
}
