import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { headers } from 'next/headers';
import { reformatJobDescriptionWithGemini } from '@/lib/formatter';
import { scoreJob } from '@/lib/scoring';
import { logSuspiciousActivity } from '@/lib/security';
import { isDescriptionAdequate } from '@/lib/jobFetcher';

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

        if (description || applicationUrl) {
            // Allow modifying a global job's description ONLY if it doesn't currently have an adequate one
            // OR via copy-on-write when updating description.
            const isAppendingToGlobalStub = isGlobalJob && description && !isDescriptionAdequate(job.description);
            const isCopyOnWrite = isGlobalJob && !!description;

            if (!isAdmin && job.addedById !== userId && !isAppendingToGlobalStub && !isCopyOnWrite) {
                await logSuspiciousActivity({ type: 'UNAUTHORIZED_MODIFICATION_ATTEMPT', message: 'Attempted to modify a global job not owned by user', userId, metadata: { jobId: id, requestedChanges: { description: !!description, applicationUrl: !!applicationUrl } } });
                return NextResponse.json(
                    { error: 'Unauthorized to modify shared job properties. Only the original creator can edit this job.' },
                    { status: 403 }
                );
            }
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

            let targetJobId = id;
            let updatedJob;

            if (isGlobalJob) {
                // COPY ON WRITE: Create a private copy of the global job for this user
                updatedJob = await prisma.job.create({
                    data: {
                        title: job!.title || 'Unknown Title',
                        company: job!.company || 'Unknown Company',
                        location: job!.location,
                        salaryRange: job!.salaryRange,
                        requirements: job!.requirements,
                        url: job!.url,
                        source: job!.source,
                        addedById: userId,
                        description: formattedDesc
                    }
                });
                
                targetJobId = updatedJob.id;
                
                const oldUserJob = await prisma.userJob.findUnique({
                    where: { userId_jobId: { userId, jobId: id } }
                });
                
                if (oldUserJob) {
                    await prisma.userJob.create({
                        data: {
                            userId: userId,
                            jobId: targetJobId,
                            status: oldUserJob.status === 'new' ? 'discovered' : oldUserJob.status,
                            appliedAt: oldUserJob.appliedAt,
                            isArchived: oldUserJob.isArchived,
                            ipAddress: oldUserJob.ipAddress
                        }
                    });
                    
                    await prisma.userJob.delete({
                        where: { userId_jobId: { userId, jobId: id } }
                    });
                } else {
                    await prisma.userJob.create({
                        data: {
                            userId: userId,
                            jobId: targetJobId,
                            status: 'discovered'
                        }
                    });
                }
            } else {
                updatedJob = await prisma.job.update({
                    where: { id },
                    data: { description: formattedDesc }
                });

                await prisma.userJob.upsert({
                    where: { userId_jobId: { userId, jobId: id } },
                    update: { status: 'discovered' },
                    create: { userId, jobId: id, status: 'discovered' }
                });
            }

            // Trigger scoring in background so PATCH responds immediately without timing out
            scoreJob(userId, targetJobId, updatedJob.title, formattedDesc).catch((scoreErr: any) => {
                console.error("Error scoring job in background:", scoreErr);
            });

            return NextResponse.json({ success: true, newJobId: targetJobId });
        }

        if (applicationUrl) {
            await prisma.job.update({
                where: { id },
                data: { applicationUrl }
            });
        }

        if (status) {
            const updateData: any = { status };
            if (applied_at) {
                const headerStore = await headers();
                const forwardedFor = headerStore.get('x-forwarded-for');
                const ipAddress = forwardedFor ? forwardedFor.split(',')[0] : 'unknown';
                
                updateData.appliedAt = new Date(applied_at);
                updateData.ipAddress = ipAddress;
            }

            const data = await prisma.userJob.update({
                where: { userId_jobId: { userId, jobId: id } },
                data: updateData
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
