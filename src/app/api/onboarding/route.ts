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
        const sources = data.sources || { indeed: true, glassdoor: true, ziprecruiter: true, dice: false, weworkremotely: true, remoteok: true, workingnomads: true, remotive: true, remotepoc: true, arbeitnow: false, ycombinator: true, linkedin: true, greenhouse: true, lever: true, ashby: true, nodesk: true, workable: true, smartrecruiters: true, breezy: true, otta: true, themuse: false, computrabajo: false, jobbank: false };

        // 1. Create or Update User Preferences
        const resumeText = (typeof data.resumeMarkdown === 'string' && data.resumeMarkdown.trim().length > 0)
            ? data.resumeMarkdown
            : `# Candidate Profile\nTarget Role: ${data.searchKeyword || 'Professional'}\nLocation Preference: ${data.searchLocation || 'Remote'}\n\nSeeking opportunities as a ${data.searchKeyword || 'Professional'} with flexible remote or hybrid arrangements.`;

        const updateData: any = {
            searchKeyword: data.searchKeyword,
            searchLocation: data.searchLocation,
            remoteOnly: data.remoteOnly,
            profile: data.profile,
            resumeMarkdown: resumeText,
            sources: sources
        };

        await prisma.userPreferences.upsert({
            where: { userId: session.user.id },
            update: updateData,
            create: {
                userId: session.user.id,
                searchKeyword: data.searchKeyword || '',
                searchLocation: data.searchLocation || '',
                remoteOnly: data.remoteOnly || false,
                theme: 'light',
                resumeMarkdown: resumeText,
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
