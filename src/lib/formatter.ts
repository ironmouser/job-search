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
export function preCleanHtml(htmlOrText: string): string {
    if (!htmlOrText || htmlOrText.trim().length === 0) return '';

    // If it doesn't look like HTML, return trimmed plain text (safe linear check)
    if (!/<[a-zA-Z][^>]*>/.test(htmlOrText)) {
        return htmlOrText
            .replace(/\r\n/g, '\n')
            .replace(/[ \t\u00A0]+/g, ' ')
            .replace(/\n{3,}/g, '\n\n')
            .trim();
    }

    try {
        const $ = cheerio.load(htmlOrText);

        // Strip non-content / boilerplate tags
        $(
            'script, style, noscript, nav, header, footer, iframe, svg, form, ' +
            'button, input, [role="navigation"], [role="banner"], [role="contentinfo"], ' +
            '[class*="cookie"], [class*="banner"], [class*="gdpr"], [class*="modal"], ' +
            '[class*="share"], [class*="social"], [class*="advert"], [id*="cookie"], [id*="gdpr"]'
        ).remove();

        // Convert structural elements before stripping tags
        $('h1, h2, h3, h4, h5, h6').each((_, el) => {
            const level = el.tagName ? '#'.repeat(Math.min(parseInt(el.tagName[1]) || 2, 4)) : '##';
            $(el).prepend(`\n\n${level} `).append('\n');
        });
        $('li').each((_, el) => {
            $(el).prepend('\n- ');
        });
        $('p, div, blockquote').each((_, el) => {
            $(el).append('\n\n');
        });
        $('br').replaceWith('\n');

        let text = $.text();

        // Clean up excess whitespace and blank lines safely
        text = text
            .replace(/\r\n/g, '\n')
            .replace(/[ \t\u00A0]+/g, ' ')
            .replace(/\n[ \t]+/g, '\n')
            .replace(/\n{3,}/g, '\n\n')
            .trim();

        return text;
    } catch {
        // Fallback regex cleanup if Cheerio parsing fails
        return fallbackHtmlCleanup(htmlOrText);
    }
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
            timerId = setTimeout(() => resolve(null), 8000);
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

