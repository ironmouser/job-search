import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";

export async function POST(request: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
          return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        
        const data = await request.json();
        
        // Ensure sources format
        const sources = data.sources || { indeed: true, linkedin: true, greenhouse: true, lever: true, ashby: true, glassdoor: true, ziprecruiter: true, monster: true, wellfound: true, workable: true, smartrecruiters: true, breezy: true, remoteco: true, remoteok: true, workingnomads: true, remotive: true, remotepoc: true };

        // 1. Create or Update User Preferences
        await prisma.userPreferences.upsert({
            where: { userId: session.user.id },
            update: {
                searchKeyword: data.searchKeyword,
                searchLocation: data.searchLocation,
                remoteOnly: data.remoteOnly,
                resumeMarkdown: data.resumeMarkdown,
                profile: data.profile,
                sources: sources
            },
            create: {
                userId: session.user.id,
                searchKeyword: data.searchKeyword || '',
                searchLocation: data.searchLocation || '',
                remoteOnly: data.remoteOnly || false,
                theme: 'light',
                resumeMarkdown: data.resumeMarkdown || '',
                profile: data.profile || '',
                sources: sources
            }
        });

        // 2. Mark User as onboarded
        await prisma.user.update({
            where: { id: session.user.id },
            data: { isOnboarded: true }
        });

        return NextResponse.json({ success: true });
    } catch (e: any) {
        console.error("Onboarding Error:", e);
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
