import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";

export async function GET() {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        const prefs = await prisma.userPreferences.findUnique({
            where: { userId: session.user.id },
            select: {
                searchKeyword: true,
                searchLocation: true,
                remoteOnly: true,
                resumeMarkdown: true,
            }
        });
        return NextResponse.json({ success: true, preferences: prefs || null });
    } catch (e: any) {
        return NextResponse.json({ error: e.message || 'Failed to fetch preferences' }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
          return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        
        const data = await request.json();
        const isDraft = Boolean(data.isDraft);

        // Validate required job title / keyword for final submission
        if (!isDraft && (!data.searchKeyword || typeof data.searchKeyword !== 'string' || !data.searchKeyword.trim())) {
            return NextResponse.json({ error: 'Target job title is required.' }, { status: 400 });
        }

        const searchKeyword = (typeof data.searchKeyword === 'string') ? data.searchKeyword.trim() : '';
        
        // Ensure sources format
        const sources = data.sources || { indeed: true, glassdoor: true, ziprecruiter: true, dice: true, weworkremotely: true, remoteok: true, workingnomads: true, remotive: true, remotepoc: true, arbeitnow: false, linkedin: true, greenhouse: true, lever: true, ashby: true, nodesk: true, workable: true, smartrecruiters: true, breezy: true, otta: true, himalayas: true, jobicy: true, jobspresso: true, snagajob: true, usajobs: true, builtin: true, themuse: false, computrabajo: false, jobbank: false };

        // 1. Prepare profile & resume markdown
        const resumeText = (typeof data.resumeMarkdown === 'string' && data.resumeMarkdown.trim().length > 0)
            ? data.resumeMarkdown.trim()
            : '';

        const defaultProfile = searchKeyword ? `# Job Search Goal
Seeking high-growth tech opportunities as a ${searchKeyword}.

# Evaluation Criteria Weights
- Compensation: 20%
- Company Fit: 20%
- Remote Flexibility: 15%
- AI Maturity: 10%
- Leadership: 10%
- Growth: 10%
- Culture: 10%
- Tech Stack: 5%` : '';

        const finalProfile = (typeof data.profile === 'string' && data.profile.trim().length > 0)
            ? data.profile.trim()
            : defaultProfile;

        const updateData: any = {
            searchLocation: data.searchLocation || '',
            remoteOnly: Boolean(data.remoteOnly),
            sources: sources
        };
        if (searchKeyword) {
            updateData.searchKeyword = searchKeyword;
        }
        if (finalProfile) {
            updateData.profile = finalProfile;
        }
        if (resumeText || !isDraft) {
            updateData.resumeMarkdown = resumeText;
        }

        // 2. Ensure User record exists in DB
        const existingUser = await prisma.user.findUnique({
            where: { id: session.user.id },
            select: { trialEndsAt: true, planTier: true, isOnboarded: true }
        });

        if (!existingUser) {
            await prisma.user.create({
                data: {
                    id: session.user.id,
                    email: session.user.email || 'user@example.com',
                    name: session.user.name || 'User',
                    isOnboarded: !isDraft,
                    planTier: 'FREE',
                    trialEndsAt: !isDraft ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) : null,
                }
            });
        } else if (!isDraft) {
            const updateFields: any = { isOnboarded: true };
            if (!existingUser.trialEndsAt && existingUser.planTier === 'FREE') {
                updateFields.trialEndsAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
            }
            await prisma.user.update({
                where: { id: session.user.id },
                data: updateFields
            });
        }

        // 3. Create or Update User Preferences
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

        return NextResponse.json({ success: true, isDraft });
    } catch (e: any) {
        console.error("Onboarding Error:", e);
        return NextResponse.json({ error: e.message || 'Failed to complete onboarding' }, { status: 500 });
    }
}
