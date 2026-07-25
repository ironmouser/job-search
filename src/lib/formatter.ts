import * as cheerio from 'cheerio';
import dns from 'dns';
import { callDeepSeek } from './deepseek';

// Fix Node.js IPv6 dual-stack fetch issues on macOS / local environments
try {
    dns.setDefaultResultOrder('ipv4first');
} catch {}

/**
 * Reformats raw scraped job description HTML/text into clean Markdown using DeepSeek V4.
 * Strictly preserves all original information, restoring headings, bullet lists, paragraphs,
 * and fixing spacing/duplicated whitespace without adding or removing content.
 */
export async function reformatJobDescriptionWithGemini(rawContent: string): Promise<string> {
    if (!rawContent || rawContent.trim().length === 0) {
        return rawContent || '';
    }

    const trimmedRaw = rawContent.trim();

    if (process.env.DEEPSEEK_API_KEY) {
        const prompt = `When formatting a scraped job description.
DO NOT rewrite or summarize.
Only:
- preserve all information
- fix spacing
- restore headings
- restore bullet lists
- restore paragraphs
- remove duplicated whitespace
- do not add or remove content

Format this job description into Markdown:
${trimmedRaw}`;

        try {
            const formatted = await callDeepSeek({
                model: 'deepseek-v4-flash',
                messages: [{ role: 'user', content: prompt }]
            });
            if (formatted && formatted.trim().length > 0) {
                return formatted.trim();
            }
        } catch (err: any) {
            console.warn('DeepSeek formatting failed, falling back to html cleanup:', err.message);
        }
    }

    // Fallback: Clean HTML to readable plain text with preserved line breaks
    return fallbackHtmlCleanup(trimmedRaw);
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
        .replace(/[ \t\u00A0]+/g, ' ')
        .replace(/(\r?\n\s*){3,}/g, '\n\n')
        .trim();
}
