import { NextResponse } from 'next/server';
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import mammoth from 'mammoth';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { checkAiSafeguard, logAiCost, estimateTokens } from '@/lib/ai-safeguard';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

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
        let cleanMarkdown = '';
        
        // Use gemini-2.0-flash-lite for fast and cost-effective text extraction
        const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-lite' });

        if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
            const prompt = `You are an expert resume parser. I am providing you with a PDF file of a resume.
Your job is to cleanly format this resume into pristine Markdown. 
Preserve all the original information, but structure it beautifully using headers (##, ###), bullet points, and bold text. Do not add any conversational filler. Just return the markdown resume.`;
            
            // Assume parsing a PDF uses ~2000 tokens
            const estimatedTokens = 2000;
            const estimatedCost = (estimatedTokens / 1_000_000) * 0.075 + (1000 / 1_000_000) * 0.30;
            await checkAiSafeguard(estimatedCost, 'gemini-2.0-flash-lite', userId);

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
            
            const usage = response.response.usageMetadata;
            if (usage) {
                await logAiCost('gemini-2.0-flash-lite', usage.promptTokenCount, usage.candidatesTokenCount, userId);
            }
        } else if (file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || file.name.endsWith('.docx')) {
            const result = await mammoth.extractRawText({ buffer });
            const rawText = result.value;

            const prompt = `You are an expert resume parser. I am providing you with the raw text extracted from a resume file. It may be messy, have weird line breaks, or contain artifacts.
Your job is to cleanly format this resume into pristine Markdown. 
Preserve all the original information, but structure it beautifully using headers (##, ###), bullet points, and bold text. Do not add any conversational filler. Just return the markdown resume.

RAW TEXT:
${rawText}`;

            const estimatedTokens = estimateTokens(prompt);
            const estimatedCost = (estimatedTokens / 1_000_000) * 0.075 + (1000 / 1_000_000) * 0.30;
            await checkAiSafeguard(estimatedCost, 'gemini-2.0-flash-lite', userId);

            const response = await model.generateContent(prompt);
            cleanMarkdown = response.response.text();
            
            const usage = response.response.usageMetadata;
            if (usage) {
                await logAiCost('gemini-2.0-flash-lite', usage.promptTokenCount, usage.candidatesTokenCount, userId);
            } else {
                await logAiCost('gemini-2.0-flash-lite', estimatedTokens, estimateTokens(cleanMarkdown), userId);
            }
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
