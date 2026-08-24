/**
 * worker/src/generic-agent/axtree-builder.ts
 *
 * AXTreeBuilder — generates a compact semantic representation of the current page
 * for use as context in AI model prompts.
 *
 * Key principles:
 *  - Does NOT send raw HTML to the model
 *  - Prioritizes visible interactive elements
 *  - Tags each element with a page region (job-content, modal, footer, etc.)
 *  - Produces a human-readable text format for prompt embedding
 *  - Filters out purely decorative, hidden, and obstructive elements
 */

import { Page } from 'playwright';
import { AXTreeElement, SemanticSnapshot, PageRegion } from './types';

// Selectors for elements we always exclude from the snapshot
const COOKIE_BANNER_SELECTORS = [
  '#onetrust-consent-sdk',
  '#onetrust-banner-sdk',
  '[id*="cookie" i]',
  '[class*="cookie" i]',
  '.didomi-popup-container',
  '[id*="didomi" i]',
  '[id*="CybotCookiebot" i]',
  '[id*="usercentrics" i]',
  '[class*="cookiebot" i]',
];

export class AXTreeBuilder {
  /**
   * Build a semantic snapshot of the current page.
   * Collect all visible, interactive elements, classify their region,
   * and produce a compact text representation for AI reasoning.
   */
  static async build(page: Page): Promise<SemanticSnapshot> {
    const url = page.url() ?? '';
    const title = await page.title().catch(() => '');

    const rawElements = await page.evaluate((): Array<{
      idx: number;
      tag: string;
      role: string;
      name: string;
      ariaLabel: string;
      href: string | null;
      disabled: boolean;
      // region markers from DOM
      inCookieBanner: boolean;
      inNav: boolean;
      inHeader: boolean;
      inFooter: boolean;
      inModal: boolean;
      inDialog: boolean;
      inAd: boolean;
      inRelatedJobs: boolean;
      inSidebar: boolean;
      inJobContent: boolean;
      bbox: { x: number; y: number; w: number; h: number } | null;
      // Visibility
      offsetWidth: number;
      offsetHeight: number;
      display: string;
      visibility: string;
      opacity: number;
    }> => {
      const interactiveTags = 'button, a[href], input:not([type="hidden"]), select, textarea, [role="button"], [role="link"], [role="menuitem"], [role="option"], [role="tab"], [role="combobox"]';
      const els = Array.from(document.querySelectorAll(interactiveTags));

      const cookieBannerSelectors = [
        '#onetrust-consent-sdk', '#onetrust-banner-sdk', '[id*="cookie"]',
        '[class*="cookie"]', '.didomi-popup-container', '[id*="didomi"]',
        '[id*="CybotCookiebot"]', '[id*="usercentrics"]',
      ];

      const isInCookieBanner = (el: Element) =>
        cookieBannerSelectors.some(sel => el.closest(sel) !== null);

      const getRegion = (el: Element) => ({
        inCookieBanner: isInCookieBanner(el),
        inNav: !!el.closest('nav, [role="navigation"], .nav, .navbar, #nav, #navigation'),
        inHeader: !!el.closest('header, [role="banner"], .header, #header'),
        inFooter: !!el.closest('footer, [role="contentinfo"], .footer, #footer'),
        inModal: !!el.closest('[role="dialog"], [aria-modal="true"], .modal, [class*="modal" i]'),
        inDialog: !!el.closest('dialog, [role="alertdialog"]'),
        inAd: !!el.closest('[class*="ad-" i], [id*="advertisement" i], [data-ad], .advertisement, [class*="banner" i][class*="promo" i]'),
        inRelatedJobs: !!el.closest('[class*="related" i][class*="job" i], [id*="related" i][id*="job" i], [class*="similar" i][class*="job" i], [data-module*="related" i]'),
        inSidebar: !!el.closest('aside, [role="complementary"], .sidebar, #sidebar'),
        inJobContent: !!el.closest('[class*="job" i], [class*="position" i], [class*="posting" i], [class*="description" i], [class*="career" i], main, [role="main"]'),
      });

      return els.slice(0, 150).map((el, idx) => {
        const regions = getRegion(el);
        const rect = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);

        let text = '';
        if ((el as HTMLInputElement).value && (el as HTMLInputElement).type !== 'file') {
          text = (el as HTMLInputElement).value;
        } else {
          text = (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 100);
        }

        return {
          idx,
          tag: el.tagName.toLowerCase(),
          role: el.getAttribute('role') || el.tagName.toLowerCase(),
          name: text,
          ariaLabel: el.getAttribute('aria-label') || el.getAttribute('title') || '',
          href: (el as HTMLAnchorElement).href || null,
          disabled: (el as HTMLButtonElement).disabled || el.getAttribute('aria-disabled') === 'true',
          ...regions,
          bbox: rect.width > 0 && rect.height > 0
            ? { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height) }
            : null,
          offsetWidth: (el as HTMLElement).offsetWidth,
          offsetHeight: (el as HTMLElement).offsetHeight,
          display: style.display,
          visibility: style.visibility,
          opacity: parseFloat(style.opacity),
        };
      });
    }).catch(() => []);

    // Convert to AXTreeElement array, applying filters
    const elements: AXTreeElement[] = [];

    for (const raw of rawElements) {
      // Skip truly invisible elements
      const visible = raw.display !== 'none' &&
        raw.visibility !== 'hidden' &&
        raw.opacity > 0.05 &&
        (raw.bbox !== null || raw.offsetWidth > 0);

      if (!visible) continue;

      // Skip elements with no meaningful name
      const name = (raw.name || raw.ariaLabel || '').trim();
      if (!name && !raw.href) continue;

      const region = this.classifyRegion(raw);
      const enabled = !raw.disabled;

      elements.push({
        id: `element_${raw.idx}`,
        tag: raw.tag,
        role: raw.role,
        name,
        ariaLabel: raw.ariaLabel,
        href: raw.href ?? undefined,
        visible,
        enabled,
        inViewport: raw.bbox !== null,
        region,
        bbox: raw.bbox ? { x: raw.bbox.x, y: raw.bbox.y, w: raw.bbox.w, h: raw.bbox.h } : undefined,
      });
    }

    const textRepresentation = this.buildTextRepresentation(url, title, elements);

    return { url, title, elements, textRepresentation };
  }

  /**
   * Determine the page region for an element based on its DOM ancestry markers.
   */
  private static classifyRegion(raw: {
    inCookieBanner: boolean;
    inNav: boolean;
    inHeader: boolean;
    inFooter: boolean;
    inModal: boolean;
    inDialog: boolean;
    inAd: boolean;
    inRelatedJobs: boolean;
    inSidebar: boolean;
    inJobContent: boolean;
  }): PageRegion {
    if (raw.inCookieBanner) return 'cookie-banner';
    if (raw.inModal) return 'modal';
    if (raw.inDialog) return 'dialog';
    if (raw.inAd) return 'advertisement';
    if (raw.inRelatedJobs) return 'related-jobs';
    if (raw.inSidebar) return 'sidebar';
    if (raw.inFooter) return 'footer';
    if (raw.inHeader) return 'job-header';
    if (raw.inNav) return 'navigation';
    if (raw.inJobContent) return 'job-content';
    return 'unknown';
  }

  /**
   * Build a compact text representation of the snapshot for AI prompt embedding.
   * Groups elements by region for clarity.
   */
  static buildTextRepresentation(url: string, title: string, elements: AXTreeElement[]): string {
    const lines: string[] = [
      'PAGE',
      `Title: ${title}`,
      `URL: ${url}`,
      '',
      'INTERACTIVE ELEMENTS',
      '',
    ];

    // Group by region
    const regionOrder: PageRegion[] = [
      'job-header', 'job-content', 'application-content',
      'modal', 'dialog', 'cookie-banner',
      'navigation', 'sidebar', 'related-jobs',
      'advertisement', 'footer', 'unknown',
    ];

    const byRegion = new Map<PageRegion, AXTreeElement[]>();
    for (const el of elements) {
      if (!byRegion.has(el.region)) byRegion.set(el.region, []);
      byRegion.get(el.region)!.push(el);
    }

    for (const region of regionOrder) {
      const regionEls = byRegion.get(region);
      if (!regionEls || regionEls.length === 0) continue;

      lines.push(`[REGION: ${region.toUpperCase()}]`);

      for (const el of regionEls) {
        const name = el.ariaLabel || el.name;
        lines.push(`[${el.id}]`);
        lines.push(`  role=${el.role}`);
        if (name) lines.push(`  name="${name}"`);
        if (el.href) lines.push(`  href="${el.href.slice(0, 80)}"`);
        lines.push(`  visible=${el.visible}`);
        lines.push(`  enabled=${el.enabled}`);
        lines.push(`  inViewport=${el.inViewport}`);
        lines.push(`  region=${el.region}`);
        if (el.bbox) {
          lines.push(`  bbox=(${el.bbox.x},${el.bbox.y},${el.bbox.w},${el.bbox.h})`);
        }
        lines.push('');
      }
    }

    return lines.join('\n');
  }

  /**
   * Find an AXTree element by its ID string (e.g., "element_17").
   * Returns null if not found.
   */
  static findElementById(snapshot: SemanticSnapshot, elementId: string): AXTreeElement | null {
    return snapshot.elements.find(el => el.id === elementId) ?? null;
  }

  /**
   * Attempt to locate a Playwright locator for an AXTree element.
   * Uses bounding box coordinates or text-based selectors as fallback.
   */
  static async resolveLocator(
    page: Page,
    element: AXTreeElement
  ): Promise<import('playwright').Locator | null> {
    // Try text-based selectors first (more stable than coordinates)
    const name = element.ariaLabel || element.name;

    if (name) {
      const selectors = [
        element.tag === 'button' ? `button:has-text("${name.replace(/"/g, '\\"')}")` : null,
        element.tag === 'a' ? `a:has-text("${name.replace(/"/g, '\\"')}")` : null,
        `[role="${element.role}"]:has-text("${name.replace(/"/g, '\\"')}")`,
        element.href ? `a[href*="${new URL(element.href).pathname.slice(0, 30).replace(/"/g, '\\"')}"]` : null,
      ].filter(Boolean) as string[];

      for (const sel of selectors) {
        try {
          const loc = page.locator(sel).first();
          const count = await loc.count().catch(() => 0);
          if (count > 0) {
            const visible = await loc.isVisible().catch(() => false);
            if (visible) return loc;
          }
        } catch { /* continue */ }
      }
    }

    // Fallback: index-based
    try {
      const idx = parseInt(element.id.replace('element_', ''), 10);
      const allEls = page.locator('button, a[href], input:not([type="hidden"]), select, textarea, [role="button"]');
      const count = await allEls.count().catch(() => 0);
      if (idx < count) {
        const loc = allEls.nth(idx);
        if (await loc.isVisible().catch(() => false)) return loc;
      }
    } catch { /* ignore */ }

    return null;
  }
}
