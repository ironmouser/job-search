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
        const prompt = `You are an expert technical document formatter. Your task is to analyze scraped job description text and convert it into cleanly structured, readable Markdown without altering any of the meaning.

CRITICAL INSTRUCTIONS:
1. Identify and Format Headers: Detect section titles (e.g., "About Us", "Role Summary", "Responsibilities", "What You'll Do", "Qualifications", "Requirements", "Nice to Have", "Benefits") and format them with Markdown headings (## or ###).
2. Create Unordered Lists: When you encounter lists of responsibilities, requirements, technical skills, or benefits, format each point as a bulleted list item (- ) rather than running them together as a paragraph.
3. Create Ordered Lists: Identify sequential instructions, hiring process stages, or prioritized steps and format them as numbered lists (1., 2., 3.).
4. Use Emphasis for Clarity: Apply bold emphasis (**bold**) to key terms, tool names, or sub-headers where appropriate to establish visual structure.
5. Paragraph Spacing: Separate dense text blocks into well-spaced logical paragraphs with clean double line breaks between sections. Remove duplicate spacing and raw scraping artifacts.
6. Preserve Complete Information: Strictly retain all factual details, requirements, links, and text from the original description. Do NOT rewrite, summarize, add, or delete any content.
7. Return clean Markdown only: Do not wrap your response in markdown code block fences (like \`\`\`markdown).

Here is the raw job description to format:
${trimmedRaw}`;

        try {
            const formatted = await Promise.race([
                callDeepSeek({
                    model: 'deepseek-v4-flash',
                    messages: [{ role: 'user', content: prompt }]
                }),
                new Promise<null>((resolve) => setTimeout(() => resolve(null), 7000))
            ]);
            if (formatted && formatted.trim().length > 0) {
                let cleaned = formatted.trim().replace(/^"|"$/g, '').replace(/\\n/g, '\n').replace(/\\"/g, '"');
                if (cleaned.startsWith('```')) {
                    cleaned = cleaned.replace(/^```[a-zA-Z]*\n?/, '').replace(/\n?```$/, '').trim();
                }
                return cleaned;
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
