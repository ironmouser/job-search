import { NextResponse } from 'next/server';
import { scoreJob } from '@/lib/scoring';
import { prisma } from '@/lib/prisma';
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";

export async function POST(request: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const { jobId } = body;

        // If no jobId is provided, score all unscored jobs
        if (!jobId) {
            const unscoredJobs = await prisma.job.findMany({
                where: { status: 'discovered' },
                select: { id: true, title: true, description: true }
            });

            if (!unscoredJobs || unscoredJobs.length === 0) {
                return NextResponse.json({ message: 'No unscored jobs found.' }, { status: 200 });
            }

            console.log(`Found ${unscoredJobs.length} unscored jobs. Scoring...`);
            
            const results = [];
            for (const job of unscoredJobs) {
                try {
                    const score = await scoreJob(session.user.id, job.id, job.title, job.description || '');
                    results.push({ jobId: job.id, score: score.total_score });
                } catch (e: any) {
                    console.error(`Error scoring job ${job.id}:`, e.message);
                    results.push({ jobId: job.id, error: e.message });
                }
            }

            return NextResponse.json({ 
                message: 'Batch scoring complete.', 
                results 
            }, { status: 200 });
        }

        // If jobId is provided, just score that one
        const job = await prisma.job.findUnique({
            where: { id: jobId },
            select: { id: true, title: true, description: true }
        });

        if (!job) {
            return NextResponse.json({ error: 'Job not found.' }, { status: 404 });
        }

        const score = await scoreJob(session.user.id, job.id, job.title, job.description || '');

        return NextResponse.json({ 
            message: 'Job scoring complete.', 
            score 
        }, { status: 200 });

    } catch (error: any) {
        console.error('Score API Error:', error);
        return NextResponse.json({ error: error.message || 'An error occurred during scoring.' }, { status: 500 });
    }
}
