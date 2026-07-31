import { NextResponse } from 'next/server';
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import mammoth from 'mammoth';
import pdfParse from 'pdf-parse/lib/pdf-parse.js';
import { callDeepSeek } from '@/lib/deepseek';

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

        if (lowerName.endsWith('.doc')) {
            return NextResponse.json({
                error: 'Legacy .doc Word files are not supported. Please convert your resume to PDF or .docx format and try again.'
            }, { status: 400 });
        } else if (isDocx || lowerName.endsWith('.docx') || contentType.includes('wordprocessingml')) {
            try {
                const result = await mammoth.extractRawText({ buffer });
                rawText = result.value || '';
            } catch (err: any) {
                console.warn('DOCX raw text extraction failed:', err.message);
            }
        } else if (isPdf || lowerName.endsWith('.pdf')) {
            try {
                const pdfData = await pdfParse(buffer);
                rawText = pdfData.text || '';
            } catch (err: any) {
                console.warn('PDF raw text extraction failed:', err.message);
            }
        } else if (lowerName.endsWith('.txt') || lowerName.endsWith('.md')) {
            rawText = buffer.toString('utf8');
        } else {
            // Attempt PDF parse then mammoth fallback
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

        if (!rawText.trim()) {
            return NextResponse.json({ error: 'Could not extract text from the file. Please try uploading a clean PDF or .docx resume.' }, { status: 422 });
        }

        const prompt = `You are an expert resume parser. I am providing you with text extracted from a candidate's resume.
Your job is to cleanly format this resume into pristine Markdown. 
Preserve all the original information, experience, dates, and skills, but structure it beautifully using Markdown headers (##, ###), bullet points, and bold text. 
Do NOT use em-dashes ("—" or "--"). Do NOT add any conversational filler. Just return the markdown resume.

RAW RESUME TEXT:
${rawText}`;

        let cleanMarkdown = await callDeepSeek({
            model: 'deepseek-v4-flash',
            messages: [{ role: 'user', content: prompt }],
            userId
        });

        // Clean markdown code blocks if wrapped
        if (cleanMarkdown.startsWith('```')) {
            cleanMarkdown = cleanMarkdown.replace(/^```[a-zA-Z]*\n/, '').replace(/\n```$/, '');
        }

        return NextResponse.json({ markdown: cleanMarkdown.trim() });
    } catch (e: any) {
        console.error('Failed to parse resume:', e);
        return NextResponse.json({ error: e.message || 'Failed to parse file' }, { status: 500 });
    }
}
