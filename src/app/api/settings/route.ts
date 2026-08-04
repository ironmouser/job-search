import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { encrypt } from '@/lib/encryption';
import { ensureKeywordColumnsExist, ALL_PRO_SOURCES } from '@/lib/settings';
import { logSuspiciousActivity } from '@/lib/security';

export const dynamic = 'force-dynamic';

export const DEFAULT_FREE_SOURCES: Record<string, boolean> = {
    indeed: true,
    glassdoor: true,
    ziprecruiter: true,
    weworkremotely: true,
    remoteco: true,
    remoteok: true,
    workingnomads: true,
    remotive: true,
    remotepoc: true,
    arbeitnow: true,
    ycombinator: true,
};

export async function GET() {
    try {
        await ensureKeywordColumnsExist();
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
          return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        
        const prefs = await prisma.userPreferences.findUnique({
            where: { userId: session.user.id }
        });
        
        const globalSettings = await prisma.globalSettings.findUnique({
            where: { id: 'system' }
        });

        const defaultSources = {
            ...DEFAULT_FREE_SOURCES,
            linkedin: false,
            greenhouse: false,
            lever: false,
            ashby: false,
            workable: false,
            smartrecruiters: false,
            breezy: false,
            himalayas: false,
            otta: false,
            jobspresso: false,
            justremote: false,
            themuse: false,
            arbeitsagentur: false,
            computrabajo: false,
            jobbank: false,
        };

        const resolvedSources = prefs?.sources
            ? { ...DEFAULT_FREE_SOURCES, ...(prefs.sources as Record<string, boolean>) }
            : defaultSources;

        if (!prefs) {
            return NextResponse.json({
                searchKeyword: '',
                jobLevel: 'Mid-level',
                searchLocation: '',
                includeKeywords: '',
                excludeKeywords: '',
                remoteOnly: false,
                noInternational: false,
                theme: 'light',
                aiStrictness: 'Standard',
                resumeCustomizationMaxPercentage: 50,
                customCareerPages: [],
                sources: resolvedSources,
                profile: '',
                resumeMarkdown: '',
                emailAddress: '',
                emailAppPassword: '',
                imapHost: 'imap.gmail.com',
                imapPort: 993,
                resumePdfTemplate: 'classic',
                resumePdfFontFamily: 'Helvetica, Arial, sans-serif',
                resumePdfFontSize: '11pt',
                resumePdfLineHeight: '1.5',
                resumePdfPrimaryColor: '#1e3a8a',
                resumePdfTextColor: '#111827',
                resumePdfMargin: '0.5in',
                resumePdfHeaderLayout: 'left',
                coverLetterPdfTemplate: 'classic',
                coverLetterPdfFontFamily: 'Helvetica, Arial, sans-serif',
                coverLetterPdfFontSize: '11pt',
                coverLetterPdfLineHeight: '1.5',
                coverLetterPdfPrimaryColor: '#1e3a8a',
                coverLetterPdfTextColor: '#111827',
                coverLetterPdfMargin: '0.5in',
                coverLetterPdfHeaderLayout: 'left',
                globalSettings
            });
        }

        return NextResponse.json({
            searchKeyword: prefs.searchKeyword,
            jobLevel: (prefs as any).jobLevel || 'Mid-level',
            searchLocation: prefs.searchLocation,
            includeKeywords: (prefs as any).includeKeywords || '',
            excludeKeywords: (prefs as any).excludeKeywords || '',
            remoteOnly: prefs.remoteOnly,
            noInternational: (prefs as any).noInternational || false,
            theme: prefs.theme,
            aiStrictness: prefs.aiStrictness,
            usWorkAuthorization: (prefs as any).usWorkAuthorization || '',
            workingRemotelyFrom: (prefs as any).workingRemotelyFrom || '',
            visaSponsorship: (prefs as any).visaSponsorship || '',
            country: (prefs as any).country || '',
            eeocRace: (prefs as any).eeocRace || '',
            eeocGender: (prefs as any).eeocGender || '',
            eeocVeteran: (prefs as any).eeocVeteran || '',
            eeocDisability: (prefs as any).eeocDisability || '',
            skipSelfId: (prefs as any).skipSelfId ?? false,
            phone: (prefs as any).phone || '',
            location: (prefs as any).location || '',
            linkedinUrl: (prefs as any).linkedinUrl || '',
            githubUrl: (prefs as any).githubUrl || '',
            websiteUrl: (prefs as any).websiteUrl || '',
            resumeCustomizationMaxPercentage: prefs.resumeCustomizationMaxPercentage,
            customCareerPages: prefs.customCareerPages,
            sources: resolvedSources,
            profile: prefs.profile || '',
            resumeMarkdown: prefs.resumeMarkdown || '',
            emailAddress: prefs.emailAddress || '',
            emailAppPassword: prefs.emailAppPassword ? '********' : '',
            imapHost: prefs.imapHost || 'imap.gmail.com',
            imapPort: prefs.imapPort || 993,
            resumePdfTemplate: (prefs as any).resumePdfTemplate || 'classic',
            resumePdfFontFamily: (prefs as any).resumePdfFontFamily || 'Helvetica, Arial, sans-serif',
            resumePdfFontSize: (prefs as any).resumePdfFontSize || '11pt',
            resumePdfLineHeight: (prefs as any).resumePdfLineHeight || '1.5',
            resumePdfPrimaryColor: (prefs as any).resumePdfPrimaryColor || '#1e3a8a',
            resumePdfTextColor: (prefs as any).resumePdfTextColor || '#111827',
            resumePdfMargin: (prefs as any).resumePdfMargin || '0.5in',
            resumePdfHeaderLayout: (prefs as any).resumePdfHeaderLayout || 'left',
            coverLetterPdfTemplate: (prefs as any).coverLetterPdfTemplate || 'classic',
            coverLetterPdfFontFamily: (prefs as any).coverLetterPdfFontFamily || 'Helvetica, Arial, sans-serif',
            coverLetterPdfFontSize: (prefs as any).coverLetterPdfFontSize || '11pt',
            coverLetterPdfLineHeight: (prefs as any).coverLetterPdfLineHeight || '1.5',
            coverLetterPdfPrimaryColor: (prefs as any).coverLetterPdfPrimaryColor || '#1e3a8a',
            coverLetterPdfTextColor: (prefs as any).coverLetterPdfTextColor || '#111827',
            coverLetterPdfMargin: (prefs as any).coverLetterPdfMargin || '0.5in',
            coverLetterPdfHeaderLayout: (prefs as any).coverLetterPdfHeaderLayout || 'left',
            globalSettings
        });
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        await ensureKeywordColumnsExist();
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
          return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const data = await request.json();
        
        // Basic Input Validation for length bounds
        const MAX_KEYWORD_LENGTH = 200;
        const MAX_PROFILE_LENGTH = 10000;
        const MAX_RESUME_LENGTH = 50000;
        
        if (data.searchKeyword && typeof data.searchKeyword === 'string' && data.searchKeyword.length > MAX_KEYWORD_LENGTH) {
             await logSuspiciousActivity({ type: 'PAYLOAD_TOO_LARGE', message: 'Search keyword exceeds max length', userId: session.user.id, metadata: { length: data.searchKeyword.length } });
             return NextResponse.json({ error: 'Search keyword is too long.' }, { status: 400 });
        }
        if (data.searchLocation && typeof data.searchLocation === 'string' && data.searchLocation.length > MAX_KEYWORD_LENGTH) {
             await logSuspiciousActivity({ type: 'PAYLOAD_TOO_LARGE', message: 'Search location exceeds max length', userId: session.user.id, metadata: { length: data.searchLocation.length } });
             return NextResponse.json({ error: 'Search location is too long.' }, { status: 400 });
        }
        if (data.profile && typeof data.profile === 'string' && data.profile.length > MAX_PROFILE_LENGTH) {
             await logSuspiciousActivity({ type: 'PAYLOAD_TOO_LARGE', message: 'Profile exceeds max length', userId: session.user.id, metadata: { length: data.profile.length } });
             return NextResponse.json({ error: 'Profile is too long.' }, { status: 400 });
        }
        if (data.resumeMarkdown && typeof data.resumeMarkdown === 'string' && data.resumeMarkdown.length > MAX_RESUME_LENGTH) {
             await logSuspiciousActivity({ type: 'PAYLOAD_TOO_LARGE', message: 'Resume exceeds max length', userId: session.user.id, metadata: { length: data.resumeMarkdown.length } });
             return NextResponse.json({ error: 'Resume markdown is too long.' }, { status: 400 });
        }

        const isPro = (session.user as any).planTier === 'PRO';

        // Strip Pro-only fields for free users
        if (!isPro) {
            data.customCareerPages = [];
            if (data.sources) {
                for (const src of ALL_PRO_SOURCES) {
                    data.sources[src] = false;
                }
            }
        }


        let updateData: any = {
            searchKeyword: data.searchKeyword,
            jobLevel: data.jobLevel || 'Mid-level',
            searchLocation: data.searchLocation,
            includeKeywords: data.includeKeywords,
            excludeKeywords: data.excludeKeywords,
            remoteOnly: data.remoteOnly,
            noInternational: data.noInternational || false,
            theme: data.theme,
            aiStrictness: data.aiStrictness,
            usWorkAuthorization: data.usWorkAuthorization,
            workingRemotelyFrom: data.workingRemotelyFrom,
            visaSponsorship: data.visaSponsorship,
            country: data.country,
            eeocRace: data.eeocRace,
            eeocGender: data.eeocGender,
            eeocVeteran: data.eeocVeteran,
            eeocDisability: data.eeocDisability,
            skipSelfId: data.skipSelfId ?? false,
            phone: data.phone,
            location: data.location,
            linkedinUrl: data.linkedinUrl,
            githubUrl: data.githubUrl,
            websiteUrl: data.websiteUrl,
            resumeCustomizationMaxPercentage: data.resumeCustomizationMaxPercentage,
            customCareerPages: data.customCareerPages,
            sources: data.sources,
            profile: data.profile,
            resumeMarkdown: data.resumeMarkdown,
            emailAddress: data.emailAddress,
            imapHost: data.imapHost,
            imapPort: data.imapPort,
            resumePdfTemplate: data.resumePdfTemplate,
            resumePdfFontFamily: data.resumePdfFontFamily,
            resumePdfFontSize: data.resumePdfFontSize,
            resumePdfLineHeight: data.resumePdfLineHeight,
            resumePdfPrimaryColor: data.resumePdfPrimaryColor,
            resumePdfTextColor: data.resumePdfTextColor,
            resumePdfMargin: data.resumePdfMargin,
            resumePdfHeaderLayout: data.resumePdfHeaderLayout,
            coverLetterPdfTemplate: data.coverLetterPdfTemplate,
            coverLetterPdfFontFamily: data.coverLetterPdfFontFamily,
            coverLetterPdfFontSize: data.coverLetterPdfFontSize,
            coverLetterPdfLineHeight: data.coverLetterPdfLineHeight,
            coverLetterPdfPrimaryColor: data.coverLetterPdfPrimaryColor,
            coverLetterPdfTextColor: data.coverLetterPdfTextColor,
            coverLetterPdfMargin: data.coverLetterPdfMargin,
            coverLetterPdfHeaderLayout: data.coverLetterPdfHeaderLayout,
        };

        if (data.emailAppPassword && data.emailAppPassword !== '********') {
            updateData.emailAppPassword = encrypt(data.emailAppPassword);
        }

        const prefs = await prisma.userPreferences.upsert({
            where: { userId: session.user.id },
            update: updateData,
            create: {
                userId: session.user.id,
                searchKeyword: data.searchKeyword || '',
                jobLevel: data.jobLevel || 'Mid-level',
                searchLocation: data.searchLocation || '',
                includeKeywords: data.includeKeywords || '',
                excludeKeywords: data.excludeKeywords || '',
                remoteOnly: data.remoteOnly || false,
                noInternational: data.noInternational || false,
                theme: data.theme || 'light',
                aiStrictness: data.aiStrictness || 'Standard',
                usWorkAuthorization: data.usWorkAuthorization || '',
                workingRemotelyFrom: data.workingRemotelyFrom || '',
                visaSponsorship: data.visaSponsorship || '',
                country: data.country || '',
                eeocRace: data.eeocRace || '',
                eeocGender: data.eeocGender || '',
                eeocVeteran: data.eeocVeteran || '',
                eeocDisability: data.eeocDisability || '',
                skipSelfId: data.skipSelfId ?? false,
                resumeCustomizationMaxPercentage: data.resumeCustomizationMaxPercentage || 50,
                customCareerPages: data.customCareerPages || [],
                sources: data.sources || { ...DEFAULT_FREE_SOURCES, linkedin: false, greenhouse: false, lever: false, ashby: false },
                profile: data.profile || '',
                resumeMarkdown: data.resumeMarkdown || '',
                emailAddress: data.emailAddress || '',
                ...(data.emailAppPassword && data.emailAppPassword !== '********' ? { emailAppPassword: encrypt(data.emailAppPassword) } : {}),
                imapHost: data.imapHost || 'imap.gmail.com',
                imapPort: data.imapPort || 993,
                resumePdfTemplate: data.resumePdfTemplate || 'classic',
                resumePdfFontFamily: data.resumePdfFontFamily || 'Helvetica, Arial, sans-serif',
                resumePdfFontSize: data.resumePdfFontSize || '11pt',
                resumePdfLineHeight: data.resumePdfLineHeight || '1.5',
                resumePdfPrimaryColor: data.resumePdfPrimaryColor || '#1e3a8a',
                resumePdfTextColor: data.resumePdfTextColor || '#111827',
                resumePdfMargin: data.resumePdfMargin || '0.5in',
                resumePdfHeaderLayout: data.resumePdfHeaderLayout || 'left',
                coverLetterPdfTemplate: data.coverLetterPdfTemplate || 'classic',
                coverLetterPdfFontFamily: data.coverLetterPdfFontFamily || 'Helvetica, Arial, sans-serif',
                coverLetterPdfFontSize: data.coverLetterPdfFontSize || '11pt',
                coverLetterPdfLineHeight: data.coverLetterPdfLineHeight || '1.5',
                coverLetterPdfPrimaryColor: data.coverLetterPdfPrimaryColor || '#1e3a8a',
                coverLetterPdfTextColor: data.coverLetterPdfTextColor || '#111827',
                coverLetterPdfMargin: data.coverLetterPdfMargin || '0.5in',
                coverLetterPdfHeaderLayout: data.coverLetterPdfHeaderLayout || 'left',
            } as any
        });

        return NextResponse.json({ success: true, prefs });
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
