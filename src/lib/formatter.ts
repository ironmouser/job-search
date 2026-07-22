import { GoogleGenerativeAI } from '@google/generative-ai';
import * as cheerio from 'cheerio';
import dns from 'dns';

// Fix Node.js IPv6 dual-stack fetch issues on macOS / local environments
try {
    dns.setDefaultResultOrder('ipv4first');
} catch {}

/**
 * Reformats raw scraped job description HTML/text into clean Markdown using Gemini 1.5 Flash 8b.
 * Strictly preserves all original information, restoring headings, bullet lists, paragraphs,
 * and fixing spacing/duplicated whitespace without adding or removing content.
 */
export async function reformatJobDescriptionWithGemini(rawContent: string): Promise<string> {
    if (!rawContent || rawContent.trim().length === 0) {
        return rawContent || '';
    }

    const trimmedRaw = rawContent.trim();

    // If Gemini key is available, attempt Gemini formatting
    if (process.env.GEMINI_API_KEY) {
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

        const modelsToTry = ['gemini-3.1-flash-lite', 'gemini-2.0-flash'];
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

        for (const modelName of modelsToTry) {
            try {
                const model = genAI.getGenerativeModel({ model: modelName });
                const result = await model.generateContent(prompt);
                const text = result.response.text();
                if (text && text.trim().length > 0) {
                    return text.trim();
                }
            } catch (err: any) {
                // Silently move to fallback if rate limited or unavailable
            }
        }
    }

    // Fallback: Clean HTML to readable plain text with preserved line breaks
    return fallbackHtmlCleanup(trimmedRaw);
}

/**
 * Fallback HTML cleanup if Gemini API key is missing or calls fail.
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
