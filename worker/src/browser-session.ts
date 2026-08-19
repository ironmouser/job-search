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
    this.browser = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',     // Required in Docker (shared memory limit)
        '--disable-gpu',
        '--disable-extensions',
        '--disable-blink-features=AutomationControlled',
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
    };

    if (storageState && typeof storageState === 'object') {
      contextOptions.storageState = storageState;
    }

    this.context = await this.browser.newContext(contextOptions);

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
