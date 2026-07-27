import { prisma } from './prisma';
import { UserPreferences } from '@prisma/client';

let columnsChecked = false;

export async function ensureKeywordColumnsExist() {
    if (columnsChecked) return;
    try {
        await prisma.$executeRawUnsafe('ALTER TABLE "user_preferences" ADD COLUMN IF NOT EXISTS "include_keywords" TEXT');
        await prisma.$executeRawUnsafe('ALTER TABLE "user_preferences" ADD COLUMN IF NOT EXISTS "exclude_keywords" TEXT');
        await prisma.$executeRawUnsafe('ALTER TABLE "user_preferences" ADD COLUMN IF NOT EXISTS "job_level" TEXT DEFAULT \'Mid-level\'');
        columnsChecked = true;
    } catch (e: any) {
        console.warn('Auto-schema update warning:', e?.message || e);
    }
}

export async function getUserSettings(userId: string): Promise<any> {
    try {
        await ensureKeywordColumnsExist();
        const prefs = await prisma.userPreferences.findUnique({
            where: { userId }
        });
        if (!prefs) return {};
        return prefs;
    } catch (e: any) {
        console.warn('Prisma findUnique threw, attempting raw SQL query fallback:', e?.message || e);
        try {
            await ensureKeywordColumnsExist();
            const rawPrefsArray: any[] = await prisma.$queryRawUnsafe(
                `SELECT * FROM "user_preferences" WHERE "user_id" = $1 LIMIT 1`,
                userId
            );
            if (rawPrefsArray && rawPrefsArray.length > 0) {
                const row = rawPrefsArray[0];
                return {
                    id: row.id,
                    userId: row.user_id,
                    searchKeyword: row.search_keyword,
                    jobLevel: row.job_level || 'Mid-level',
                    searchLocation: row.search_location,
                    includeKeywords: row.include_keywords || '',
                    excludeKeywords: row.exclude_keywords || '',
                    customCareerPages: row.custom_career_pages || [],
                    sources: row.sources || {},
                    remoteOnly: row.remote_only || false,
                    theme: row.theme || 'light',
                    aiStrictness: row.ai_strictness || 'Standard',
                    resumeMarkdown: row.resume_markdown || '',
                    profile: row.profile || ''
                } as any;
            }
        } catch (rawErr: any) {
            console.error('Raw SQL fallback error:', rawErr?.message || rawErr);
        }
        return {};
    }
}


