import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { encrypt } from '@/lib/encryption';
import { ensureKeywordColumnsExist, ALL_PRO_SOURCES } from '@/lib/settings';

export const dynamic = 'force-dynamic';

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
                sources: { indeed: true, linkedin: false, greenhouse: true, lever: true, ashby: true, glassdoor: false, ziprecruiter: false, monster: false, wellfound: false, remotepoc: true },
                profile: '',
                resumeMarkdown: '',
                emailAddress: '',
                emailAppPassword: '',
                imapHost: 'imap.gmail.com',
                imapPort: 993,
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
            resumeCustomizationMaxPercentage: prefs.resumeCustomizationMaxPercentage,
            customCareerPages: prefs.customCareerPages,
            sources: prefs.sources || { indeed: true, linkedin: false, greenhouse: true, lever: true, ashby: true, glassdoor: false, ziprecruiter: false, monster: false, wellfound: false, remotepoc: true },
            profile: prefs.profile || '',
            resumeMarkdown: prefs.resumeMarkdown || '',
            emailAddress: prefs.emailAddress || '',
            emailAppPassword: prefs.emailAppPassword ? '********' : '',
            imapHost: prefs.imapHost || 'imap.gmail.com',
            imapPort: prefs.imapPort || 993,
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
            resumeCustomizationMaxPercentage: data.resumeCustomizationMaxPercentage,
            customCareerPages: data.customCareerPages,
            sources: data.sources,
            profile: data.profile,
            resumeMarkdown: data.resumeMarkdown,
            emailAddress: data.emailAddress,
            imapHost: data.imapHost,
            imapPort: data.imapPort
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
                resumeCustomizationMaxPercentage: data.resumeCustomizationMaxPercentage || 50,
                customCareerPages: data.customCareerPages || [],
                sources: data.sources || { indeed: true, linkedin: false, greenhouse: true, lever: true, ashby: true, glassdoor: false, ziprecruiter: false, monster: false, wellfound: false, remotepoc: true },
                profile: data.profile || '',
                resumeMarkdown: data.resumeMarkdown || '',
                emailAddress: data.emailAddress || '',
                ...(data.emailAppPassword && data.emailAppPassword !== '********' ? { emailAppPassword: encrypt(data.emailAppPassword) } : {}),
                imapHost: data.imapHost || 'imap.gmail.com',
                imapPort: data.imapPort || 993
            } as any
        });

        return NextResponse.json({ success: true, prefs });
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
