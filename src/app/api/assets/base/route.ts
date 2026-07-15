import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { promises as fs } from 'fs';
import path from 'path';

export async function GET() {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        
        const prefs = await prisma.userPreferences.findUnique({
            where: { userId: session.user.id }
        });

        let content = prefs?.resumeMarkdown || '';
        
        if (!content) {
            // Fallback to reading disk file if user has no resumeMarkdown stored
            const BASE_RESUME_PATH = path.join(process.cwd(), 'src', 'lib', 'base_resume.md');
            try {
                content = await fs.readFile(BASE_RESUME_PATH, 'utf-8');
            } catch (e) {
                // If the file doesn't exist, just use empty string
                content = '';
            }
        }
        
        return NextResponse.json({ content });
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        
        const { content } = await request.json();
        if (typeof content !== 'string') {
            return NextResponse.json({ error: 'Content must be a string' }, { status: 400 });
        }
        
        await prisma.userPreferences.upsert({
            where: { userId: session.user.id },
            update: {
                resumeMarkdown: content
            },
            create: {
                userId: session.user.id,
                resumeMarkdown: content
            }
        });
        
        return NextResponse.json({ success: true });
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
