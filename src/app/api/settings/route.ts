import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { encrypt } from '@/lib/encryption';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
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
                searchLocation: '',
                remoteOnly: false,
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
            searchLocation: prefs.searchLocation,
            remoteOnly: prefs.remoteOnly,
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
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
          return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const data = await request.json();
        const isPro = (session.user as any).planTier === 'PRO';
        const INTERNATIONAL_SOURCES = ['eures', 'computrabajo', 'bumeran', 'jobbank', 'workopolis', 'workana'];

        // Strip Pro-only fields for free users
        if (!isPro) {
            data.customCareerPages = [];
            if (data.sources) {
                for (const src of INTERNATIONAL_SOURCES) {
                    data.sources[src] = false;
                }
            }
        }


        let updateData: any = {
            searchKeyword: data.searchKeyword,
            searchLocation: data.searchLocation,
            remoteOnly: data.remoteOnly,
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
                searchLocation: data.searchLocation || '',
                remoteOnly: data.remoteOnly || false,
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
            }
        });

        return NextResponse.json({ success: true, prefs });
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
