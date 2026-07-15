import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { headers } from 'next/headers';
import { calculateResumeSimilarity } from '@/lib/similarity';

export async function POST(request: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        const userId = session.user.id;
        const isPro = (session.user as any).planTier === 'PRO';

        const { jobId } = await request.json();

        const headerStore = await headers();
        const forwardedFor = headerStore.get('x-forwarded-for');
        const ipAddress = forwardedFor ? forwardedFor.split(',')[0] : 'unknown';

        if (!isPro) {
            const sevenDaysAgo = new Date();
            sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
            
            let appliesThisWeek = await prisma.userJob.count({
                where: {
                    userId,
                    appliedAt: { gte: sevenDaysAgo }
                }
            });

            if (ipAddress !== 'unknown') {
                const otherUsersOnIp = await prisma.userJob.findMany({
                    where: {
                        ipAddress,
                        appliedAt: { gte: sevenDaysAgo },
                        userId: { not: userId }
                    },
                    select: { userId: true },
                    distinct: ['userId']
                });

                if (otherUsersOnIp.length > 0) {
                    const currentUserPrefs = await prisma.userPreferences.findUnique({
                        where: { userId },
                        select: { resumeMarkdown: true }
                    });
                    
                    for (const { userId: otherUserId } of otherUsersOnIp) {
                        const otherPrefs = await prisma.userPreferences.findUnique({
                            where: { userId: otherUserId },
                            select: { resumeMarkdown: true }
                        });
                        const similarity = calculateResumeSimilarity(currentUserPrefs?.resumeMarkdown, otherPrefs?.resumeMarkdown);
                        if (similarity > 0.8) {
                            const aliasApplies = await prisma.userJob.count({
                                where: {
                                    userId: otherUserId,
                                    appliedAt: { gte: sevenDaysAgo }
                                }
                            });
                            appliesThisWeek += aliasApplies;
                        }
                    }
                }
            }

            if (appliesThisWeek >= 3) {
                return NextResponse.json({ error: 'Upgrade for unlimited smart applies' }, { status: 403 });
            }
        }

        if (!jobId) {
            return NextResponse.json({ error: 'jobId is required' }, { status: 400 });
        }

        // Fetch job and assets for the current user
        const job = await prisma.job.findUnique({
            where: { id: jobId },
            include: { 
                applicationAssets: {
                    where: { userId }
                } 
            }
        });

        if (!job) {
            return NextResponse.json({ error: 'Job not found' }, { status: 404 });
        }

        let assets = job.applicationAssets?.[0];
        if (!assets) {
            console.log(`Assets missing for job ${jobId} and user ${userId}. Generating on the fly...`);
            const { generateAssetsForJob } = require('@/lib/generator');
            assets = await generateAssetsForJob(userId, job.id, job.title, job.description || '', job.company);
        }

        return NextResponse.json({ 
            success: true, 
            coverLetter: assets.coverLetterMarkdown
        }, { status: 200 });

    } catch (error: any) {
        console.error('Autofill API Error:', error);
        return NextResponse.json({ error: error.message || 'An error occurred fetching assets.' }, { status: 500 });
    }
}
