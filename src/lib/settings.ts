import { prisma } from './prisma';
import { UserPreferences } from '@prisma/client';

let columnsChecked = false;

export function hasUserUploadedResume(resumeMarkdown?: string | null): boolean {
    if (!resumeMarkdown) return false;
    const trimmed = resumeMarkdown.trim();
    return trimmed.length > 30 && !trimmed.startsWith('# Candidate Profile');
}

export async function ensureKeywordColumnsExist() {
    return;
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
                    hasSeenNonUsPrompt: row.has_seen_non_us_prompt || false,
                    theme: row.theme || 'light',
                    aiStrictness: row.ai_strictness || 'Standard',
                    resumeMarkdown: row.resume_markdown || '',
                    profile: row.profile || '',
                    resumePdfTemplate: row.resume_pdf_template || 'classic',
                    resumePdfFontFamily: row.resume_pdf_font_family || 'Helvetica, Arial, sans-serif',
                    resumePdfFontSize: row.resume_pdf_font_size || '11pt',
                    resumePdfLineHeight: row.resume_pdf_line_height || '1.5',
                    resumePdfPrimaryColor: row.resume_pdf_primary_color || '#1e3a8a',
                    resumePdfTextColor: row.resume_pdf_text_color || '#111827',
                    resumePdfMargin: row.resume_pdf_margin || '0.5in',
                    resumePdfHeaderLayout: row.resume_pdf_header_layout || 'left',
                    coverLetterPdfTemplate: row.cover_letter_pdf_template || 'classic',
                    coverLetterPdfFontFamily: row.cover_letter_pdf_font_family || 'Helvetica, Arial, sans-serif',
                    coverLetterPdfFontSize: row.cover_letter_pdf_font_size || '11pt',
                    coverLetterPdfLineHeight: row.cover_letter_pdf_line_height || '1.5',
                    coverLetterPdfPrimaryColor: row.cover_letter_pdf_primary_color || '#1e3a8a',
                    coverLetterPdfTextColor: row.cover_letter_pdf_text_color || '#111827',
                    coverLetterPdfMargin: row.cover_letter_pdf_margin || '0.5in',
                    coverLetterPdfHeaderLayout: row.cover_letter_pdf_header_layout || 'left',
                } as any;
            }
        } catch (rawErr: any) {
            console.error('Raw SQL fallback error:', rawErr?.message || rawErr);
        }
        return {};
    }
}

export const FREE_ALLOWED_SOURCES = [
    'greenhouse',
    'weworkremotely',
    'remotive',
    'nodesk',
    'himalayas',
    'jobicy',
    'jobspresso',
    'snagajob',
    'usajobs',
    'builtin'
];

export const PREMIUM_NON_INTL_SOURCES = [
    'indeed',
    'linkedin',
    'ziprecruiter',
    'dice',
    'remoteok',
    'workingnomads',
    'remotepoc',
    'otta',
    'lever',
    'ashby',
    'workable',
    'smartrecruiters',
    'breezy'
];

export const INTERNATIONAL_SOURCES = [
    'themuse',
    'computrabajo',
    'jobbank',
    'arbeitnow'
];

export const ALL_PRO_SOURCES = [
    ...PREMIUM_NON_INTL_SOURCES,
    ...INTERNATIONAL_SOURCES
];

export const DEFAULT_PRO_SOURCES: Record<string, boolean> = {
    greenhouse: true,
    linkedin: true,
    indeed: true,
    ziprecruiter: true,
    dice: true,
    weworkremotely: true,
    remoteok: true,
    workingnomads: true,
    remotive: true,
    remotepoc: true,
    nodesk: true,
    otta: true,
    lever: true,
    ashby: true,
    workable: true,
    smartrecruiters: true,
    breezy: true,
    himalayas: true,
    jobicy: true,
    jobspresso: true,
    snagajob: true,
    usajobs: true,
    builtin: true,
    themuse: false,
    computrabajo: false,
    jobbank: false,
    arbeitnow: false,
};

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

    const currentSources = (prefs?.sources as Record<string, boolean>) || { ...DEFAULT_PRO_SOURCES };

    // 3. Automatically enable non-international Pro sources
    const updatedSources = { ...currentSources };
    for (const src of PREMIUM_NON_INTL_SOURCES) {
        updatedSources[src] = true;
    }

    // 4. Preserve/default international sources to false unless explicitly customized
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


