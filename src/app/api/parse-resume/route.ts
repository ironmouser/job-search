import { NextResponse } from 'next/server';
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import mammoth from 'mammoth';
import pdfParse from 'pdf-parse/lib/pdf-parse.js';
import Anthropic from '@anthropic-ai/sdk';
import { callDeepSeek } from '@/lib/deepseek';
import { checkAiSafeguard, logAiCost, estimateTokens } from '@/lib/ai-safeguard';

function normalizeCloudUrl(url: string, accessToken?: string): { fetchUrl: string; headers?: Record<string, string> } {
    let fetchUrl = url.trim();
    const headers: Record<string, string> = {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    };

    if (accessToken) {
        headers['Authorization'] = `Bearer ${accessToken}`;
    }

    // Google Docs share links (e.g. https://docs.google.com/document/d/DOC_ID/edit)
    if (fetchUrl.includes('docs.google.com/document/d/')) {
        const docIdMatch = fetchUrl.match(/\/document\/d\/([a-zA-Z0-9_-]+)/);
        if (docIdMatch && docIdMatch[1]) {
            const docId = docIdMatch[1];
            fetchUrl = `https://docs.google.com/document/d/${docId}/export?format=pdf`;
            return { fetchUrl, headers };
        }
    }

    // Google Drive file share links (e.g. https://drive.google.com/file/d/FILE_ID/view)
    if (fetchUrl.includes('drive.google.com')) {
        const fileIdMatch = fetchUrl.match(/\/file\/d\/([a-zA-Z0-9_-]+)/) || fetchUrl.match(/[?&]id=([a-zA-Z0-9_-]+)/);
        if (fileIdMatch && fileIdMatch[1]) {
            const fileId = fileIdMatch[1];
            if (accessToken) {
                fetchUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
            } else {
                fetchUrl = `https://drive.google.com/uc?export=download&id=${fileId}&confirm=t`;
            }
        }
    }
    // Dropbox share links
    else if (fetchUrl.includes('dropbox.com')) {
        if (fetchUrl.includes('?dl=0') || fetchUrl.includes('&dl=0')) {
            fetchUrl = fetchUrl.replace('dl=0', 'raw=1');
        } else if (fetchUrl.includes('?dl=1') || fetchUrl.includes('&dl=1')) {
            fetchUrl = fetchUrl.replace('dl=1', 'raw=1');
        } else if (!fetchUrl.includes('raw=1')) {
            fetchUrl += fetchUrl.includes('?') ? '&raw=1' : '?raw=1';
        }
        fetchUrl = fetchUrl.replace('www.dropbox.com', 'dl.dropboxusercontent.com');
    }

    return { fetchUrl, headers };
}

function cleanMarkdownFences(markdown: string): string {
    let cleaned = markdown.trim();
    if (cleaned.startsWith('```')) {
        cleaned = cleaned.replace(/^```[a-zA-Z]*\n?/, '').replace(/\n?```$/, '');
    }
    // Remove em-dashes and double-hyphens used as punctuation
    cleaned = cleaned.replace(/\s*—\s*/g, ', ').replace(/\s*--\s*/g, ', ');
    return cleaned.trim();
}

/**
 * Formats raw resume text into clean Markdown using DeepSeek (with Gemini / Claude fallback).
 */
async function formatResumeTextToMarkdown(rawText: string, userId?: string): Promise<string> {
    const prompt = `You are an expert resume parser. I am providing you with text extracted from a candidate's resume.
Your job is to cleanly format this resume into pristine Markdown. 
Preserve all the original information, experience, dates, bullet points, education, and skills, but structure it beautifully using Markdown headers (##, ###), bullet points, and bold text. 
Do NOT use em-dashes ("—" or "--") or hyphens as punctuation. Do NOT add any conversational filler. Just return the markdown resume.

RAW RESUME TEXT:
${rawText}`;

    // 1. Try DeepSeek
    if (process.env.DEEPSEEK_API_KEY) {
        try {
            const result = await callDeepSeek({
                model: 'deepseek-v4-flash',
                messages: [{ role: 'user', content: prompt }],
                userId
            });
            if (result && result.trim().length > 30) {
                return cleanMarkdownFences(result);
            }
        } catch (e: any) {
            console.warn('DeepSeek resume formatting failed, trying Gemini fallback:', e.message);
        }
    }

    // 2. Fallback to Gemini (Flash Lite is prioritized as the most cost-effective option)
    if (process.env.GEMINI_API_KEY) {
        const geminiModels = ['gemini-3.1-flash-lite', 'gemini-3.5-flash-lite', 'gemini-2.5-flash-lite', 'gemini-3.5-flash', 'gemini-3.7-flash'];
        for (const model of geminiModels) {
            try {
                const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{ parts: [{ text: prompt }] }]
                    })
                });
                const data = await res.json();
                const content = data.candidates?.[0]?.content?.parts?.[0]?.text;
                if (content && content.trim().length > 30) {
                    await logAiCost(model, estimateTokens(prompt), estimateTokens(content), userId);
                    return cleanMarkdownFences(content);
                }
            } catch (err: any) {
                console.warn(`Gemini model ${model} formatting failed:`, err.message);
            }
        }
    }

    // 3. Fallback to Claude
    if (process.env.ANTHROPIC_API_KEY) {
        try {
            const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
            const response = await anthropic.messages.create({
                model: 'claude-haiku-4-5-20251001',
                max_tokens: 4096,
                messages: [{ role: 'user', content: prompt }]
            });
            const textContent = response.content[0]?.type === 'text' ? response.content[0].text : '';
            if (textContent && textContent.trim().length > 30) {
                await logAiCost('claude-haiku-4-5-20251001', response.usage?.input_tokens || estimateTokens(prompt), response.usage?.output_tokens || estimateTokens(textContent), userId);
                return cleanMarkdownFences(textContent);
            }
        } catch (err: any) {
            console.warn('Claude fallback formatting failed:', err.message);
        }
    }

    // If all LLMs fail, return raw text
    return rawText;
}

/**
 * Multimodal document extraction for scanned / raster / canvas-based PDFs (e.g. from html2pdf.js or Canva) and images.
 */
async function extractResumeMultimodal(buffer: Buffer, mimeType: string, userId?: string): Promise<string | null> {
    const prompt = `You are an expert resume parser. Extract all resume information from the uploaded document and format it cleanly into pristine Markdown.
Preserve all candidate information, including full name, contact information (email, phone, location, links), summary, work experience (job titles, company names, dates, and full bullet points), skills, education, and certifications.
Do NOT omit or truncate any experience or details.
Structure it cleanly using Markdown headers (##, ###) and standard bullet points.
Do NOT use em-dashes ("—" or "--") or hyphens as punctuation.
Do NOT wrap the output in conversational commentary or filler. Return ONLY the formatted markdown resume.
If the document is completely blank, empty, or contains no readable candidate/resume content whatsoever, respond ONLY with: ERROR_NO_RESUME_CONTENT`;

    const base64Data = buffer.toString('base64');

    // 1. Try Gemini Multimodal (Flash Lite prioritized first for cost-efficiency)
    if (process.env.GEMINI_API_KEY) {
        const geminiModels = ['gemini-3.1-flash-lite', 'gemini-3.5-flash-lite', 'gemini-2.5-flash-lite', 'gemini-3.5-flash', 'gemini-3.7-flash'];
        for (const model of geminiModels) {
            try {
                const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{
                            parts: [
                                { text: prompt },
                                { inlineData: { mimeType, data: base64Data } }
                            ]
                        }]
                    })
                });

                const data = await res.json();
                const content = data.candidates?.[0]?.content?.parts?.[0]?.text;
                if (content) {
                    const cleaned = cleanMarkdownFences(content);
                    if (cleaned.includes('ERROR_NO_RESUME_CONTENT')) {
                        return null;
                    }
                    if (cleaned.length > 20) {
                        await logAiCost(model, estimateTokens(prompt) + Math.ceil(buffer.length / 100), estimateTokens(cleaned), userId);
                        return cleaned;
                    }
                }
            } catch (err: any) {
                console.warn(`Gemini multimodal ${model} failed:`, err.message);
            }
        }
    }

    // 2. Try Claude Multimodal
    if (process.env.ANTHROPIC_API_KEY) {
        try {
            const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
            const isPdf = mimeType === 'application/pdf';

            const contentBlock: any = isPdf
                ? {
                    type: 'document',
                    source: {
                        type: 'base64',
                        media_type: 'application/pdf',
                        data: base64Data,
                    }
                }
                : {
                    type: 'image',
                    source: {
                        type: 'base64',
                        media_type: mimeType as any,
                        data: base64Data,
                    }
                };

            const response = await anthropic.messages.create({
                model: 'claude-haiku-4-5-20251001',
                max_tokens: 4096,
                messages: [{
                    role: 'user',
                    content: [
                        contentBlock,
                        { type: 'text', text: prompt }
                    ]
                }]
            });

            const textContent = response.content[0]?.type === 'text' ? response.content[0].text : '';
            if (textContent) {
                const cleaned = cleanMarkdownFences(textContent);
                if (cleaned.includes('ERROR_NO_RESUME_CONTENT')) {
                    return null;
                }
                if (cleaned.length > 20) {
                    await logAiCost('claude-haiku-4-5-20251001', response.usage?.input_tokens || estimateTokens(prompt), response.usage?.output_tokens || estimateTokens(cleaned), userId);
                    return cleaned;
                }
            }
        } catch (err: any) {
            console.warn('Claude multimodal extraction failed:', err.message);
        }
    }

    return null;
}

export async function POST(request: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        const userId = session.user.id as string;

        let buffer: Buffer;
        let fileName = 'resume.pdf';

        const contentType = request.headers.get('content-type') || '';

        if (contentType.includes('application/json')) {
            const json = await request.json();
            const { fileUrl, fileName: providedFileName, accessToken } = json;

            if (!fileUrl) {
                return NextResponse.json({ error: 'No file URL provided' }, { status: 400 });
            }

            if (providedFileName) {
                fileName = providedFileName;
            } else if (fileUrl.includes('.docx')) {
                fileName = 'resume.docx';
            }

            const { fetchUrl, headers } = normalizeCloudUrl(fileUrl, accessToken);

            const res = await fetch(fetchUrl, { headers, redirect: 'follow' });
            if (!res.ok) {
                return NextResponse.json({ error: `Failed to download file from cloud link (${res.status}). Please check link permissions or upload the document directly.` }, { status: 400 });
            }

            const arrayBuffer = await res.arrayBuffer();
            buffer = Buffer.from(arrayBuffer);

            // Check if response is an HTML page (Google Drive Access Denied, Sign in, 404 page, etc.)
            const snippet = buffer.slice(0, 150).toString('utf8').trim().toLowerCase();
            if (snippet.startsWith('<!doctype html') || snippet.startsWith('<html')) {
                const htmlText = buffer.toString('utf8');
                if (htmlText.includes('Access Denied') || htmlText.includes('You need access') || htmlText.includes('Sign in')) {
                    return NextResponse.json({
                        error: 'The Google Drive or Cloud file is private. Please update access permissions to "Anyone with the link can view", or upload the file directly.'
                    }, { status: 422 });
                }
                return NextResponse.json({
                    error: 'The cloud link returned a web page instead of a document file. Please ensure it is a public link to a PDF, DOCX, or TXT file, or upload the file directly.'
                }, { status: 422 });
            }
        } else {
            const formData = await request.formData();
            const file = formData.get('file') as File;

            if (!file) {
                return NextResponse.json({ error: 'No file provided' }, { status: 400 });
            }

            fileName = file.name;
            buffer = Buffer.from(await file.arrayBuffer());
        }

        let rawText = '';
        const lowerName = fileName.toLowerCase();
        const isPdf = buffer.slice(0, 5).toString('ascii') === '%PDF-';
        const isDocx = buffer.slice(0, 4).toString('hex') === '504b0304';
        const isPng = buffer.slice(0, 8).toString('hex') === '89504e470d0a1a0a';
        const isJpg = buffer.slice(0, 3).toString('hex') === 'ffd8ff';
        const isWebp = buffer.slice(0, 4).toString('ascii') === 'RIFF' && buffer.slice(8, 12).toString('ascii') === 'WEBP';

        if (lowerName.endsWith('.doc')) {
            return NextResponse.json({
                error: 'Legacy .doc Word files are not supported. Please convert your resume to PDF or .docx format and try again.'
            }, { status: 400 });
        }

        // Direct image formats
        if (isPng || isJpg || isWebp || lowerName.endsWith('.png') || lowerName.endsWith('.jpg') || lowerName.endsWith('.jpeg') || lowerName.endsWith('.webp')) {
            const mime = isPng || lowerName.endsWith('.png') ? 'image/png' : isWebp || lowerName.endsWith('.webp') ? 'image/webp' : 'image/jpeg';
            const extractedMarkdown = await extractResumeMultimodal(buffer, mime, userId);
            if (extractedMarkdown) {
                return NextResponse.json({ markdown: extractedMarkdown });
            }
            return NextResponse.json({
                error: 'Could not extract readable text from the uploaded image. Please ensure the image is clear and legible, or upload a PDF or .docx file.'
            }, { status: 422 });
        }

        // DOCX format
        if (isDocx || lowerName.endsWith('.docx') || contentType.includes('wordprocessingml')) {
            try {
                const result = await mammoth.extractRawText({ buffer });
                rawText = result.value || '';
            } catch (err: any) {
                console.warn('DOCX raw text extraction failed:', err.message);
            }
        } 
        // PDF format
        else if (isPdf || lowerName.endsWith('.pdf')) {
            try {
                const pdfData = await pdfParse(buffer);
                rawText = pdfData.text || '';
            } catch (err: any) {
                console.warn('Standard PDF raw text extraction failed:', err.message);
            }
        } 
        // Text/Markdown format
        else if (lowerName.endsWith('.txt') || lowerName.endsWith('.md')) {
            rawText = buffer.toString('utf8');
        } 
        // Unknown format fallback
        else {
            try {
                const pdfData = await pdfParse(buffer);
                rawText = pdfData.text || '';
            } catch {
                try {
                    const result = await mammoth.extractRawText({ buffer });
                    rawText = result.value || '';
                } catch {
                    rawText = buffer.toString('utf8');
                }
            }
        }

        // If text was extracted via standard parser, format it into clean Markdown
        if (rawText && rawText.trim().length >= 40) {
            const formattedMarkdown = await formatResumeTextToMarkdown(rawText, userId);
            return NextResponse.json({ markdown: formattedMarkdown });
        }

        // If standard text extraction yielded empty/sparse text (e.g. image-based/canvas PDF generated by html2pdf or scanner)
        if (isPdf || lowerName.endsWith('.pdf')) {
            console.log('PDF contained minimal raw text, falling back to multimodal document extraction...');
            const multimodalMarkdown = await extractResumeMultimodal(buffer, 'application/pdf', userId);
            if (multimodalMarkdown && multimodalMarkdown.trim().length > 30) {
                return NextResponse.json({ markdown: multimodalMarkdown });
            }
        }

        return NextResponse.json({
            error: 'Could not extract readable text from the file. Please ensure the document is not password-protected or empty, or try uploading a .docx or text resume.'
        }, { status: 422 });

    } catch (e: any) {
        console.error('Failed to parse resume:', e);
        return NextResponse.json({ error: e.message || 'Failed to parse file' }, { status: 500 });
    }
}
