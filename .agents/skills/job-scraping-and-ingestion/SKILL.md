---
name: job-scraping-and-ingestion
description: Strategies, best practices, and architecture for scraping, crawling, and ingesting job postings across job boards (LinkedIn, Indeed, Glassdoor, ZipRecruiter, RemoteOK) and direct ATS feeds. Use when writing, debugging, or optimizing job scrapers, deduplication pipelines, and rate limiting.
---

# Job Scraping, Crawling & Ingestion Guide

This skill covers anti-bot evasion, protocol-level stealth Playwright configurations, API-first scraping hierarchies, and data normalization pipelines for job ingestion (`src/lib/scrapers/*` and `worker/src/stealth-scraper.ts`).

---

## 1. Scraping Strategy Hierarchy

Always follow this efficiency hierarchy to avoid anti-bot friction and maximize throughput:

```
1. Direct ATS Public APIs (Instant, 100% Structured JSON, 0 Anti-bot friction)
   └── Greenhouse Board API, Lever Postings API, Ashby API, Workable Widget API
2. Curated Aggregator & Search APIs
   └── SerpAPI Google Jobs, ScraperAPI / Apify proxy routes
3. Static HTTP / Cheerio Extraction
   └── For static HTML job boards without Cloudflare Turnstile / DataDome
4. Protocol-Hardened Headless Browser (Patchright / Playwright + Stealth)
   └── Only when full client-side JavaScript execution or interaction is required
```

---

## 2. Direct ATS API Reference (Bypass DOM Scraping)

Ingest jobs directly from company ATS endpoints instead of rendering heavy web pages:

* **Greenhouse Public Board API**:
  `GET https://boards-api.greenhouse.io/v1/boards/{board_token}/jobs?content=true`
* **Lever Postings API**:
  `GET https://api.lever.co/v0/postings/{company}?mode=json`
* **Ashby Public API**:
  `POST https://api.ashbyhq.com/posting-api/job-board/{organization}`
  `Payload: { "includeCompensation": true }`
* **Workable Public Widget API**:
  `GET https://apply.workable.com/api/v1/widget/accounts/{company}`
* **RemoteOK Public Feed**:
  `GET https://remoteok.com/api`

---

## 3. Protocol-Level Stealth Playwright Best Practices

Modern anti-bot engines (Cloudflare Turnstile, DataDome, PerimeterX/HUMAN) detect automation at the network and protocol layer. Standard `puppeteer-extra-plugin-stealth` alone is insufficient.

### A. The "Runtime.enable" CDP Leak
* Standard Playwright sends `Runtime.enable` across Chrome DevTools Protocol (CDP), leaving detectable execution context artifacts.
* **Mitigation**: Use protocol-level patchers like **`patchright`** (drop-in Playwright replacement) or **`rebrowser-patches`** to strip CDP instrumentation signals.

### B. Real Chrome Channel & TLS / JA3 Handshake
* Bundled Chromium produces an anomalous JA3/JA4 TLS handshake signature and lacks proprietary codecs.
* **Mitigation**: Launch with a real Google Chrome channel:
  ```typescript
  const browser = await chromium.launch({
    channel: 'chrome',
    headless: true,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-sandbox',
      '--disable-infobars',
    ],
  });
  ```

### C. Fingerprint Consistency Matrix
Ensure all client attributes align logically:
* **Platform**: If User-Agent is macOS (`Macintosh; Intel Mac OS X`), ensure `navigator.platform = "MacIntel"` and WebGL renderer is Apple Metal / ANGLE (never Linux/Mesa).
* **Client Hints**: Provide matching `Sec-Ch-Ua`, `Sec-Ch-Ua-Mobile: ?0`, and `Sec-Ch-Ua-Platform` headers.
* **Locale & Timezone**: Align `locale`, `timezoneId`, and geolocation with the proxy IP country.

---

## 4. Normalization, Deduplication & Taxonomy Pipeline

Before writing records to the database (`src/lib/jobs.ts` / Prisma):

1. **URL Sanitization (`src/lib/urlUtils.ts`)**:
   * Strip tracking query parameters: `utm_source`, `utm_medium`, `utm_campaign`, `gh_src`, `ref`, `source`, `fbclid`.
   * Standardize canonical ATS URLs.
2. **Role & Seniority Classification (`src/lib/roleMatcher.ts`, `src/lib/roleTaxonomy.ts`)**:
   * Map title keywords to standardized categories (Frontend, Backend, Fullstack, Mobile, DevOps, ML/AI, Product).
   * Classify seniority tier (Intern, Junior, Mid, Senior, Staff, Lead, Director).
3. **Composite Deduplication Key**:
   * Primary key match: `normalizedCompanyName + normalizedTitle + (location OR remoteStatus)`.

---

## 5. Resilience, Throttling & Error Recovery

* **Exponential Backoff**:
  * On HTTP 429 (Rate Limited) or 503, retry with backoff: $\text{delay} = 2^{\text{attempt}} \times 1000\text{ms} + \text{jitter}(0, 500\text{ms})$ (max 3 retries).
* **Domain-Level Concurrency Throttling**:
  * Limit concurrent connections to the same host (maximum 2 simultaneous requests per company domain).
* **Graceful Degradation**:
  * If a detailed description scrape fails for one job, record the error in `ExecutionLogger`, salvage metadata, and proceed with the rest of the batch without crashing the worker.
