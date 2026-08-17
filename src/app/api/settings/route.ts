import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { encrypt } from '@/lib/encryption';
import { ensureKeywordColumnsExist, ALL_PRO_SOURCES, DEFAULT_PRO_SOURCES } from '@/lib/settings';
import { getEffectiveTier } from '@/lib/tier';
import { logSuspiciousActivity } from '@/lib/security';
import { extractJobTitleFromProfileOrResume } from '@/lib/recovery';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        await ensureKeywordColumnsExist();
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
          return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        
        let prefs = await prisma.userPreferences.findUnique({
            where: { userId: session.user.id }
        });

        // Self-heal searchKeyword if it was wiped or missing but exists in profile
        if (prefs && (!prefs.searchKeyword || !prefs.searchKeyword.trim())) {
            const restored = extractJobTitleFromProfileOrResume(prefs.profile, prefs.resumeMarkdown);
            if (restored) {
                prefs.searchKeyword = restored;
                await prisma.userPreferences.update({
                    where: { id: prefs.id },
                    data: { searchKeyword: restored }
                }).catch(() => {});
            }
        }
        
        const globalSettings = await prisma.globalSettings.findUnique({
            where: { id: 'system' }
        });

        const dbUser = await prisma.user.findUnique({
            where: { id: session.user.id },
            select: { planTier: true, trialEndsAt: true, subscriptionType: true, orgAccessExpiresAt: true }
        });

        const isPro = dbUser ? getEffectiveTier(dbUser) === 'PRO' : getEffectiveTier(session.user as any) === 'PRO';

        let resolvedSources: Record<string, boolean> = { ...DEFAULT_PRO_SOURCES };

        if (prefs?.sources) {
            const userSources = prefs.sources as Record<string, boolean>;
            resolvedSources = { ...DEFAULT_PRO_SOURCES, ...userSources };

            if (isPro && !userSources.hasCustomizedProSources) {
                for (const [src, defaultVal] of Object.entries(DEFAULT_PRO_SOURCES)) {
                    if (defaultVal === true) {
                        resolvedSources[src] = true;
                    }
                }
            }
        }

        if (!prefs) {
            return NextResponse.json({
                searchKeyword: '',
                jobLevel: 'Mid-level',
                searchLocation: '',
                includeKeywords: '',
                excludeKeywords: '',
                remoteOnly: false,
                noInternational: false,
                hasSeenNonUsPrompt: false,
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
            hasSeenNonUsPrompt: (prefs as any).hasSeenNonUsPrompt || false,
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
            startDate: (prefs as any).startDate || '',
            expectedSalary: (prefs as any).expectedSalary || '',
            willingToTravel: (prefs as any).willingToTravel || '',
            isOver18: (prefs as any).isOver18 || '',
            willingToRelocate: (prefs as any).willingToRelocate || '',
            defaultAccountPassword: (prefs as any).defaultAccountPassword || '',
            phone: (prefs as any).phone || '',
            location: (prefs as any).location || '',
            streetAddress: (prefs as any).streetAddress || '',
            city: (prefs as any).city || ((prefs as any).location ? (prefs as any).location.split(',')[0]?.trim() : ''),
            state: (prefs as any).state || ((prefs as any).location ? (prefs as any).location.split(',')[1]?.trim() : ''),
            postalCode: (prefs as any).postalCode || '',
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

        const dbUser = await prisma.user.findUnique({
            where: { id: session.user.id },
            select: { planTier: true, trialEndsAt: true, subscriptionType: true, orgAccessExpiresAt: true }
        });

        const isPro = dbUser ? getEffectiveTier(dbUser) === 'PRO' : getEffectiveTier(session.user as any) === 'PRO';

        // Strip Pro-only fields for free users
        if (!isPro) {
            data.customCareerPages = [];
            if (data.sources) {
                for (const src of ALL_PRO_SOURCES) {
                    data.sources[src] = false;
                }
            }
        } else if (data.sources && typeof data.sources === 'object') {
            data.sources.hasCustomizedProSources = true;
        }


        let updateData: any = {
            jobLevel: data.jobLevel || 'Mid-level',
            searchLocation: data.searchLocation,
            includeKeywords: data.includeKeywords,
            excludeKeywords: data.excludeKeywords,
            remoteOnly: data.remoteOnly,
            noInternational: data.noInternational || false,
            hasSeenNonUsPrompt: data.hasSeenNonUsPrompt ?? undefined,
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
            startDate: data.startDate,
            expectedSalary: data.expectedSalary,
            willingToTravel: data.willingToTravel,
            isOver18: data.isOver18,
            willingToRelocate: data.willingToRelocate,
            defaultAccountPassword: data.defaultAccountPassword,
            phone: data.phone,
            location: data.location || ([data.city, data.state].filter(Boolean).join(', ') || undefined),
            streetAddress: data.streetAddress,
            city: data.city,
            state: data.state,
            postalCode: data.postalCode,
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

        // Only update searchKeyword if a valid non-empty string is provided
        // This prevents partial payload updates (ProfileForm, card widgets, modals) from wiping existing saved job titles
        if (typeof data.searchKeyword === 'string' && data.searchKeyword.trim().length > 0) {
            updateData.searchKeyword = data.searchKeyword.trim();
        }

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
                hasSeenNonUsPrompt: data.hasSeenNonUsPrompt || false,
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
                startDate: data.startDate || '',
                expectedSalary: data.expectedSalary || '',
                willingToTravel: data.willingToTravel || '',
                isOver18: data.isOver18 || '',
                phone: data.phone || '',
                location: data.location || ([data.city, data.state].filter(Boolean).join(', ') || ''),
                streetAddress: data.streetAddress || '',
                city: data.city || '',
                state: data.state || '',
                postalCode: data.postalCode || '',
                linkedinUrl: data.linkedinUrl || '',
                githubUrl: data.githubUrl || '',
                websiteUrl: data.websiteUrl || '',
                resumeCustomizationMaxPercentage: data.resumeCustomizationMaxPercentage || 50,
                customCareerPages: data.customCareerPages || [],
                sources: data.sources || DEFAULT_PRO_SOURCES,
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
