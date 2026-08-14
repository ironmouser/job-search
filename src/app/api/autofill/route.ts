import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { headers } from 'next/headers';
import { calculateResumeSimilarity } from '@/lib/similarity';
import { getEffectiveTier } from '@/lib/tier';


export async function POST(request: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        const userId = session.user.id;
        const userRecord = await prisma.user.findUnique({
            where: { id: userId },
            select: { planTier: true, trialEndsAt: true, subscriptionType: true, orgAccessExpiresAt: true }
        });
        const isPro = userRecord ? getEffectiveTier(userRecord) === 'PRO' : false;


        const { jobId } = await request.json();

        const headerStore = await headers();
        const forwardedFor = headerStore.get('x-forwarded-for');
        const ipAddress = forwardedFor ? forwardedFor.split(',')[0] : 'unknown';

        if (!isPro) {
            return NextResponse.json({ 
                error: 'Smart Apply requires a Pro account. Upgrade to Pro to unlock Smart Applies.', 
                code: 'LIMIT_REACHED' 
            }, { status: 403 });
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
