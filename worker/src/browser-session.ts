import { chromium, Browser, Page, BrowserContext, Frame } from 'playwright';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as os from 'os';

/**
 * BrowserSession — manages the Playwright browser lifecycle.
 *
 * Responsibilities:
 *  - Launch and configure Chromium
 *  - Navigate to URLs
 *  - Write markdown content to a temp PDF file for upload
 *  - Expose the raw Playwright Page for plugin use
 *  - Handle iframe detection for embedded ATS forms
 *  - Close cleanly on shutdown or error
 */
export class BrowserSession {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private _page: Page | null = null;
  private tempDir: string | null = null;

  get page(): Page {
    if (!this._page || this._page.isClosed()) {
      const remaining = this.context?.pages().filter((p) => !p.isClosed()) ?? [];
      if (remaining.length > 0) {
        this._page = remaining[remaining.length - 1];
      }
    }
    if (!this._page || this._page.isClosed()) {
      throw new Error('BrowserSession not started or all pages closed — call launch() first');
    }
    return this._page;
  }

  // ─── Lifecycle ────────────────────────────────────────────────────────────

  async launch(storageState?: any): Promise<void> {
    // ─── Proxy Configuration ────────────────────────────────────────────────
    let proxy: { server: string; username?: string; password?: string } | undefined = undefined;

    if (process.env.DISABLE_WORKER_PROXY !== 'true') {
      if (process.env.AUTO_APPLY_PROXY_URL) {
        // Direct URL format: http://user:pass@host:port or http://host:port
        try {
          const u = new URL(process.env.AUTO_APPLY_PROXY_URL);
          proxy = {
            server: `${u.protocol}//${u.host}`,
            username: u.username ? decodeURIComponent(u.username) : undefined,
            password: u.password ? decodeURIComponent(u.password) : undefined,
          };
        } catch {
          proxy = { server: process.env.AUTO_APPLY_PROXY_URL };
        }
      } else if (process.env.PLAYWRIGHT_PROXY_SERVER) {
        proxy = {
          server: process.env.PLAYWRIGHT_PROXY_SERVER,
          username: process.env.PLAYWRIGHT_PROXY_USERNAME,
          password: process.env.PLAYWRIGHT_PROXY_PASSWORD,
        };
      } else if (process.env.SCRAPERAPI_KEY) {
        const apiKey = process.env.SCRAPERAPI_KEY.trim();
        const countryCode = process.env.SCRAPERAPI_COUNTRY_CODE || 'us';
        const useSticky = process.env.SCRAPERAPI_STICKY_SESSION !== 'false';

        // Sticky sessions reuse the same residential IP across multi-step forms
        let username = `scraperapi.country_code=${countryCode}`;
        if (useSticky) {
          const stickySessionId = Math.floor(Math.random() * 899999) + 100000;
          username += `.session_number=${stickySessionId}`;
        } else {
          username += `.premium=true`;
        }

        proxy = {
          server: 'http://proxy-server.scraperapi.com:8001',
          username,
          password: apiKey,
        };
      }
    }

    this.browser = await chromium.launch({
      headless: true,
      proxy,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',     // Required in Docker (shared memory limit)
        '--disable-gpu',
        '--disable-extensions',
        '--disable-blink-features=AutomationControlled',
        '--ignore-certificate-errors',
        '--ignore-certificate-errors-spki-list',
        '--window-size=1920,1080',
      ],
    });

    const contextOptions: any = {
      viewport: { width: 1920, height: 1080 },
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ' +
        'AppleWebKit/537.36 (KHTML, like Gecko) ' +
        'Chrome/124.0.0.0 Safari/537.36',
      acceptDownloads: true,
      locale: 'en-US',
      timezoneId: 'America/New_York',
      ignoreHTTPSErrors: true,
    };

    if (storageState && typeof storageState === 'object') {
      contextOptions.storageState = storageState;
    }

    this.context = await this.browser.newContext(contextOptions);

    // Apply context-level anti-detection stealth evasions across all frames and new pages
    await this.context.addInitScript(() => {
      const g = globalThis as any;
      if (g.navigator) {
        // 1. Hide webdriver flag
        Object.defineProperty(g.navigator, 'webdriver', {
          get: () => undefined,
          configurable: true,
        });

        // 2. Set realistic languages
        Object.defineProperty(g.navigator, 'languages', {
          get: () => ['en-US', 'en'],
          configurable: true,
        });

        // 3. Set realistic platform and hardware concurrency
        Object.defineProperty(g.navigator, 'platform', {
          get: () => 'Win32',
          configurable: true,
        });

        Object.defineProperty(g.navigator, 'hardwareConcurrency', {
          get: () => 8,
          configurable: true,
        });

        Object.defineProperty(g.navigator, 'deviceMemory', {
          get: () => 8,
          configurable: true,
        });

        // 4. Mock plugins & mimeTypes
        const mockPlugins = [
          { name: 'PDF Viewer', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
          { name: 'Chrome PDF Viewer', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
          { name: 'Chromium PDF Plugin', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
        ];
        Object.defineProperty(g.navigator, 'plugins', {
          get: () => mockPlugins,
          configurable: true,
        });

        // 4b. Mock realistic userAgentData (Client Hints)
        if (!g.navigator.userAgentData) {
          Object.defineProperty(g.navigator, 'userAgentData', {
            get: () => ({
              brands: [
                { brand: 'Chromium', version: '124' },
                { brand: 'Google Chrome', version: '124' },
                { brand: 'Not-A.Brand', version: '99' },
              ],
              mobile: false,
              platform: 'Windows',
              getHighEntropyValues: async () => ({
                architecture: 'x86',
                bitness: '64',
                brands: [
                  { brand: 'Chromium', version: '124' },
                  { brand: 'Google Chrome', version: '124' },
                  { brand: 'Not-A.Brand', version: '99' },
                ],
                fullVersionList: [
                  { brand: 'Chromium', version: '124.0.6367.207' },
                  { brand: 'Google Chrome', version: '124.0.6367.207' },
                  { brand: 'Not-A.Brand', version: '99.0.0.0' },
                ],
                mobile: false,
                model: '',
                platform: 'Windows',
                platformVersion: '10.0.0',
                uaFullVersion: '124.0.6367.207',
              }),
            }),
            configurable: true,
          });
        }
      }

      // 5. Mock window.chrome runtime object
      g.chrome = {
        runtime: {},
        loadTimes: function () {},
        csi: function () {},
        app: {},
      };

      // 6. Fix broken window outer dimensions in headless mode
      if (window.outerWidth === 0 && window.outerHeight === 0) {
        Object.defineProperty(window, 'outerWidth', { get: () => window.innerWidth, configurable: true });
        Object.defineProperty(window, 'outerHeight', { get: () => window.innerHeight, configurable: true });
      }

      // 7. Mock WebGL vendor and renderer strings
      try {
        const getParameterProto = WebGLRenderingContext.prototype.getParameter;
        WebGLRenderingContext.prototype.getParameter = function (parameter: number) {
          // UNMASKED_VENDOR_WEBGL
          if (parameter === 37445) return 'Google Inc. (Intel)';
          // UNMASKED_RENDERER_WEBGL
          if (parameter === 37446) return 'ANGLE (Intel, Intel(R) UHD Graphics 630 Direct3D11 vs_5_0 ps_5_0, D3D11)';
          return getParameterProto.apply(this, [parameter]);
        };

        if (typeof WebGL2RenderingContext !== 'undefined') {
          const getParameter2Proto = WebGL2RenderingContext.prototype.getParameter;
          WebGL2RenderingContext.prototype.getParameter = function (parameter: number) {
            if (parameter === 37445) return 'Google Inc. (Intel)';
            if (parameter === 37446) return 'ANGLE (Intel, Intel(R) UHD Graphics 630 Direct3D11 vs_5_0 ps_5_0, D3D11)';
            return getParameter2Proto.apply(this, [parameter]);
          };
        }
      } catch {}

      // 8. Normalise permissions API
      if (g.navigator?.permissions?.query) {
        const originalQuery = g.navigator.permissions.query;
        g.navigator.permissions.query = (parameters: any) =>
          parameters.name === 'notifications'
            ? Promise.resolve({ state: Notification.permission } as PermissionStatus)
            : originalQuery(parameters);
      }
    });

    // Auto-track and switch to any new tab or popup opened during automation
    this.context.on('page', (newPage) => {
      this._page = newPage;
      newPage.on('close', () => {
        const remaining = this.context?.pages() ?? [];
        if (remaining.length > 0) {
          this._page = remaining[remaining.length - 1];
        }
      });
    });

    this._page = await this.context.newPage();

    // Create a temp directory for file uploads in this session
    this.tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auto-apply-'));
  }

  async close(): Promise<void> {
    try {
      await this._page?.close();
      await this.context?.close();
      await this.browser?.close();
    } catch {
      // Ignore errors during close
    }

    // Clean up temp files
    if (this.tempDir) {
      await fs.rm(this.tempDir, { recursive: true, force: true }).catch(() => {});
    }

    this._page = null;
    this.context = null;
    this.browser = null;
  }

  // ─── Navigation ───────────────────────────────────────────────────────────

  async navigate(url: string, waitUntil: 'load' | 'networkidle' | 'domcontentloaded' = 'domcontentloaded'): Promise<void> {
    const current = this._page ? this._page.url() : '';
    if (current && (current === url || (url.includes('#') && current.startsWith(url.split('#')[0])))) {
      return;
    }
    await this.page.goto(url, { waitUntil, timeout: 60_000 });
  }

  /** Returns the HTML of the current page */
  async getHtml(): Promise<string> {
    return this.page.content();
  }

  /** Returns the URL chain of all redirects that occurred since last navigation */
  async getRedirectChain(): Promise<string[]> {
    return [this.page.url()];
  }

  /**
   * Finds the frame (or main page) containing any of the specified selectors.
   * Enables seamless automation on custom sites embedding ATS forms in iframes (e.g. Ashby/Greenhouse/Lever).
   */
  async findFormFrame(selectors: string[]): Promise<Frame | Page> {
    const page = this.page;
    for (const selector of selectors) {
      if (await page.$(selector).catch(() => null)) {
        return page;
      }
    }
    for (const frame of page.frames()) {
      if (frame === page.mainFrame()) continue;
      for (const selector of selectors) {
        if (await frame.$(selector).catch(() => null)) {
          return frame;
        }
      }
    }
    return page;
  }

  // ─── Screenshots ──────────────────────────────────────────────────────────

  async screenshot(filename: string): Promise<string> {
    if (!this.tempDir) throw new Error('Session not launched');
    const filePath = path.join(this.tempDir, filename);
    await this.page.screenshot({ path: filePath, fullPage: false });
    return filePath;
  }

  async screenshotBuffer(): Promise<Buffer> {
    return this.page.screenshot({ fullPage: false });
  }

  // ─── File helpers ─────────────────────────────────────────────────────────

  /**
   * Render markdown content as a properly formatted PDF file for ATS upload.
   *
   * Uses Playwright's page.pdf() on the already-installed Chromium browser,
   * so no additional PDF library is required.
   *
   * The markdown is converted to clean HTML with resume-appropriate styling
   * (readable font, tight margins, sensible line-height) before printing.
   */
  async writeMarkdownToPdf(markdown: string, filename: string): Promise<string> {
    if (!this.tempDir || !this.browser) throw new Error('BrowserSession not started — call launch() first');

    // Ensure the output filename ends in .pdf
    const pdfFilename = filename.replace(/\.(txt|md)$/, '') + '.pdf';
    const filePath = path.join(this.tempDir, pdfFilename);

    // Convert markdown to HTML (lightweight, no external lib needed for resumes)
    const html = this.markdownToHtml(markdown);

    // Open a dedicated page in a fresh context so it doesn't interfere with the
    // live application page
    const pdfContext = await this.browser.newContext();
    const pdfPage = await pdfContext.newPage();

    try {
      await pdfPage.setContent(html, { waitUntil: 'domcontentloaded' });
      await pdfPage.pdf({
        path: filePath,
        format: 'Letter',
        margin: { top: '0.75in', bottom: '0.75in', left: '0.75in', right: '0.75in' },
        printBackground: false,
      });
    } finally {
      await pdfPage.close().catch(() => {});
      await pdfContext.close().catch(() => {});
    }

    return filePath;
  }

  /**
   * Converts resume/cover letter markdown to clean HTML for PDF rendering.
   * Handles headings, bold, italic, bullet lists, horizontal rules, and line breaks.
   */
  private markdownToHtml(markdown: string): string {
    let html = markdown
      // Escape HTML special chars first
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      // Headings (process largest first)
      .replace(/^### (.+)$/gm, '<h3>$1</h3>')
      .replace(/^## (.+)$/gm, '<h2>$1</h2>')
      .replace(/^# (.+)$/gm, '<h1>$1</h1>')
      // Bold and italic
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      // Inline code
      .replace(/`(.+?)`/g, '<code>$1</code>')
      // Horizontal rules
      .replace(/^---+$/gm, '<hr>')
      // Unordered list items
      .replace(/^[-*] (.+)$/gm, '<li>$1</li>')
      // Wrap consecutive <li> blocks in <ul>
      .replace(/(<li>.*<\/li>\n?)+/g, (match) => `<ul>${match}</ul>`)
      // Links
      .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2">$1</a>')
      // Paragraphs: blank lines become paragraph breaks
      .split(/\n{2,}/)
      .map((block) => {
        const trimmed = block.trim();
        if (!trimmed) return '';
        // Don't wrap block-level elements in <p>
        if (/^<(h[1-6]|ul|ol|li|hr|blockquote)/.test(trimmed)) return trimmed;
        return `<p>${trimmed.replace(/\n/g, '<br>')}</p>`;
      })
      .join('\n');

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Georgia', 'Times New Roman', serif;
      font-size: 11pt;
      line-height: 1.5;
      color: #111;
    }
    h1 { font-size: 18pt; margin-bottom: 4pt; }
    h2 { font-size: 13pt; margin-top: 12pt; margin-bottom: 3pt; border-bottom: 1px solid #ccc; padding-bottom: 2pt; }
    h3 { font-size: 11pt; margin-top: 8pt; margin-bottom: 2pt; }
    p  { margin-bottom: 6pt; }
    ul { margin: 4pt 0 6pt 18pt; }
    li { margin-bottom: 2pt; }
    hr { border: none; border-top: 1px solid #ddd; margin: 10pt 0; }
    strong { font-weight: bold; }
    em { font-style: italic; }
    code { font-family: monospace; font-size: 10pt; }
    a  { color: #111; text-decoration: none; }
  </style>
</head>
<body>
${html}
</body>
</html>`;
  }
}
