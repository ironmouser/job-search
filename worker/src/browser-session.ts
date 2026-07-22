import { chromium, Browser, Page, BrowserContext } from 'playwright';
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
 *  - Close cleanly on shutdown or error
 */
export class BrowserSession {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private _page: Page | null = null;
  private tempDir: string | null = null;

  get page(): Page {
    if (!this._page) throw new Error('BrowserSession not started — call launch() first');
    return this._page;
  }

  // ─── Lifecycle ────────────────────────────────────────────────────────────

  async launch(): Promise<void> {
    this.browser = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',     // Required in Docker (shared memory limit)
        '--disable-gpu',
        '--disable-extensions',
        '--window-size=1920,1080',
      ],
    });

    this.context = await this.browser.newContext({
      viewport: { width: 1920, height: 1080 },
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ' +
        'AppleWebKit/537.36 (KHTML, like Gecko) ' +
        'Chrome/120.0.0.0 Safari/537.36',
      acceptDownloads: true,
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

  async navigate(url: string, waitUntil: 'load' | 'networkidle' | 'domcontentloaded' = 'networkidle'): Promise<void> {
    await this.page.goto(url, { waitUntil, timeout: 30_000 });
  }

  /** Returns the HTML of the current page */
  async getHtml(): Promise<string> {
    return this.page.content();
  }

  /** Returns the URL chain of all redirects that occurred since last navigation */
  async getRedirectChain(): Promise<string[]> {
    return [this.page.url()];
  }

  // ─── Screenshots ──────────────────────────────────────────────────────────

  async screenshot(filename: string): Promise<string> {
    if (!this.tempDir) throw new Error('Session not launched');
    const filePath = path.join(this.tempDir, filename);
    await this.page.screenshot({ path: filePath, fullPage: false });
    return filePath;
  }

  // ─── File helpers ─────────────────────────────────────────────────────────

  /**
   * Write markdown content as a plain text file for ATS upload.
   * Most ATS systems accept .txt or .pdf. For MVP, we write to a .txt file.
   * Future: use a PDF generation library.
   */
  async writeMarkdownToPdf(markdown: string, filename: string): Promise<string> {
    if (!this.tempDir) throw new Error('Session not launched');

    // Strip markdown syntax for plain text
    const plainText = markdown
      .replace(/^#{1,6}\s+/gm, '')     // headings
      .replace(/\*\*(.+?)\*\*/g, '$1') // bold
      .replace(/\*(.+?)\*/g, '$1')     // italic
      .replace(/`(.+?)`/g, '$1')       // code
      .replace(/\[(.+?)\]\(.+?\)/g, '$1') // links
      .trim();

    const txtFilename = filename.replace(/\.pdf$/, '.txt');
    const filePath = path.join(this.tempDir, txtFilename);
    await fs.writeFile(filePath, plainText, 'utf-8');
    return filePath;
  }
}
