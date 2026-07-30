import { NextResponse } from 'next/server';
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import mammoth from 'mammoth';
import pdfParse from 'pdf-parse/lib/pdf-parse.js';
import { callDeepSeek } from '@/lib/deepseek';

function normalizeCloudUrl(url: string, accessToken?: string): { fetchUrl: string; headers?: Record<string, string> } {
    let fetchUrl = url;
    const headers: Record<string, string> = {};

    if (accessToken) {
        headers['Authorization'] = `Bearer ${accessToken}`;
    }

    // Google Drive share links
    if (url.includes('drive.google.com')) {
        const fileIdMatch = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/) || url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
        if (fileIdMatch && fileIdMatch[1]) {
            const fileId = fileIdMatch[1];
            if (accessToken) {
                fetchUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
            } else {
                fetchUrl = `https://drive.google.com/uc?export=download&id=${fileId}`;
            }
        }
    }
    // Dropbox share links
    else if (url.includes('dropbox.com')) {
        fetchUrl = url.replace('www.dropbox.com', 'dl.dropboxusercontent.com').replace('?dl=0', '?dl=1');
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

            const res = await fetch(fetchUrl, { headers });
            if (!res.ok) {
                return NextResponse.json({ error: `Failed to download file from cloud storage (${res.status})` }, { status: 400 });
            }

            const arrayBuffer = await res.arrayBuffer();
            buffer = Buffer.from(arrayBuffer);
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

        if (fileName.toLowerCase().endsWith('.docx') || contentType.includes('wordprocessingml')) {
            try {
                const result = await mammoth.extractRawText({ buffer });
                rawText = result.value || '';
            } catch (err: any) {
                console.warn('DOCX raw text extraction failed:', err.message);
                rawText = buffer.toString('utf8');
            }
        } else {
            try {
                const pdfData = await pdfParse(buffer);
                rawText = pdfData.text || '';
            } catch (err: any) {
                console.warn('PDF raw text extraction failed:', err.message);
                rawText = buffer.toString('utf8');
            }
        }

        if (!rawText.trim()) {
            return NextResponse.json({ error: 'Could not extract text from the file.' }, { status: 422 });
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
