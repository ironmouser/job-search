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
        const userId = session.user.id;

        const { jobId } = await request.json();

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
