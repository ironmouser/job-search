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

        // Validate required job title / keyword
        if (!data.searchKeyword || typeof data.searchKeyword !== 'string' || !data.searchKeyword.trim()) {
            return NextResponse.json({ error: 'Target job title is required.' }, { status: 400 });
        }

        const searchKeyword = data.searchKeyword.trim();
        
        // Ensure sources format
        const sources = data.sources || { indeed: true, glassdoor: true, ziprecruiter: true, dice: true, weworkremotely: true, remoteok: true, workingnomads: true, remotive: true, remotepoc: true, arbeitnow: false, linkedin: true, greenhouse: true, lever: true, ashby: true, nodesk: true, workable: true, smartrecruiters: true, breezy: true, otta: true, himalayas: true, jobicy: true, jobspresso: true, snagajob: true, usajobs: true, builtin: true, themuse: false, computrabajo: false, jobbank: false };

        // 1. Create or Update User Preferences
        const resumeText = (typeof data.resumeMarkdown === 'string' && data.resumeMarkdown.trim().length > 0)
            ? data.resumeMarkdown.trim()
            : '';

        const defaultProfile = `# Job Search Goal
Seeking high-growth tech opportunities as a ${searchKeyword}.

# Evaluation Criteria Weights
- Compensation: 20%
- Company Fit: 20%
- Remote Flexibility: 15%
- AI Maturity: 10%
- Leadership: 10%
- Growth: 10%
- Culture: 10%
- Tech Stack: 5%`;

        const finalProfile = (typeof data.profile === 'string' && data.profile.trim().length > 0)
            ? data.profile.trim()
            : defaultProfile;

        const updateData: any = {
            searchKeyword: searchKeyword,
            searchLocation: data.searchLocation || '',
            remoteOnly: Boolean(data.remoteOnly),
            profile: finalProfile,
            resumeMarkdown: resumeText,
            sources: sources
        };

        // 1. Ensure User record exists in DB first with active 7-day Pro Free Trial if new
        const existingUser = await prisma.user.findUnique({
            where: { id: session.user.id },
            select: { trialEndsAt: true, planTier: true }
        });

        if (!existingUser) {
            await prisma.user.create({
                data: {
                    id: session.user.id,
                    email: session.user.email || 'user@example.com',
                    name: session.user.name || 'User',
                    isOnboarded: true,
                    planTier: 'FREE',
                    trialEndsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
                }
            });
        } else {
            const updateFields: any = { isOnboarded: true };
            if (!existingUser.trialEndsAt && existingUser.planTier === 'FREE') {
                updateFields.trialEndsAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
            }
            await prisma.user.update({
                where: { id: session.user.id },
                data: updateFields
            });
        }

        // 2. Create or Update User Preferences
        await prisma.userPreferences.upsert({
            where: { userId: session.user.id },
            update: updateData,
            create: {
                userId: session.user.id,
                searchKeyword: searchKeyword,
                searchLocation: data.searchLocation || '',
                remoteOnly: Boolean(data.remoteOnly),
                theme: 'light',
                resumeMarkdown: resumeText,
                profile: finalProfile,
                sources: sources
            }
        });

        return NextResponse.json({ success: true });
    } catch (e: any) {
        console.error("Onboarding Error:", e);
        return NextResponse.json({ error: e.message || 'Failed to complete onboarding' }, { status: 500 });
    }
}
