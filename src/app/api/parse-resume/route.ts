import { NextResponse } from 'next/server';
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import mammoth from 'mammoth';
import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

export async function POST(request: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const formData = await request.formData();
        const file = formData.get('file') as File;

        if (!file) {
            return NextResponse.json({ error: 'No file provided' }, { status: 400 });
        }

        const buffer = Buffer.from(await file.arrayBuffer());
        let cleanMarkdown = '';
        
        // Use gemini-3.1-flash-lite for fast and cost-effective text extraction
        const model = genAI.getGenerativeModel({ model: 'gemini-3.1-flash-lite' });

        if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
            const prompt = `You are an expert resume parser. I am providing you with a PDF file of a resume.
Your job is to cleanly format this resume into pristine Markdown. 
Preserve all the original information, but structure it beautifully using headers (##, ###), bullet points, and bold text. Do not add any conversational filler. Just return the markdown resume.`;
            
            const response = await model.generateContent([
                {
                    inlineData: {
                        data: buffer.toString('base64'),
                        mimeType: 'application/pdf'
                    }
                },
                prompt
            ]);
            cleanMarkdown = response.response.text();
        } else if (file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || file.name.endsWith('.docx')) {
            const result = await mammoth.extractRawText({ buffer });
            const rawText = result.value;

            const prompt = `You are an expert resume parser. I am providing you with the raw text extracted from a resume file. It may be messy, have weird line breaks, or contain artifacts.
Your job is to cleanly format this resume into pristine Markdown. 
Preserve all the original information, but structure it beautifully using headers (##, ###), bullet points, and bold text. Do not add any conversational filler. Just return the markdown resume.

RAW TEXT:
${rawText}`;

            const response = await model.generateContent(prompt);
            cleanMarkdown = response.response.text();
        } else {
            return NextResponse.json({ error: 'Unsupported file type. Please upload a PDF or DOCX file.' }, { status: 400 });
        }

        // Clean markdown can sometimes have block code ticks like ```markdown ... ```
        if (cleanMarkdown.startsWith('```')) {
            cleanMarkdown = cleanMarkdown.replace(/^```[a-zA-Z]*\n/, '').replace(/\n```$/, '');
        }

        return NextResponse.json({ markdown: cleanMarkdown.trim() });
    } catch (e: any) {
        console.error('Failed to parse resume:', e);
        return NextResponse.json({ error: e.message || 'Failed to parse file' }, { status: 500 });
    }
}
