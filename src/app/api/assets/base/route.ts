import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

const BASE_RESUME_PATH = path.join(process.cwd(), 'src', 'lib', 'base_resume.md');

export async function GET() {
    try {
        const content = await fs.readFile(BASE_RESUME_PATH, 'utf-8');
        return NextResponse.json({ content });
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const { content } = await request.json();
        if (typeof content !== 'string') {
            return NextResponse.json({ error: 'Content must be a string' }, { status: 400 });
        }
        await fs.writeFile(BASE_RESUME_PATH, content, 'utf-8');
        return NextResponse.json({ success: true });
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
