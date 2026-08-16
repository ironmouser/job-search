import * as cheerio from 'cheerio';
import dns from 'dns';
import { callAI } from './ai';

// Fix Node.js IPv6 dual-stack fetch issues on macOS / local environments
try {
    dns.setDefaultResultOrder('ipv4first');
} catch {}

/**
 * Pre-cleans raw HTML by stripping boilerplate (navs, footers, cookie banners, scripts, styles)
 * and converting structural elements to text before sending to an LLM or fallback formatter.
 * Reduces token payload by 50-70%.
 */
/**
 * Decodes HTML entities (&lt;, &gt;, &amp;, &quot;, &#39;, &nbsp;, etc.)
 */
export function decodeHtmlEntities(str: string): string {
    if (!str || str.trim().length === 0) return '';
    let decoded = str;
    // Perform 2 passes in case of double-encoded entities like &amp;lt;
    for (let i = 0; i < 2; i++) {
        if (!/&[a-zA-Z0-9#]+;/.test(decoded)) break;
        decoded = decoded
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&#39;|&#039;|&apos;/g, "'")
            .replace(/&nbsp;/g, ' ')
            .replace(/&#(\d+);/g, (_, dec) => {
                try { return String.fromCharCode(parseInt(dec, 10)); } catch { return _; }
            })
            .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => {
                try { return String.fromCharCode(parseInt(hex, 16)); } catch { return _; }
            });
    }
    return decoded;
}

/**
 * Converts raw HTML or entity-encoded HTML to clean, readable Markdown without invoking an LLM.
 * Preserves bold, italics, headings, lists, and line breaks while stripping unwanted markup.
 */
export function convertHtmlToMarkdown(htmlOrText: string): string {
    if (!htmlOrText || htmlOrText.trim().length === 0) return '';

    // Step 1: Decode entities (handles &lt;strong&gt;, &amp;nbsp;, etc.)
    const decoded = decodeHtmlEntities(htmlOrText.trim());

    // Step 2: Check if content actually has HTML tags
    if (!/<[a-zA-Z][^>]*>|<\/[a-zA-Z]+>|<br\s*\/?>/i.test(decoded)) {
        return decoded
            .replace(/\r\n/g, '\n')
            .replace(/[ \t\u00A0]+/g, ' ')
            .replace(/\n{3,}/g, '\n\n')
            .trim();
    }

    try {
        const $ = cheerio.load(decoded);

        // Strip non-content / boilerplate tags
        $(
            'script, style, noscript, nav, header, footer, iframe, svg, form, ' +
            'button, input, [role="navigation"], [role="banner"], [role="contentinfo"], ' +
            '[class*="cookie"], [class*="banner"], [class*="gdpr"], [class*="modal"], ' +
            '[class*="share"], [class*="social"], [class*="advert"], [id*="cookie"], [id*="gdpr"]'
        ).remove();

        // Convert line breaks and hr
        $('br').replaceWith('\n');
        $('hr').replaceWith('\n\n---\n\n');

        // Convert inline styling: bold and italics
        $('strong, b').each((_, el) => {
            const inner = $(el).text().trim();
            if (inner) {
                $(el).replaceWith(` **${inner}** `);
            } else {
                $(el).remove();
            }
        });

        $('em, i').each((_, el) => {
            const inner = $(el).text().trim();
            if (inner) {
                $(el).replaceWith(` *${inner}* `);
            } else {
                $(el).remove();
            }
        });

        // Convert headers
        $('h1, h2, h3, h4, h5, h6').each((_, el) => {
            const tagName = (el as any).tagName?.toLowerCase() || 'h2';
            const level = tagName.startsWith('h') ? '#'.repeat(Math.min(parseInt(tagName[1]) || 2, 4)) : '##';
            const headerText = $(el).text().trim();
            if (headerText) {
                $(el).replaceWith(`\n\n${level} ${headerText}\n\n`);
            } else {
                $(el).remove();
            }
        });

        // Convert lists
        $('li').each((_, el) => {
            const itemText = $(el).text().trim();
            if (itemText) {
                $(el).replaceWith(`\n- ${itemText}`);
            } else {
                $(el).remove();
            }
        });

        // Convert blocks
        $('p, div, blockquote, section, article').each((_, el) => {
            $(el).append('\n\n');
        });

        let text = $.text();

        // Clean up formatting artifacts
        text = text
            .replace(/\r\n/g, '\n')
            .replace(/[ \t\u00A0]+/g, ' ')
            .replace(/ +\n/g, '\n')
            .replace(/\n[ \t]+/g, '\n')
            .replace(/\n{3,}/g, '\n\n')
            .replace(/\*\*\s+\*\*/g, '')
            .trim();

        return text;
    } catch {
        return fallbackHtmlCleanup(decoded);
    }
}

/**
 * Pre-cleans raw HTML by stripping boilerplate (navs, footers, cookie banners, scripts, styles)
 * and converting structural elements to text before sending to an LLM or fallback formatter.
 * Reduces token payload by 50-70%.
 */
export function preCleanHtml(htmlOrText: string): string {
    return convertHtmlToMarkdown(htmlOrText);
}

/**
 * Checks if a text string is already formatted Markdown (no HTML tags, contains Markdown structure).
 */
export function isAlreadyFormattedMarkdown(text: string): boolean {
    if (!text || text.trim().length === 0) return false;
    // Has HTML opening tags?
    if (/<[a-zA-Z][^>]*>/.test(text)) return false;
    // Has markdown headings or bullet points or numbered lists?
    const hasHeadings = /^#{1,4}\s+/m.test(text);
    const hasBullets = /^\s*[\*\-•]\s+/m.test(text);
    const hasNumbered = /^\s*\d+\.\s+/m.test(text);
    return hasHeadings || hasBullets || hasNumbered;
}

/**
 * Reformats raw scraped job description HTML/text into clean Markdown.
 * Pre-cleans HTML, detects existing Markdown, and utilizes GPT-5 nano / Gemini 3.1 Flash-Lite (with fallback).
 */
export async function reformatJobDescriptionWithGemini(
    rawContent: string,
    options?: { skipLlmFormat?: boolean }
): Promise<string> {
    if (!rawContent || rawContent.trim().length === 0) {
        return rawContent || '';
    }

    const trimmedRaw = rawContent.trim();

    // 1. Bypass LLM if already clean Markdown
    if (isAlreadyFormattedMarkdown(trimmedRaw)) {
        return trimmedRaw;
    }

    // 2. Pre-clean HTML to strip navs, footers, scripts, and cookie banners
    const preCleaned = preCleanHtml(trimmedRaw);
    if (!preCleaned || preCleaned.length < 50) {
        return fallbackHtmlCleanup(trimmedRaw);
    }

    // 3. If caller explicitly requested non-LLM format, return preCleaned result
    if (options?.skipLlmFormat) {
        return preCleaned;
    }

    // 4. Send pre-cleaned text to light LLM (GPT-5 nano / Gemini 3.1 Flash-Lite / DeepSeek)
    const prompt = `You are an expert technical document formatter. Your task is to convert scraped job description text into cleanly structured, readable Markdown without altering any meaning.

CRITICAL INSTRUCTIONS:
1. Identify and Format Headers: Detect section titles (e.g., "About Us", "Role Summary", "Responsibilities", "Requirements", "Nice to Have", "Benefits") and format them with Markdown headings (## or ###).
2. Create Unordered Lists: Format responsibilities, requirements, and technical skills as bulleted list items (- ) rather than running paragraphs.
3. Create Ordered Lists: Format sequential instructions as numbered lists (1., 2., 3.).
4. Use Bold for Clarity: Apply bold emphasis (**bold**) to key terms or sub-headers where appropriate.
5. Preserve Complete Information: Strictly retain all factual details, requirements, links, and text. Do NOT rewrite, summarize, add, or delete any content.
6. Return clean Markdown only: Do not wrap your response in markdown code block fences.

Here is the text to format:
${preCleaned}`;

    let timerId: NodeJS.Timeout | null = null;
    try {
        const timeoutPromise = new Promise<null>((resolve) => {
            timerId = setTimeout(() => resolve(null), 25000);
        });

        const formatted = await Promise.race([
            callAI({
                task: 'format',
                messages: [{ role: 'user', content: prompt }],
                maxTokens: 4096
            }),
            timeoutPromise
        ]);

        if (formatted && formatted.trim().length > 0) {
            let cleaned = formatted.trim().replace(/^"|"$/g, '').replace(/\\n/g, '\n').replace(/\\"/g, '"');
            if (cleaned.startsWith('```')) {
                cleaned = cleaned.replace(/^```[a-zA-Z]*\n?/, '').replace(/\n?```$/, '').trim();
            }
            return cleaned;
        }
    } catch (err: any) {
        console.warn('AI job description formatting failed, falling back to preCleaned html:', err.message);
    } finally {
        if (timerId) {
            clearTimeout(timerId);
        }
    }

    // Fallback: Return pre-cleaned text
    return preCleaned;
}

/**
 * Fallback HTML cleanup if API key is missing or calls fail.
 */
export function fallbackHtmlCleanup(htmlOrText: string): string {
    if (!htmlOrText) return '';

    let formatted = htmlOrText
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/p>/gi, '\n\n')
        .replace(/<\/div>/gi, '\n')
        .replace(/<\/h[1-6]>/gi, '\n\n')
        .replace(/<h[1-6][^>]*>/gi, '\n\n## ')
        .replace(/<li[^>]*>/gi, '\n- ')
        .replace(/<\/li>/gi, '');

    try {
        const $ = cheerio.load(formatted);
        $('script, style, noscript, svg, iframe').remove();
        formatted = $.text();
    } catch {
        formatted = formatted.replace(/<[^>]+>/g, '');
    }

    return formatted
        .replace(/\r\n/g, '\n')
        .replace(/[ \t\u00A0]+/g, ' ')
        .replace(/\n[ \t]+/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

