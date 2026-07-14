import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

const SETTINGS_PATH = path.join(process.cwd(), 'src', 'lib', 'settings.json');

export async function GET() {
    try {
        const content = await fs.readFile(SETTINGS_PATH, 'utf-8');
        return NextResponse.json(JSON.parse(content));
    } catch (e: any) {
        // If file doesn't exist, return defaults (or empty object)
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        
        // Read existing to merge
        let existing = {};
        try {
            const content = await fs.readFile(SETTINGS_PATH, 'utf-8');
            existing = JSON.parse(content);
        } catch (err) {}

        const merged = { ...existing, ...body };
        await fs.writeFile(SETTINGS_PATH, JSON.stringify(merged, null, 2), 'utf-8');
        
        return NextResponse.json({ success: true, settings: merged });
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
