import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";

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

        if (!prefs) {
            return NextResponse.json({
                searchKeyword: '',
                searchLocation: '',
                remoteOnly: false,
                theme: 'light',
                aiStrictness: 'Standard',
                resumeCustomizationMaxPercentage: 50,
                customCareerPages: [],
                sources: { indeed: true, linkedin: false, greenhouse: true, lever: true, ashby: true, glassdoor: false, ziprecruiter: false, monster: false, wellfound: false },
                profile: '',
                resumeMarkdown: ''
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
            sources: prefs.sources || { indeed: true, linkedin: false, greenhouse: true, lever: true, ashby: true, glassdoor: false, ziprecruiter: false, monster: false, wellfound: false },
            profile: prefs.profile || '',
            resumeMarkdown: prefs.resumeMarkdown || ''
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
        
        const prefs = await prisma.userPreferences.upsert({
            where: { userId: session.user.id },
            update: {
                searchKeyword: data.searchKeyword,
                searchLocation: data.searchLocation,
                remoteOnly: data.remoteOnly,
                theme: data.theme,
                aiStrictness: data.aiStrictness,
                resumeCustomizationMaxPercentage: data.resumeCustomizationMaxPercentage,
                customCareerPages: data.customCareerPages,
                sources: data.sources,
                profile: data.profile,
                resumeMarkdown: data.resumeMarkdown
            },
            create: {
                userId: session.user.id,
                searchKeyword: data.searchKeyword || '',
                searchLocation: data.searchLocation || '',
                remoteOnly: data.remoteOnly || false,
                theme: data.theme || 'light',
                aiStrictness: data.aiStrictness || 'Standard',
                resumeCustomizationMaxPercentage: data.resumeCustomizationMaxPercentage || 50,
                customCareerPages: data.customCareerPages || [],
                sources: data.sources || { indeed: true, linkedin: false, greenhouse: true, lever: true, ashby: true, glassdoor: false, ziprecruiter: false, monster: false, wellfound: false },
                profile: data.profile || '',
                resumeMarkdown: data.resumeMarkdown || ''
            }
        });

        return NextResponse.json({ success: true, prefs });
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
