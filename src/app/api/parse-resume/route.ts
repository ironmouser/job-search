import { NextResponse } from 'next/server';
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import mammoth from 'mammoth';
import pdfParse from 'pdf-parse/lib/pdf-parse.js';
import { callDeepSeek } from '@/lib/deepseek';

export async function POST(request: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        const userId = session.user.id as string;

        const formData = await request.formData();
        const file = formData.get('file') as File;

        if (!file) {
            return NextResponse.json({ error: 'No file provided' }, { status: 400 });
        }

        const buffer = Buffer.from(await file.arrayBuffer());
        let rawText = '';

        if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
            try {
                const pdfData = await pdfParse(buffer);
                rawText = pdfData.text || '';
            } catch (err: any) {
                console.warn('PDF raw text extraction failed:', err.message);
                rawText = buffer.toString('utf8');
            }
        } else if (file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || file.name.endsWith('.docx')) {
            const result = await mammoth.extractRawText({ buffer });
            rawText = result.value || '';
        } else {
            return NextResponse.json({ error: 'Unsupported file type. Please upload a PDF or DOCX file.' }, { status: 400 });
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
            model: 'deepseek-chat',
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
