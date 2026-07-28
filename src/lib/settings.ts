import { prisma } from './prisma';
import { UserPreferences } from '@prisma/client';

let columnsChecked = false;

export async function ensureKeywordColumnsExist() {
    if (columnsChecked) return;
    try {
        await prisma.$executeRawUnsafe('ALTER TABLE "user_preferences" ADD COLUMN IF NOT EXISTS "include_keywords" TEXT');
        await prisma.$executeRawUnsafe('ALTER TABLE "user_preferences" ADD COLUMN IF NOT EXISTS "exclude_keywords" TEXT');
        await prisma.$executeRawUnsafe('ALTER TABLE "user_preferences" ADD COLUMN IF NOT EXISTS "job_level" TEXT DEFAULT \'Mid-level\'');
        await prisma.$executeRawUnsafe('ALTER TABLE "user_preferences" ADD COLUMN IF NOT EXISTS "no_international" BOOLEAN DEFAULT false');
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
                    noInternational: row.no_international || false,
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

export const PREMIUM_NON_INTL_SOURCES = [
    'linkedin',
    'himalayas',
    'otta',
    'jobspresso',
    'justremote',
    'greenhouse',
    'lever',
    'ashby',
    'workable',
    'smartrecruiters',
    'breezy'
];

export const INTERNATIONAL_SOURCES = [
    'themuse',
    'arbeitsagentur',
    'computrabajo',
    'jobbank',
    'eures',
    'bumeran',
    'workopolis',
    'workana'
];

export const ALL_PRO_SOURCES = [
    ...PREMIUM_NON_INTL_SOURCES,
    ...INTERNATIONAL_SOURCES
];

export async function handleUserUpgradeToPro(userId: string) {
    await ensureKeywordColumnsExist();

    // 1. Update user planTier to PRO
    await prisma.user.update({
        where: { id: userId },
        data: { planTier: 'PRO' }
    });

    // 2. Fetch existing user preferences
    const prefs = await prisma.userPreferences.findUnique({
        where: { userId }
    });

    const currentSources = (prefs?.sources as Record<string, boolean>) || {
        indeed: true,
        glassdoor: false,
        ziprecruiter: false,
        weworkremotely: true,
        remoteco: true,
        remoteok: true,
        workingnomads: true,
        remotive: true,
        remotepoc: true,
        arbeitnow: true,
        ycombinator: true
    };

    // 3. Automatically enable all non-international premium sources
    const updatedSources = { ...currentSources };
    for (const src of PREMIUM_NON_INTL_SOURCES) {
        updatedSources[src] = true;
    }

    // 4. Preserve existing user choices for international sources (do not auto-enable)
    for (const src of INTERNATIONAL_SOURCES) {
        if (updatedSources[src] === undefined) {
            updatedSources[src] = false;
        }
    }

    // 5. Update database
    if (prefs) {
        await prisma.userPreferences.update({
            where: { userId },
            data: { sources: updatedSources }
        });
    } else {
        await prisma.userPreferences.create({
            data: {
                userId,
                sources: updatedSources,
                theme: 'light',
                jobLevel: 'Mid-level',
                aiStrictness: 'Standard',
                resumeCustomizationMaxPercentage: 50,
            } as any
        });
    }
}


