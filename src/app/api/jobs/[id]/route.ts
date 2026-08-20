import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { headers } from 'next/headers';
import { reformatJobDescriptionWithGemini } from '@/lib/formatter';
import { scoreJob } from '@/lib/scoring';
import { logSuspiciousActivity } from '@/lib/security';
import { isDescriptionAdequate, extractUrlFromStubDescription } from '@/lib/jobFetcher';

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
          return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        
        const userId = session.user.id;
        const { id } = await context.params;
        const { status, applied_at, applicationUrl, description } = await request.json();

        const job = await prisma.job.findUnique({
            where: { id }
        });
        if (!job) {
            return NextResponse.json({ error: 'Job not found' }, { status: 404 });
        }
        
        const isAdmin = (session.user as any).role === 'SYSTEM_ADMIN';
        const isGlobalJob = job.addedById === null;

        if (description) {
            // Allow modifying job description if user owns job, is admin, or it's a shared/global job stub
            const isOwnerOrAdmin = isAdmin || job.addedById === userId;

            if (!isOwnerOrAdmin && !isGlobalJob) {
                await logSuspiciousActivity({ type: 'UNAUTHORIZED_MODIFICATION_ATTEMPT', message: 'Attempted to modify a private job not owned by user', userId, metadata: { jobId: id, requestedChanges: { description: !!description, applicationUrl: !!applicationUrl } } });
                return NextResponse.json(
                    { error: 'Unauthorized to modify shared job properties. Only the original creator can edit this job.' },
                    { status: 403 }
                );
            }
        }

        const updateJobData: any = {};

        if (applicationUrl) {
            updateJobData.applicationUrl = applicationUrl.trim();
            updateJobData.consecutiveAutoFailures = 0;
        }

        if (description) {
            let formattedDesc = description;
            if (formattedDesc.length > 50 && !formattedDesc.includes('## ')) {
                try {
                    formattedDesc = await reformatJobDescriptionWithGemini(description);
                } catch (e) {
                    console.warn('Formatting job description failed:', e);
                }
            }

            // If applicationUrl wasn't explicitly provided, check if description has an embedded URL
            if (!updateJobData.applicationUrl) {
                const embeddedUrl = extractUrlFromStubDescription(description);
                if (embeddedUrl && !embeddedUrl.includes('ziprecruiter.com') && !embeddedUrl.includes('linkedin.com')) {
                    updateJobData.applicationUrl = embeddedUrl;
                }
            }

            updateJobData.description = formattedDesc;

            const targetJobId = id;
            const updatedJob = await prisma.job.update({
                where: { id },
                data: updateJobData
            });

            await prisma.userJob.upsert({
                where: { userId_jobId: { userId, jobId: id } },
                update: { status: 'discovered' },
                create: { userId, jobId: id, status: 'discovered' }
            });

            // Trigger scoring in background so PATCH responds immediately without timing out
            scoreJob(userId, targetJobId, updatedJob.title, formattedDesc).catch((scoreErr: any) => {
                console.error("Error scoring job in background:", scoreErr);
            });

            return NextResponse.json({ success: true, newJobId: targetJobId });
        }

        if (Object.keys(updateJobData).length > 0) {
            await prisma.job.update({
                where: { id },
                data: updateJobData
            });
        }

        if (status) {
            const updateData: any = { status: String(status).toLowerCase() };
            if (applied_at) {
                const headerStore = await headers();
                const forwardedFor = headerStore.get('x-forwarded-for');
                const ipAddress = forwardedFor ? forwardedFor.split(',')[0] : 'unknown';
                
                updateData.appliedAt = new Date(applied_at);
                updateData.ipAddress = ipAddress;
            }

            const data = await prisma.userJob.upsert({
                where: { userId_jobId: { userId, jobId: id } },
                update: updateData,
                create: {
                    userId,
                    jobId: id,
                    ...updateData
                }
            });

            return NextResponse.json(data);
        }

        return NextResponse.json({ success: true });
    } catch (e: any) {
        console.error('Failed to update job status:', e);
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        
        const userId = session.user.id;
        const { id } = await context.params;

        const data = await prisma.userJob.update({
            where: { userId_jobId: { userId, jobId: id } },
            data: { status: 'deleted' }
        });

        return NextResponse.json({ success: true, data });
    } catch (e: any) {
        console.error('Failed to delete job:', e);
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
